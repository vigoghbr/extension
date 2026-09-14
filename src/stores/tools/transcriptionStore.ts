import { createStore } from "zustand/vanilla";
import {
  arrayBufferToBase64,
  encodeToWav,
  isGeminiAudioMimeType,
  sniffAudioMimeType,
} from "@/libs/audio-encoding";
import { logger } from "@/libs/logger";
import { openPlansScreen } from "@/libs/sidepanel";
import { toast, toastr } from "@/libs/toastr";
import { touchToolActivity } from "@/libs/tool-inactivity-timer";
import { extensionStore } from "@/stores/extensionStore";
import type { TranscriptionResponse } from "@/types";
import { isExtensionContextValid } from "@/utils/extension-context";
import { onLoginRequired, requestLogin } from "@/utils/login-required";
import { hasAuthToken, sendBackgroundRequest } from "@/utils/runtime-request";

type TranscriptionStatus = "idle" | "armed" | "recording" | "loading";

const DEFAULT_MAX_TOAST_DURATION_MS = 15000;
const DEFAULT_MAX_DURATION_MS = 60000;
const DEFAULT_SAMPLE_RATE = 16000;
const ARMED_TOAST_ID = "vigogh-transcription-armed";
const CAPTURING_TOAST_ID = "vigogh-transcription-capturing";
const PROCESSING_TOAST_ID = "vigogh-transcription-processing";

interface TranscriptionState {
  status: TranscriptionStatus;
  errorCode: string | null;
}

export const transcriptionStore = createStore<TranscriptionState>()(() => ({
  status: "idle",
  errorCode: null,
}));

function currentStatus(): TranscriptionStatus {
  return transcriptionStore.getState().status;
}

function behavior() {
  return extensionStore.getState().config?.behavior;
}

function getResultToastDurationMs(): number {
  return behavior()?.toastMaxDurationMs ?? DEFAULT_MAX_TOAST_DURATION_MS;
}

function getMaxDurationMs(): number {
  return behavior()?.transcriptionMaxDurationMs ?? DEFAULT_MAX_DURATION_MS;
}

function getSampleRate(): number {
  return behavior()?.transcriptionSampleRate ?? DEFAULT_SAMPLE_RATE;
}

function signalInterceptor(state: "arm" | "disarm"): void {
  window.postMessage({ __vigoghInterceptor: state }, "*");
}

export function resyncInterceptor(): void {
  if (currentStatus() !== "armed") return;
  signalInterceptor("arm");
}

export function receiveInterceptedAudio(
  encoded: ArrayBuffer,
  durationSec: number,
): void {
  if (currentStatus() !== "armed") {
    logger.debug("transcription:intercept-ignored", {
      status: currentStatus(),
    });
    return;
  }

  transcriptionStore.setState({ status: "loading", errorCode: null });
  toastr.dismiss(ARMED_TOAST_ID);
  toastr.loading("TRANSCRIPTION_PROCESSING", { id: PROCESSING_TOAST_ID });
  touchToolActivity();
  sendBackgroundRequest({ action: "transcription_disarm" });

  const maxDurationSec = getMaxDurationMs() / 1000;
  const sniffed = sniffAudioMimeType(encoded);
  const withinCap = durationSec > 0 && durationSec <= maxDurationSec;
  const canSendAsIs =
    sniffed !== null && isGeminiAudioMimeType(sniffed) && withinCap;

  logger.info("transcription:intercepted", {
    byteLength: encoded.byteLength,
    durationSec: Number(durationSec.toFixed(2)),
    sniffed,
    canSendAsIs,
  });

  if (canSendAsIs) {
    uploadAudio(
      arrayBufferToBase64(encoded),
      sniffed as string,
      Math.round(durationSec * 1000),
    );
    return;
  }

  encodeToWav(encoded, getSampleRate(), maxDurationSec)
    .then(({ base64, durationMs }) => {
      uploadAudio(base64, "audio/wav", Math.max(durationMs, 1));
    })
    .catch((error) => {
      logger.error("transcription:transcode-failed", { error });
      dismissToasts();
      toastr.error("TRANSCRIPTION_CAPTURE_FAILED");
      transcriptionStore.setState({
        status: "idle",
        errorCode: "TRANSCRIPTION_CAPTURE_FAILED",
      });
    });
}

function uploadAudio(
  audio: string,
  mimeType: string,
  durationMs: number,
): void {
  logger.info("transcription:uploading", {
    mimeType,
    durationMs,
    base64Length: audio.length,
  });
  sendBackgroundRequest<TranscriptionResponse>(
    { action: "transcription_request", audio, mimeType, durationMs },
    (response) => {
      dismissToasts();
      if (chrome.runtime.lastError) {
        toastr.error("TRANSCRIPTION_CAPTURE_FAILED");
        transcriptionStore.setState({ status: "idle", errorCode: null });
        return;
      }
      receiveTranscriptionResult(response);
    },
    { onNoToken: () => disarmTranscription(false) },
  );
}

function dismissToasts(): void {
  toastr.dismiss(ARMED_TOAST_ID);
  toastr.dismiss(CAPTURING_TOAST_ID);
  toastr.dismiss(PROCESSING_TOAST_ID);
}

function rearmAfterResult(errorCode: string | null): void {
  if (currentStatus() === "idle") return;
  transcriptionStore.setState({ status: "armed", errorCode });
  toastr.persistent("TRANSCRIPTION_ARMED", ARMED_TOAST_ID);
  touchToolActivity();
}

export function armTranscription(): void {
  if (!isExtensionContextValid()) return;

  transcriptionStore.setState({ status: "armed", errorCode: null });
  toastr.persistent("TRANSCRIPTION_ARMED", ARMED_TOAST_ID);
  touchToolActivity();

  sendBackgroundRequest<TranscriptionResponse>(
    { action: "transcription_arm" },
    (response) => {
      if (currentStatus() === "idle") return;
      if (chrome.runtime.lastError || !response?.success) {
        const code = response?.errorCode ?? "TRANSCRIPTION_CAPTURE_FAILED";
        logger.error("transcription:arm-failed", {
          code,
          lastError: chrome.runtime.lastError?.message,
        });
        dismissToasts();
        toastr.error(code);
        transcriptionStore.setState({ status: "idle", errorCode: code });
        return;
      }
      signalInterceptor("arm");
      logger.info("transcription:armed", {});
    },
    { onNoToken: () => disarmTranscription(false) },
  );
}

export function disarmTranscription(notify = true): void {
  const wasActive = currentStatus() !== "idle";
  logger.info("transcription:disarmed", { wasActive, notify });

  dismissToasts();
  transcriptionStore.setState({ status: "idle", errorCode: null });
  signalInterceptor("disarm");

  if (wasActive && isExtensionContextValid()) {
    sendBackgroundRequest({ action: "transcription_disarm" });
  }
  if (wasActive && notify) toastr.info("TRANSCRIPTION_DISABLED");
}

export function toggleTranscription(): void {
  if (!isExtensionContextValid()) return;

  const status = currentStatus();
  logger.info("transcription:toggled", { status });

  if (status === "recording") {
    transcriptionStore.setState({ status: "loading" });
    touchToolActivity();
    sendBackgroundRequest({ action: "transcription_stop" });
    return;
  }
  if (status !== "idle") {
    disarmTranscription();
    return;
  }

  hasAuthToken().then((authed) => {
    if (!authed) {
      requestLogin();
      return;
    }
    armTranscription();
  });
}

export function receiveTranscriptionRecording(): void {
  if (currentStatus() !== "armed") return;
  logger.info("transcription:recording", {});
  transcriptionStore.setState({ status: "recording", errorCode: null });
  toastr.dismiss(ARMED_TOAST_ID);
  toastr.loading("TRANSCRIPTION_CAPTURING", { id: CAPTURING_TOAST_ID });
  touchToolActivity();
}

export function receiveTranscriptionUploading(): void {
  logger.info("transcription:uploading", { status: currentStatus() });
  transcriptionStore.setState({ status: "loading" });
  toastr.dismiss(ARMED_TOAST_ID);
  toastr.dismiss(CAPTURING_TOAST_ID);
  toastr.loading("TRANSCRIPTION_PROCESSING", { id: PROCESSING_TOAST_ID });
  touchToolActivity();
}

export function receiveTranscriptionResult(
  response: TranscriptionResponse,
): void {
  logger.info("transcription:result", {
    success: response?.success ?? false,
    errorCode: response?.errorCode,
    length: response?.transcription?.length ?? 0,
  });
  dismissToasts();

  if (response?.noToken) {
    disarmTranscription(false);
    requestLogin();
    return;
  }

  if (!response?.success || !response.transcription) {
    const code = response?.errorCode ?? "TRANSCRIPTION_EMPTY";
    toastr.error(code);
    if (code === "SUBSCRIPTION_REQUIRED") {
      disarmTranscription(false);
      void openPlansScreen();
      return;
    }
    if (code === "USAGE_LIMIT_EXCEEDED" || code === "TRIAL_EXPIRED") {
      disarmTranscription(false);
      return;
    }
    rearmAfterResult(code);
    return;
  }

  toast.show(response.transcription, { duration: getResultToastDurationMs() });
  disarmTranscription(false);
}

onLoginRequired(() => disarmTranscription(false));
