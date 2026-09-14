import type { BackgroundMessageHandler } from "@/background/handlers/types";
import api, {
  extractApiErrorCode,
  isUnauthorizedError,
} from "@/libs/api-dispatch";
import { getEndpoint } from "@/libs/endpoints";
import { logger } from "@/libs/logger";
import {
  closeOffscreenDocument,
  ensureOffscreenDocument,
  sendToOffscreen,
} from "@/libs/offscreen";
import type { ExtensionSettings } from "@/types";

const SESSION_STORAGE_KEY = "vigogh-transcription-session";
const DEFAULT_MAX_DURATION_MS = 60000;
const DEFAULT_SAMPLE_RATE = 16000;

type TranscriptionSession = { tabId: number };

async function readBehavior() {
  const stored = await chrome.storage.local.get<{
    "vigogh-settings"?: ExtensionSettings;
  }>("vigogh-settings");
  const behavior = stored["vigogh-settings"]?.behavior;
  return {
    maxDurationMs:
      behavior?.transcriptionMaxDurationMs ?? DEFAULT_MAX_DURATION_MS,
    sampleRate: behavior?.transcriptionSampleRate ?? DEFAULT_SAMPLE_RATE,
  };
}

async function readTargetTabId(): Promise<number | undefined> {
  const stored = await chrome.storage.local.get<{
    [SESSION_STORAGE_KEY]?: TranscriptionSession;
  }>(SESSION_STORAGE_KEY);
  return stored[SESSION_STORAGE_KEY]?.tabId;
}

async function notifyTab(
  tabId: number,
  message: Record<string, unknown>,
): Promise<void> {
  try {
    await chrome.tabs.sendMessage(tabId, message);
  } catch (error) {
    logger.warn("transcriptions:notify-failed", {
      action: message.action,
      error,
    });
  }
}

async function releaseCapture(): Promise<void> {
  await chrome.storage.local.remove(SESSION_STORAGE_KEY);
  await sendToOffscreen({ action: "offscreen_transcription_teardown" });
  await closeOffscreenDocument();
}

async function armCapture(tabId: number | undefined): Promise<void> {
  if (!tabId) throw new Error("No target tab for transcription");

  const stored = await chrome.storage.local.get("vigogh-auth-token");
  if (!stored["vigogh-auth-token"]) {
    await notifyTab(tabId, {
      action: "transcription_result",
      success: false,
      noToken: true,
    });
    return;
  }

  await releaseCapture();

  const streamId = await chrome.tabCapture.getMediaStreamId({
    targetTabId: tabId,
  });
  const behavior = await readBehavior();

  await ensureOffscreenDocument({
    reasons: [
      chrome.offscreen.Reason.USER_MEDIA,
      chrome.offscreen.Reason.AUDIO_PLAYBACK,
    ],
    justification:
      "Record the tab audio the user asked to transcribe and play it back.",
  });
  await chrome.storage.local.set({
    [SESSION_STORAGE_KEY]: { tabId } satisfies TranscriptionSession,
  });
  await sendToOffscreen({
    action: "offscreen_transcription_prepare",
    streamId,
    ...behavior,
  });

  const tab = await chrome.tabs.get(tabId);
  logger.info("transcriptions:armed", {
    tabId,
    audible: tab.audible ?? false,
    ...behavior,
  });

  if (tab.audible) await beginCapture(tabId);
}

async function beginCapture(tabId: number): Promise<void> {
  logger.info("transcriptions:begin", { tabId });
  await sendToOffscreen({ action: "offscreen_transcription_begin" });
}

export async function handleTabAudible(
  tabId: number,
  audible: boolean,
): Promise<void> {
  if ((await readTargetTabId()) !== tabId) return;

  logger.info("transcriptions:audible-changed", { tabId, audible });
  if (audible) {
    await beginCapture(tabId);
    return;
  }
  await sendToOffscreen({ action: "offscreen_transcription_stop" });
}

export async function releaseCaptureForTab(tabId: number): Promise<void> {
  if ((await readTargetTabId()) !== tabId) return;
  logger.info("transcriptions:released", { tabId });
  await releaseCapture();
}

async function handleCaptureStarted(): Promise<void> {
  const tabId = await readTargetTabId();
  if (!tabId) return;
  await notifyTab(tabId, { action: "transcription_recording" });
}

async function handleCaptureResult(params: {
  audio?: string;
  mimeType?: string;
  durationMs?: number;
  errorCode?: string;
}): Promise<void> {
  const tabId = await readTargetTabId();
  if (!tabId) return;

  if (params.errorCode || !params.audio || !params.mimeType) {
    await notifyTab(tabId, {
      action: "transcription_result",
      success: false,
      errorCode: params.errorCode ?? "TRANSCRIPTION_CAPTURE_FAILED",
    });
    return;
  }

  await notifyTab(tabId, { action: "transcription_uploading" });

  const endpoint = getEndpoint("transcriptions");
  const startedAt = Date.now();
  logger.info("transcriptions:request", {
    endpoint,
    durationMs: params.durationMs,
    base64Length: params.audio.length,
  });

  try {
    const { data } = await api.post(endpoint, {
      audio: params.audio,
      mimeType: params.mimeType,
      durationMs: params.durationMs ?? 1,
    });
    const transcription = data.data?.transcription ?? "";
    logger.info("transcriptions:success", {
      length: transcription.length,
      elapsedMs: Date.now() - startedAt,
    });
    await notifyTab(tabId, {
      action: "transcription_result",
      success: true,
      transcription,
    });
  } catch (error) {
    const elapsedMs = Date.now() - startedAt;
    if (isUnauthorizedError(error)) {
      logger.warn("transcriptions:unauthorized", { elapsedMs });
      await notifyTab(tabId, {
        action: "transcription_result",
        success: false,
        noToken: true,
      });
      return;
    }
    const code = extractApiErrorCode(error);
    logger.error("transcriptions:request-error", { code, elapsedMs, error });
    await notifyTab(tabId, {
      action: "transcription_result",
      success: false,
      errorCode: code ?? undefined,
    });
  }
}

export const handleMessages: BackgroundMessageHandler = (
  message,
  sender,
  sendResponse,
) => {
  if (message.action === "transcription_arm") {
    armCapture(sender.tab?.id)
      .then(() => sendResponse({ success: true }))
      .catch((error: Error) => {
        logger.error("transcriptions:arm-failed", { error });
        void releaseCapture();
        sendResponse({
          success: false,
          errorCode: "TRANSCRIPTION_CAPTURE_FAILED",
        });
      });
    return true;
  }
  if (message.action === "transcription_stop") {
    sendToOffscreen({ action: "offscreen_transcription_stop" })
      .then(() => sendResponse({ success: true }))
      .catch(() => sendResponse({ success: false }));
    return true;
  }
  if (message.action === "transcription_disarm") {
    releaseCapture()
      .then(() => sendResponse({ success: true }))
      .catch(() => sendResponse({ success: false }));
    return true;
  }
  if (message.action === "transcription_capture_started") {
    handleCaptureStarted().catch(() => {});
    return false;
  }
  if (message.action === "transcription_capture_result") {
    handleCaptureResult(message).catch((error: Error) => {
      logger.error("transcriptions:result-failed", { error });
    });
    return false;
  }
  return null;
};
