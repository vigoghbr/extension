import type { ExtensionSettings } from "@/types";

export async function captureActiveTab(tabId: number, windowId: number): Promise<string> {
  let quality = 75;
  let captureDelayMs = 150;
  try {
    const stored = await chrome.storage.local.get<{ "vigogh-settings"?: ExtensionSettings }>(
      "vigogh-settings",
    );
    const cached = stored["vigogh-settings"];
    quality = cached?.behavior?.captureQuality ?? 75;
    captureDelayMs = cached?.behavior?.captureDelayMs ?? 150;
  } catch {}

  await chrome.tabs.sendMessage(tabId, { action: "hide_for_capture" }).catch(() => {});
  await new Promise<void>((r) => setTimeout(r, captureDelayMs));

  try {
    const screenshot = await chrome.tabs.captureVisibleTab(windowId, { format: "jpeg", quality });
    chrome.tabs.sendMessage(tabId, { action: "restore_after_capture" }).catch(() => {});
    if (!screenshot) {
      console.error("capture:empty_screenshot", { tabId, windowId });
    }
    return screenshot || "";
  } catch (error) {
    console.error("capture:capture_visible_tab_failed", {
      tabId,
      windowId,
      error: error instanceof Error ? error.message : String(error),
      lastError: chrome.runtime.lastError?.message,
    });
    chrome.tabs.sendMessage(tabId, { action: "restore_after_capture" }).catch(() => {});
    return "";
  }
}
