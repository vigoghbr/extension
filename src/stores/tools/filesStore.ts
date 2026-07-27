import { createStore } from "zustand/vanilla";
import api from "@/libs/api-dispatch";
import { getEndpoint } from "@/libs/endpoints";
import { emitErrorToastr, emitSuccessToastr, toast } from "@/libs/toast";
import type { FileItem, FilesFetchResponse, FilesUploadResponse, FilesRenameResponse, FilesDeleteResponse } from "@/types";
import { isExtensionContextValid } from "@/utils/extension-context";
import { extensionStore } from "@/stores/extensionStore";
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
  emitErrorToastr(errorCode);
  return true;
}

export function fetchFiles(): void {
  if (!isExtensionContextValid()) return;
  filesStore.setState({ status: "loading", error: null });
  sendBackgroundRequest<FilesFetchResponse>({ action: "files_fetch" }, (response) => {
    if (!response?.success) {
      if (toastErrorCode(response?.errorCode)) {
        filesStore.setState({ status: "error", error: response?.errorCode ?? response?.error ?? null });
        return;
      }
      handleToolError();
      return;
    }
    filesStore.setState({ items: response.files ?? [], status: "success", error: null });
  });
}

export function uploadFile(file: File): void {
  if (!isExtensionContextValid()) return;
  filesStore.setState({ uploadStatus: "loading" });

  const labels = extensionStore.getState().config?.aiMenu.vigoghMenu;
  const loadingId = labels?.filesUploadLoading
    ? toast.loading(labels.filesUploadLoading)
    : null;
  const dismissLoading = () => {
    if (loadingId !== null) toast.dismiss(loadingId);
  };

  const reader = new FileReader();
  reader.onload = () => {
    const base64 = (reader.result as string).split(",")[1];
    sendBackgroundRequest<FilesUploadResponse>(
      { action: "files_upload", name: file.name, mimeType: file.type, base64 },
      (response) => {
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
        emitSuccessToastr("FILE_UPLOADED");
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
  sendBackgroundRequest<FilesRenameResponse>(
    { action: "files_rename", fileId, name: trimmed },
    (response) => {
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
      emitSuccessToastr("FILE_RENAMED");
    },
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
  api
    .patch<{ data: FileItem }>(getEndpoint("filesById", { fileId }), {
      disabledForAI: nextDisabled,
    })
    .then((res) => {
      const file = res.data.data;
      filesStore.setState((s) => ({
        items: s.items.map((i) => (i.id === fileId ? file : i)),
      }));
    })
    .catch(() => {
      filesStore.setState({ items: previous });
    });
}

export function deleteFile(fileId: string): void {
  if (!isExtensionContextValid()) return;
  const previous = filesStore.getState().items;
  filesStore.setState({ items: previous.filter((i) => i.id !== fileId) });
  sendBackgroundRequest<FilesDeleteResponse>(
    { action: "files_delete", fileId },
    (response) => {
      if (!response?.success) {
        if (!toastErrorCode(response?.errorCode)) handleToolError();
        filesStore.setState({ items: previous });
        return;
      }
      emitSuccessToastr("FILE_DELETED");
    },
  );
}
