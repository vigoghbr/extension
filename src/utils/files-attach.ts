import { toastr } from "@/libs/toastr";
import { extensionStore } from "@/stores/extensionStore";
import type { FilesFetchBlobResponse } from "@/types";
import { isExtensionContextValid } from "@/utils/extension-context";
import { attachFileToPage } from "@/utils/files-inject";
import { sendBackgroundRequest } from "@/utils/runtime-request";

export interface AttachableFile {
  id: string;
  originalFilename: string;
  mimeType: string;
  downloadUrl: string;
}

let attachSuppressUntil = 0;

export function isAttachInProgress(): boolean {
  return Date.now() < attachSuppressUntil;
}

function base64ToBlob(base64: string, mimeType: string): Blob {
  const byteString = atob(base64);
  const bytes = new Uint8Array(byteString.length);
  for (let i = 0; i < byteString.length; i++)
    bytes[i] = byteString.charCodeAt(i);
  return new Blob([bytes], { type: mimeType });
}

function fetchBlob(item: AttachableFile): Promise<Blob | null> {
  return new Promise((resolve) => {
    if (!isExtensionContextValid()) {
      resolve(null);
      return;
    }
    sendBackgroundRequest<FilesFetchBlobResponse>(
      {
        action: "files_fetch_blob",
        fileId: item.id,
        downloadUrl: item.downloadUrl,
      },
      (response) => {
        if (!response?.success || !response.base64) {
          resolve(null);
          return;
        }
        resolve(
          base64ToBlob(response.base64, response.mimeType ?? item.mimeType),
        );
      },
    );
  });
}

export async function triggerAttach(item: AttachableFile): Promise<void> {
  const config = extensionStore.getState().config;
  attachSuppressUntil =
    Date.now() + (config?.behavior.filesAttachDragSuppressMs ?? 5000);

  const loadingId = toastr.loading("FILE_ATTACH_LOADING");

  const blob = await fetchBlob(item);
  if (!blob) {
    toastr.dismiss(loadingId);
    toastr.error("FILE_ATTACH_FAILED");
    return;
  }

  const ok = await attachFileToPage(blob, item.originalFilename, item.mimeType);
  toastr.dismiss(loadingId);
  if (ok) {
    attachSuppressUntil =
      Date.now() + (config?.behavior.filesAttachSuccessSuppressMs ?? 2000);
    toastr.success("FILE_ATTACHED");
    return;
  }
  toastr.neutral("FILE_ATTACH_UNAVAILABLE");
}
