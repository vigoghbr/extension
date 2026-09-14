import { logger } from "@/libs/logger";

const OFFSCREEN_PATH = "offscreen.html";

let creating: Promise<void> | null = null;

export async function ensureOffscreenDocument(params: {
  reasons: chrome.offscreen.Reason[];
  justification: string;
}): Promise<void> {
  if (await chrome.offscreen.hasDocument()) return;
  if (creating) {
    await creating;
    return;
  }
  creating = chrome.offscreen
    .createDocument({
      url: OFFSCREEN_PATH,
      reasons: params.reasons,
      justification: params.justification,
    })
    .finally(() => {
      creating = null;
    });
  await creating;
}

export async function sendToOffscreen(message: {
  action: string;
  [key: string]: unknown;
}): Promise<void> {
  if (!(await chrome.offscreen.hasDocument())) return;
  try {
    await chrome.runtime.sendMessage(message);
  } catch (error) {
    logger.warn("offscreen:send-failed", { action: message.action, error });
  }
}

export async function closeOffscreenDocument(): Promise<void> {
  if (!(await chrome.offscreen.hasDocument())) return;
  try {
    await chrome.offscreen.closeDocument();
  } catch (error) {
    logger.warn("offscreen:close-failed", { error });
  }
}
