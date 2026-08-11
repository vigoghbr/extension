import { logger } from "@/libs/logger";
import type { ExtensionSettings } from "@/types";

const RE_ENCODE_MAX_ATTEMPTS = 6;
const RE_ENCODE_MIN_QUALITY = 0.3;
const RE_ENCODE_QUALITY_STEP = 0.15;
const RE_ENCODE_SCALE_STEP = 0.75;
const RE_ENCODE_BASE64_CHUNK_SIZE = 0x8000;

async function blobToBase64DataUrl(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  for (let i = 0; i < bytes.length; i += RE_ENCODE_BASE64_CHUNK_SIZE) {
    binary += String.fromCharCode(
      ...bytes.subarray(i, i + RE_ENCODE_BASE64_CHUNK_SIZE),
    );
  }
  return `data:${blob.type};base64,${btoa(binary)}`;
}

async function fitScreenshotToSize(
  dataUrl: string,
  maxBytes: number,
): Promise<string> {
  if (dataUrl.length <= maxBytes) return dataUrl;

  try {
    const sourceBlob = await (await fetch(dataUrl)).blob();
    const bitmap = await createImageBitmap(sourceBlob);

    let quality = 0.6;
    let scale = 1;
    let best = dataUrl;

    for (let attempt = 0; attempt < RE_ENCODE_MAX_ATTEMPTS; attempt++) {
      const width = Math.max(1, Math.round(bitmap.width * scale));
      const height = Math.max(1, Math.round(bitmap.height * scale));
      const canvas = new OffscreenCanvas(width, height);
      const ctx = canvas.getContext("2d");
      ctx?.drawImage(bitmap, 0, 0, width, height);
      const outBlob = await canvas.convertToBlob({
        type: "image/jpeg",
        quality,
      });
      const outDataUrl = await blobToBase64DataUrl(outBlob);
      best = outDataUrl;

      if (outDataUrl.length <= maxBytes) return outDataUrl;

      if (quality > RE_ENCODE_MIN_QUALITY) {
        quality -= RE_ENCODE_QUALITY_STEP;
      } else {
        scale *= RE_ENCODE_SCALE_STEP;
      }
    }

    return best;
  } catch (error) {
    logger.error("capture:resize-failed", { error });
    return dataUrl;
  }
}

export async function extractPageScreenshot(
  tabId: number,
  windowId: number,
  silent = false,
): Promise<string> {
  let quality = 75;
  let captureDelayMs = 150;
  let maxSizeKB = 512;
  try {
    const stored = await chrome.storage.local.get<{
      "vigogh-settings"?: ExtensionSettings;
    }>("vigogh-settings");
    const cached = stored["vigogh-settings"];
    quality = cached?.behavior?.captureQuality ?? 75;
    captureDelayMs = cached?.behavior?.captureDelayMs ?? 150;
    maxSizeKB = cached?.behavior?.pageScreenshotMaxSizeKB ?? 512;
  } catch {}

  await chrome.tabs
    .sendMessage(tabId, { action: "hide_for_capture", silent })
    .catch(() => {});
  await new Promise<void>((r) => setTimeout(r, captureDelayMs));

  try {
    const screenshot = await chrome.tabs.captureVisibleTab(windowId, {
      format: "jpeg",
      quality,
    });
    chrome.tabs
      .sendMessage(tabId, { action: "restore_after_capture", silent })
      .catch(() => {});
    if (!screenshot) {
      logger.error("capture:empty-screenshot", {
        tabId,
        windowId,
        error: new Error("captureVisibleTab resolved with an empty screenshot"),
      });
      return "";
    }
    return await fitScreenshotToSize(screenshot, maxSizeKB * 1024);
  } catch (error) {
    logger.error("capture:capture-visible-tab-failed", {
      tabId,
      windowId,
      error,
      lastError: chrome.runtime.lastError?.message,
    });
    chrome.tabs
      .sendMessage(tabId, { action: "restore_after_capture", silent })
      .catch(() => {});
    return "";
  }
}
