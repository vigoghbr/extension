import { encodeBlobToWav, pickRecorderMimeType } from "@/libs/audio-encoding";
import { logger } from "@/libs/logger";
import type {
  OffscreenModule,
  OffscreenModuleContext,
} from "@/offscreen/types";
import type { ExtensionMessage } from "@/types";

const DEFAULT_MAX_DURATION_MS = 60000;
const DEFAULT_SAMPLE_RATE = 16000;
const MIN_RECORDING_MS = 400;

const ACTIONS = [
  "offscreen_transcription_prepare",
  "offscreen_transcription_begin",
  "offscreen_transcription_stop",
  "offscreen_transcription_teardown",
] as const;

interface CaptureSession {
  recorder: MediaRecorder;
  stream: MediaStream;
  audioContext: AudioContext;
  chunks: Blob[];
  sampleRate: number;
  maxDurationMs: number;
  limitTimer: ReturnType<typeof setTimeout> | null;
  startedAt: number;
}

function notifyBackground(payload: Record<string, unknown>): void {
  chrome.runtime.sendMessage(payload);
}

export function createAudioCaptureModule(
  context: OffscreenModuleContext,
): OffscreenModule {
  let session: CaptureSession | null = null;

  function clearLimitTimer(): void {
    if (!session?.limitTimer) return;
    clearTimeout(session.limitTimer);
    session.limitTimer = null;
  }

  function teardown(): void {
    if (!session) return;
    clearLimitTimer();
    if (session.recorder.state === "recording") session.recorder.stop();
    for (const track of session.stream.getTracks()) track.stop();
    void session.audioContext.close();
    session = null;
    logger.info("offscreen:capture-teardown", {});
    context.notifyIdle();
  }

  async function finishCapture(
    recorded: Blob[],
    mimeType: string,
    sampleRate: number,
  ): Promise<void> {
    const blob = new Blob(recorded, { type: mimeType });
    logger.info("offscreen:capture-finished", {
      chunks: recorded.length,
      blobSize: blob.size,
    });

    if (blob.size === 0) {
      notifyBackground({
        action: "transcription_capture_result",
        errorCode: "TRANSCRIPTION_EMPTY",
      });
      return;
    }

    try {
      const { base64, durationMs } = await encodeBlobToWav(blob, sampleRate);
      logger.info("offscreen:encoded", {
        durationMs,
        sampleRate,
        base64Length: base64.length,
      });
      notifyBackground({
        action: "transcription_capture_result",
        audio: base64,
        mimeType: "audio/wav",
        durationMs: Math.max(durationMs, 1),
      });
    } catch (error) {
      logger.error("offscreen:encode-failed", { error });
      notifyBackground({
        action: "transcription_capture_result",
        errorCode: "TRANSCRIPTION_CAPTURE_FAILED",
      });
    }
  }

  function begin(): void {
    if (!session) {
      logger.warn("offscreen:begin-ignored", { reason: "no-session" });
      return;
    }
    if (session.recorder.state === "recording") {
      logger.debug("offscreen:begin-ignored", { reason: "already-recording" });
      return;
    }

    const active = session;
    active.chunks.length = 0;
    active.startedAt = Date.now();
    active.recorder.start();
    active.limitTimer = setTimeout(() => {
      if (active.recorder.state === "recording") {
        logger.info("offscreen:stop", { reason: "duration-limit" });
        active.recorder.stop();
      }
    }, active.maxDurationMs);

    logger.info("offscreen:recording-started", {
      mimeType: active.recorder.mimeType,
    });
    notifyBackground({ action: "transcription_capture_started" });
  }

  function stop(): void {
    if (session?.recorder.state !== "recording") {
      logger.debug("offscreen:stop-ignored", {
        recorderState: session?.recorder.state ?? "no-session",
      });
      return;
    }
    const elapsed = Date.now() - session.startedAt;
    if (elapsed < MIN_RECORDING_MS) {
      logger.debug("offscreen:stop-deferred", { elapsed });
      setTimeout(stop, MIN_RECORDING_MS - elapsed);
      return;
    }
    clearLimitTimer();
    logger.info("offscreen:stop", { reason: "tab-silent", elapsed });
    session.recorder.stop();
  }

  async function prepare(params: {
    streamId: string;
    maxDurationMs: number;
    sampleRate: number;
  }): Promise<void> {
    teardown();

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        mandatory: {
          chromeMediaSource: "tab",
          chromeMediaSourceId: params.streamId,
        },
      },
    } as unknown as MediaStreamConstraints);

    const audioContext = new AudioContext();
    if (audioContext.state === "suspended") await audioContext.resume();
    audioContext
      .createMediaStreamSource(stream)
      .connect(audioContext.destination);

    const mimeType = pickRecorderMimeType();
    const recorder = new MediaRecorder(
      stream,
      mimeType ? { mimeType } : undefined,
    );
    const chunks: Blob[] = [];
    const sampleRate = params.sampleRate;

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunks.push(event.data);
    };
    recorder.onerror = (event) => {
      logger.error("offscreen:recorder-error", { error: event });
      notifyBackground({
        action: "transcription_capture_result",
        errorCode: "TRANSCRIPTION_CAPTURE_FAILED",
      });
    };
    recorder.onstop = () => {
      clearLimitTimer();
      const recorded = chunks.splice(0, chunks.length);
      void finishCapture(recorded, recorder.mimeType, sampleRate);
    };

    for (const track of stream.getAudioTracks()) {
      track.onended = () => {
        logger.warn("offscreen:track-ended", {});
        if (recorder.state === "recording") recorder.stop();
      };
    }

    session = {
      recorder,
      stream,
      audioContext,
      chunks,
      sampleRate,
      maxDurationMs: params.maxDurationMs,
      limitTimer: null,
      startedAt: 0,
    };

    logger.info("offscreen:capture-prepared", {
      mimeType: recorder.mimeType,
      audioTracks: stream.getAudioTracks().length,
      contextState: audioContext.state,
      maxDurationMs: params.maxDurationMs,
    });
  }

  return {
    id: "audio-capture",
    actions: ACTIONS,
    isActive: () => session !== null,
    teardown,
    handle(message: ExtensionMessage) {
      if (message.action === "offscreen_transcription_prepare") {
        prepare({
          streamId: message.streamId,
          maxDurationMs: message.maxDurationMs || DEFAULT_MAX_DURATION_MS,
          sampleRate: message.sampleRate || DEFAULT_SAMPLE_RATE,
        }).catch((error) => {
          logger.error("offscreen:prepare-failed", { error });
          teardown();
          notifyBackground({
            action: "transcription_capture_result",
            errorCode: "TRANSCRIPTION_CAPTURE_FAILED",
          });
        });
        return;
      }
      if (message.action === "offscreen_transcription_begin") begin();
      if (message.action === "offscreen_transcription_stop") stop();
      if (message.action === "offscreen_transcription_teardown") teardown();
    },
  };
}
