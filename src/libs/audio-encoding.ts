const RECORDER_MIME_TYPES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/ogg;codecs=opus",
  "audio/mp4",
];

const GEMINI_AUDIO_MIME_TYPES = [
  "audio/wav",
  "audio/mp3",
  "audio/mpeg",
  "audio/ogg",
  "audio/aac",
  "audio/flac",
  "audio/aiff",
] as const;

export function isGeminiAudioMimeType(mimeType: string): boolean {
  return (GEMINI_AUDIO_MIME_TYPES as readonly string[]).includes(mimeType);
}

export function sniffAudioMimeType(buffer: ArrayBuffer): string | null {
  const bytes = new Uint8Array(buffer, 0, Math.min(buffer.byteLength, 16));
  const ascii = (start: number, length: number) =>
    String.fromCharCode(...bytes.subarray(start, start + length));

  if (ascii(0, 4) === "OggS") return "audio/ogg";
  if (ascii(0, 4) === "fLaC") return "audio/flac";
  if (ascii(0, 4) === "FORM" && ascii(8, 4) === "AIFF") return "audio/aiff";
  if (ascii(0, 4) === "RIFF" && ascii(8, 4) === "WAVE") return "audio/wav";
  if (ascii(0, 3) === "ID3") return "audio/mpeg";
  if (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0) return "audio/mpeg";
  if (ascii(4, 4) === "ftyp") return "audio/aac";
  return null;
}

export function pickRecorderMimeType(): string | undefined {
  return RECORDER_MIME_TYPES.find((type) =>
    MediaRecorder.isTypeSupported(type),
  );
}

function bufferToWav(buffer: AudioBuffer): ArrayBuffer {
  const samples = buffer.getChannelData(0);
  const dataSize = samples.length * 2;
  const out = new ArrayBuffer(44 + dataSize);
  const view = new DataView(out);

  const writeString = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i++) {
      view.setUint8(offset + i, text.charCodeAt(i));
    }
  };

  writeString(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, buffer.sampleRate, true);
  view.setUint32(28, buffer.sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(36, "data");
  view.setUint32(40, dataSize, true);

  let offset = 44;
  for (let i = 0; i < samples.length; i++) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, clamped * 0x7fff, true);
    offset += 2;
  }

  return out;
}

export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(
      ...bytes.subarray(i, Math.min(i + chunkSize, bytes.length)),
    );
  }
  return btoa(binary);
}

export async function encodeToWav(
  arrayBuffer: ArrayBuffer,
  sampleRate: number,
  maxDurationSec?: number,
): Promise<{ base64: string; durationMs: number }> {
  const decodeContext = new AudioContext();
  let decoded: AudioBuffer;
  try {
    decoded = await decodeContext.decodeAudioData(arrayBuffer);
  } finally {
    void decodeContext.close();
  }

  const duration = maxDurationSec
    ? Math.min(decoded.duration, maxDurationSec)
    : decoded.duration;
  const frameCount = Math.ceil(duration * sampleRate);
  const offline = new OfflineAudioContext(1, frameCount, sampleRate);
  const source = offline.createBufferSource();
  source.buffer = decoded;
  source.connect(offline.destination);
  source.start();
  const rendered = await offline.startRendering();

  return {
    base64: arrayBufferToBase64(bufferToWav(rendered)),
    durationMs: Math.round(rendered.duration * 1000),
  };
}

export async function encodeBlobToWav(
  blob: Blob,
  sampleRate: number,
): Promise<{ base64: string; durationMs: number }> {
  return encodeToWav(await blob.arrayBuffer(), sampleRate);
}
