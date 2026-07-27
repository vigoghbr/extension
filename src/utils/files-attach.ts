import { toast } from "@/libs/toast";
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
  const labels = config?.aiMenu.vigoghMenu;

  const loadingId = labels?.filesAttachLoading
    ? toast.loading(labels.filesAttachLoading)
    : null;

  const blob = await fetchBlob(item);
  if (!blob) {
    if (loadingId !== null) toast.dismiss(loadingId);
    if (labels?.filesAttachFailed) toast.error(labels.filesAttachFailed);
    return;
  }

  const ok = await attachFileToPage(blob, item.originalFilename, item.mimeType);
  if (loadingId !== null) toast.dismiss(loadingId);
  if (ok) {
    attachSuppressUntil =
      Date.now() + (config?.behavior.filesAttachSuccessSuppressMs ?? 2000);
    if (labels?.filesAttachSuccess) toast.success(labels.filesAttachSuccess);
    return;
  }
  if (labels?.filesAttachUnavailable) toast.show(labels.filesAttachUnavailable);
}
