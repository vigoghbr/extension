import { createStore } from "zustand/vanilla";
import api from "@/libs/api-dispatch";
import { getEndpoint } from "@/libs/endpoints";
import { toastr } from "@/libs/toastr";
import { extensionStore } from "@/stores/extensionStore";
import {
  hideBottomIndicator,
  hideTopIndicator,
  showBottomIndicator,
  showTopIndicator,
} from "@/stores/indicatorStore";
import type {
  FileItem,
  FilesDeleteResponse,
  FilesFetchResponse,
  FilesRenameResponse,
  FilesUploadResponse,
} from "@/types";
import { isExtensionContextValid } from "@/utils/extension-context";
import { sendBackgroundRequest } from "@/utils/runtime-request";
import { handleToolError } from "@/utils/tool-error";

type AsyncStatus = "idle" | "loading" | "success" | "error";

interface FilesState {
  items: FileItem[];
  status: AsyncStatus;
  uploadStatus: AsyncStatus;
  error: string | null;
}

export const filesStore = createStore<FilesState>()(() => ({
  items: [],
  status: "idle",
  uploadStatus: "idle",
  error: null,
}));

function toastErrorCode(errorCode: string | undefined): boolean {
  if (!errorCode) return false;
  const map = extensionStore.getState().config?.messages.errors;
  const hasMessage = !!(map && (map[errorCode] || map.DEFAULT));
  if (!hasMessage) return false;
  toastr.error(errorCode);
  return true;
}

export function fetchFiles(): void {
  if (!isExtensionContextValid()) return;
  filesStore.setState({ status: "loading", error: null });
  showBottomIndicator();
  sendBackgroundRequest<FilesFetchResponse>(
    { action: "files_fetch" },
    (response) => {
      hideBottomIndicator();
      if (!response?.success) {
        if (toastErrorCode(response?.errorCode)) {
          filesStore.setState({
            status: "error",
            error: response?.errorCode ?? response?.error ?? null,
          });
          return;
        }
        handleToolError();
        return;
      }
      filesStore.setState({
        items: response.files ?? [],
        status: "success",
        error: null,
      });
    },
    { onNoToken: hideBottomIndicator },
  );
}

export function uploadFile(file: File): void {
  if (!isExtensionContextValid()) return;
  filesStore.setState({ uploadStatus: "loading" });

  const loadingId = toastr.loading("FILE_UPLOAD_LOADING");
  const dismissLoading = () => {
    toastr.dismiss(loadingId);
  };

  const reader = new FileReader();
  reader.onload = () => {
    const base64 = (reader.result as string).split(",")[1];
    showTopIndicator();
    sendBackgroundRequest<FilesUploadResponse>(
      { action: "files_upload", name: file.name, mimeType: file.type, base64 },
      (response) => {
        hideTopIndicator();
        if (!response?.success) {
          dismissLoading();
          if (toastErrorCode(response?.errorCode)) {
            filesStore.setState({ uploadStatus: "error" });
            return;
          }
          handleToolError();
          return;
        }
        dismissLoading();
        toastr.success("FILE_UPLOADED");
        if (response.file) {
          filesStore.setState((s) => ({
            uploadStatus: "success",
            items: [response.file as FileItem, ...s.items],
          }));
          fetchFiles();
          return;
        }
        filesStore.setState({ uploadStatus: "success" });
        const behavior = extensionStore.getState().config?.behavior;
        const pollAttempts = behavior?.filesUploadPollAttempts ?? 5;
        const pollIntervalMs = behavior?.filesUploadPollIntervalMs ?? 1500;
        let attempts = 0;
        const poll = () => {
          attempts += 1;
          fetchFiles();
          if (attempts < pollAttempts) setTimeout(poll, pollIntervalMs);
        };
        setTimeout(poll, pollIntervalMs);
      },
      { onNoToken: hideTopIndicator },
    );
  };
  reader.readAsDataURL(file);
}

export function renameFile(fileId: string, name: string): void {
  if (!isExtensionContextValid()) return;
  const trimmed = name.trim();
  if (!trimmed) return;
  filesStore.setState((s) => ({
    items: s.items.map((i) => (i.id === fileId ? { ...i, name: trimmed } : i)),
  }));
  showBottomIndicator();
  sendBackgroundRequest<FilesRenameResponse>(
    { action: "files_rename", fileId, name: trimmed },
    (response) => {
      hideBottomIndicator();
      if (!response?.success) {
        if (!toastErrorCode(response?.errorCode)) handleToolError();
        fetchFiles();
        return;
      }
      if (response.file) {
        const file = response.file;
        filesStore.setState((s) => ({
          items: s.items.map((i) => (i.id === fileId ? file : i)),
        }));
      }
      toastr.success("FILE_RENAMED");
    },
    { onNoToken: hideBottomIndicator },
  );
}

export function toggleFileAI(fileId: string): void {
  if (!isExtensionContextValid()) return;
  const previous = filesStore.getState().items;
  const current = previous.find((i) => i.id === fileId);
  if (!current) return;
  const nextDisabled = !(current.disabledForAI ?? false);
  filesStore.setState({
    items: previous.map((i) =>
      i.id === fileId ? { ...i, disabledForAI: nextDisabled } : i,
    ),
  });
  showBottomIndicator();
  api
    .patch<{ data: FileItem }>(getEndpoint("filesById", { id: fileId }), {
      disabledForAI: nextDisabled,
    })
    .then((res) => {
      const file = res.data.data;
      filesStore.setState((s) => ({
        items: s.items.map((i) => (i.id === fileId ? file : i)),
      }));
      hideBottomIndicator();
    })
    .catch(() => {
      filesStore.setState({ items: previous });
      hideBottomIndicator();
    });
}

export function deleteFile(fileId: string): void {
  if (!isExtensionContextValid()) return;
  const previous = filesStore.getState().items;
  filesStore.setState({ items: previous.filter((i) => i.id !== fileId) });
  showBottomIndicator();
  sendBackgroundRequest<FilesDeleteResponse>(
    { action: "files_delete", fileId },
    (response) => {
      hideBottomIndicator();
      if (!response?.success) {
        if (!toastErrorCode(response?.errorCode)) handleToolError();
        filesStore.setState({ items: previous });
        return;
      }
      toastr.success("FILE_DELETED");
    },
    { onNoToken: hideBottomIndicator },
  );
}
