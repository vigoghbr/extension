import type { BackgroundMessageHandler } from "@/background/handlers/types";
import api, {
  extractApiErrorCode,
  isUnauthorizedError,
} from "@/libs/api-dispatch";
import { getEndpoint } from "@/libs/endpoints";

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function respondFromApiError(
  error: unknown,
  sendResponse: (response: unknown) => void,
): void {
  if (isUnauthorizedError(error)) {
    sendResponse({ success: false, noToken: true });
    return;
  }
  const code = extractApiErrorCode(error);
  if (code) {
    sendResponse({ success: false, errorCode: code });
    return;
  }
  sendResponse({ success: false, error: "API error" });
}

export const handleMessages: BackgroundMessageHandler = (
  message,
  _sender,
  sendResponse,
) => {
  if (message.action === "files_fetch") {
    api
      .get(getEndpoint("files"))
      .then(({ data }) =>
        sendResponse({ success: true, files: data.data?.files ?? [] }),
      )
      .catch((error) => respondFromApiError(error, sendResponse));
    return true;
  }
  if (message.action === "files_upload") {
    (async () => {
      try {
        const byteString = atob(message.base64);
        const bytes = new Uint8Array(byteString.length);
        for (let i = 0; i < byteString.length; i++)
          bytes[i] = byteString.charCodeAt(i);
        const blob = new Blob([bytes], { type: message.mimeType });
        await api.put(getEndpoint("files"), blob, {
          headers: {
            "Content-Type": message.mimeType,
            "X-Vigogh-File-Name": encodeURIComponent(message.name),
          },
        });
        sendResponse({ success: true, pending: true });
      } catch (error) {
        console.log("files_upload:error", error);
        respondFromApiError(error, sendResponse);
      }
    })();
    return true;
  }
  if (message.action === "files_rename") {
    api
      .patch(getEndpoint("filesById", { fileId: message.fileId }), { name: message.name })
      .then(({ data }) => sendResponse({ success: true, file: data.data }))
      .catch((error) => respondFromApiError(error, sendResponse));
    return true;
  }
  if (message.action === "files_fetch_blob") {
    (async () => {
      try {
        const fileResponse = await fetch(message.downloadUrl);
        if (!fileResponse.ok) {
          sendResponse({ success: false, error: "Storage download failed" });
          return;
        }
        const buffer = await fileResponse.arrayBuffer();
        sendResponse({ success: true, base64: arrayBufferToBase64(buffer) });
      } catch (error) {
        console.log("files_fetch_blob:error", error);
        respondFromApiError(error, sendResponse);
      }
    })();
    return true;
  }
  if (message.action === "files_delete") {
    api
      .delete(getEndpoint("filesById", { fileId: message.fileId }))
      .then(() => sendResponse({ success: true }))
      .catch((error) => respondFromApiError(error, sendResponse));
    return true;
  }
  return null;
};
