import { requestLogin } from "@/utils/login-required";

type AnyResponse = { noToken?: boolean };

interface SendBackgroundRequestOptions {
  onNoToken?: () => void;
}

export function sendBackgroundRequest<T extends AnyResponse>(
  message: unknown,
  callback?: (response: T) => void,
  options?: SendBackgroundRequestOptions,
): void {
  chrome.runtime.sendMessage(message, (response: T) => {
    if (response?.noToken) {
      requestLogin();
      options?.onNoToken?.();
      return;
    }
    callback?.(response);
  });
}

export async function hasAuthToken(): Promise<boolean> {
  try {
    const stored = await chrome.storage.local.get("vigogh-auth-token");
    return Boolean(stored["vigogh-auth-token"]);
  } catch {
    return false;
  }
}
