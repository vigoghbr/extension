import { toastr } from "@/libs/toastr";
import { extensionStore } from "@/stores/extensionStore";
import {
  hideBottomIndicator,
  showBottomIndicator,
} from "@/stores/indicatorStore";
import type { FilesDownloadResponse, FilesFetchBlobResponse } from "@/types";
import { isExtensionContextValid } from "@/utils/extension-context";
import { attachFileToPage } from "@/utils/files-inject";
import { sendBackgroundRequest } from "@/utils/runtime-request";

export interface AttachableFile {
  id: string;
  originalFilename: string;
  mimeType: string;
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

function openDownloadTab(item: AttachableFile): Promise<boolean> {
  return new Promise((resolve) => {
    if (!isExtensionContextValid()) {
      resolve(false);
      return;
    }
    sendBackgroundRequest<FilesDownloadResponse>(
      { action: "files_download", fileId: item.id },
      (response) => resolve(!!response?.success),
    );
  });
}

function fetchBlob(item: AttachableFile): Promise<Blob | null> {
  return new Promise((resolve) => {
    if (!isExtensionContextValid()) {
      resolve(null);
      return;
    }
    sendBackgroundRequest<FilesFetchBlobResponse>(
      { action: "files_fetch_blob", fileId: item.id },
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

  showBottomIndicator();
  const blob = await fetchBlob(item);
  hideBottomIndicator();
  if (!blob) {
    const opened = await openDownloadTab(item);
    toastr.dismiss(loadingId);
    if (opened) {
      toastr.success("FILE_DOWNLOADED");
      return;
    }
    toastr.error("FILE_ATTACH_FAILED");
    return;
  }

  const ok = await attachFileToPage(blob, item.originalFilename, item.mimeType);
  if (ok) {
    toastr.dismiss(loadingId);
    attachSuppressUntil =
      Date.now() + (config?.behavior.filesAttachSuccessSuppressMs ?? 2000);
    toastr.success("FILE_ATTACHED");
    return;
  }

  const opened = await openDownloadTab(item);
  toastr.dismiss(loadingId);
  if (opened) {
    toastr.success("FILE_DOWNLOADED");
    return;
  }
  toastr.neutral("FILE_ATTACH_UNAVAILABLE");
}
