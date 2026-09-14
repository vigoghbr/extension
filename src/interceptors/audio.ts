type ProbePayload = Record<string, unknown>;

let armed = false;
let encodedByBuffer = new WeakMap<AudioBuffer, ArrayBuffer>();

function report(event: string, data: ProbePayload): void {
  try {
    window.postMessage({ __vigoghProbe: true, event, data }, "*");
  } catch {}
}

function setArmed(next: boolean): void {
  armed = next;
  if (!next) encodedByBuffer = new WeakMap();
}

function deliver(encoded: ArrayBuffer, durationSec: number): void {
  try {
    window.postMessage({ __vigoghCapture: true, encoded, durationSec }, "*", [
      encoded,
    ]);
  } catch {
    try {
      window.postMessage({ __vigoghCapture: true, encoded, durationSec }, "*");
    } catch {}
  }
}

function srcScheme(value: string | null | undefined): string {
  if (!value) return "none";
  return value.split(":")[0] || "none";
}

export function installAudioInterceptor(): void {
  window.addEventListener("message", (event) => {
    if (event.source !== window) return;
    const payload = event.data as { __vigoghInterceptor?: string } | undefined;
    if (payload?.__vigoghInterceptor === "arm") setArmed(true);
    if (payload?.__vigoghInterceptor === "disarm") setArmed(false);
  });

  try {
    const base = BaseAudioContext.prototype;
    const original = base.decodeAudioData;
    base.decodeAudioData = function patched(
      this: BaseAudioContext,
      data: ArrayBuffer,
      ...rest: unknown[]
    ) {
      const copy = armed && data?.byteLength ? data.slice(0) : null;
      const result = (
        original as unknown as (
          this: BaseAudioContext,
          ...args: unknown[]
        ) => unknown
      ).call(this, data, ...rest);
      if (result instanceof Promise && copy) {
        result
          .then((buffer: AudioBuffer) => {
            if (!armed) return;
            encodedByBuffer.set(buffer, copy);
            report("decode-audio-data-done", {
              byteLength: copy.byteLength,
              durationSec: Number(buffer.duration.toFixed(2)),
            });
          })
          .catch(() => {});
      }
      return result;
    } as typeof base.decodeAudioData;
  } catch (error) {
    report("patch-failed", { api: "decodeAudioData", error: String(error) });
  }

  try {
    const proto = AudioBufferSourceNode.prototype;
    const original = proto.start;
    proto.start = function patched(
      this: AudioBufferSourceNode,
      ...args: unknown[]
    ) {
      const result = (
        original as unknown as (
          this: AudioBufferSourceNode,
          ...args: unknown[]
        ) => void
      ).apply(this, args);

      if (!armed) return result;
      const buffer = this.buffer;
      const encoded = buffer ? encodedByBuffer.get(buffer) : undefined;
      if (!buffer || !encoded) {
        report("capture-missed", {
          reason: buffer ? "no-encoded-source" : "no-buffer",
        });
        return result;
      }

      report("capture-hit", {
        byteLength: encoded.byteLength,
        durationSec: Number(buffer.duration.toFixed(2)),
      });
      setArmed(false);
      deliver(encoded, buffer.duration);
      return result;
    } as typeof proto.start;
  } catch (error) {
    report("patch-failed", {
      api: "AudioBufferSourceNode.start",
      error: String(error),
    });
  }

  try {
    const proto = HTMLMediaElement.prototype;
    const original = proto.play;
    proto.play = function patched(this: HTMLMediaElement) {
      const promise = original.apply(this);
      if (!armed) return promise;

      const source = this.currentSrc || this.src;
      report("media-play", {
        tag: this.tagName,
        srcScheme: srcScheme(source),
        durationSec: Number.isFinite(this.duration)
          ? Number(this.duration.toFixed(2))
          : 0,
      });

      if (srcScheme(source) !== "blob") return promise;
      const duration = Number.isFinite(this.duration) ? this.duration : 0;
      setArmed(false);
      fetch(source)
        .then((response) => response.arrayBuffer())
        .then((encoded) => {
          report("capture-hit", {
            byteLength: encoded.byteLength,
            durationSec: duration,
          });
          deliver(encoded, duration);
        })
        .catch((error) => {
          setArmed(true);
          report("capture-missed", {
            reason: "blob-fetch-failed",
            error: String(error),
          });
        });
      return promise;
    };
  } catch (error) {
    report("patch-failed", {
      api: "HTMLMediaElement.play",
      error: String(error),
    });
  }

  report("installed", {});
}
