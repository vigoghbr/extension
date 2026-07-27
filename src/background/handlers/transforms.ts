import type { BackgroundMessageHandler } from "@/background/handlers/types";
import api, {
  extractApiErrorCode,
  isUnauthorizedError,
} from "@/libs/api-dispatch";
import { getEndpoint } from "@/libs/endpoints";
import type { ToolResponse } from "@/types";

async function handleTextTransformRequest(
  text: string,
  action: string,
): Promise<ToolResponse> {
  const stored = await chrome.storage.local.get("vigogh-auth-token");
  if (!stored["vigogh-auth-token"]) {
    return { success: false, noToken: true };
  }

  try {
    const { data } = await api.post(getEndpoint("transforms"), {
      text,
      action,
    });
    return { success: true, suggestions: data.data?.suggestions || [] };
  } catch (error) {
    if (isUnauthorizedError(error)) {
      return { success: false, noToken: true };
    }
    const code = extractApiErrorCode(error);
    if (code) {
      return { success: false, errorCode: code };
    }
    return { success: false, error: "API error" };
  }
}

async function handleSidepanelTextTransform(
  action: string,
): Promise<ToolResponse> {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const tab = tabs[0];
  if (!tab?.id) return { success: false, error: "No active tab" };

  let selectedText = "";
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => window.getSelection()?.toString() ?? "",
    });
    selectedText = (results[0]?.result as string) ?? "";
  } catch {
    return { success: false, error: "Cannot access page" };
  }

  if (!selectedText.trim()) {
    return { success: false, error: "no_selection" };
  }

  const transformResult = await handleTextTransformRequest(
    selectedText.trim(),
    action,
  );
  if (!transformResult.success || !transformResult.suggestions?.length) {
    return { success: false, error: transformResult.error };
  }

  const resultText = transformResult.suggestions[0];

  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: (newText: string) => {
        const active = document.activeElement as HTMLElement | null;
        const selection = window.getSelection();
        const target =
          active &&
          (active.isContentEditable ||
            active.tagName === "INPUT" ||
            active.tagName === "TEXTAREA")
            ? active
            : ((selection && selection.rangeCount > 0
                ? (selection.getRangeAt(0).startContainer
                    .parentElement as HTMLElement | null)
                : null) ?? document.body);

        const dt = new DataTransfer();
        dt.setData("text/plain", newText);
        const pasteEvent = new ClipboardEvent("paste", {
          bubbles: true,
          cancelable: true,
          clipboardData: dt,
        });
        try {
          Object.defineProperty(pasteEvent, "clipboardData", { value: dt });
        } catch {}

        const handled = !target.dispatchEvent(pasteEvent);
        if (handled) return;

        if (
          target instanceof HTMLInputElement ||
          target instanceof HTMLTextAreaElement
        ) {
          const start = target.selectionStart ?? target.value.length;
          const end = target.selectionEnd ?? start;
          const proto =
            target instanceof HTMLTextAreaElement
              ? HTMLTextAreaElement.prototype
              : HTMLInputElement.prototype;
          const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
          const newValue =
            target.value.slice(0, start) + newText + target.value.slice(end);
          if (setter) setter.call(target, newValue);
          else target.value = newValue;
          target.selectionStart = start + newText.length;
          target.selectionEnd = start + newText.length;
          target.dispatchEvent(new Event("input", { bubbles: true }));
          target.dispatchEvent(new Event("change", { bubbles: true }));
          return;
        }

        document.execCommand("insertText", false, newText);
      },
      args: [resultText],
    });
  } catch {
    return { success: false, error: "Cannot modify page" };
  }

  return { success: true };
}

export const handleMessages: BackgroundMessageHandler = (
  message,
  _sender,
  sendResponse,
) => {
  if (message.action === "transforms_request") {
    handleTextTransformRequest(message.text, message.transformAction)
      .then(sendResponse)
      .catch((error: Error) => {
        console.error("Background: Transforms request failed:", error);
        sendResponse({ success: false, error: error.message });
      });
    return true;
  }
  if (message.action === "sidepanel_transforms_request") {
    handleSidepanelTextTransform(message.transformAction)
      .then(sendResponse)
      .catch((error: Error) => {
        console.error(
          "Background: Sidepanel transforms request failed:",
          error,
        );
        sendResponse({ success: false, error: error.message });
      });
    return true;
  }
  return null;
};
