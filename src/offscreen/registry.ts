import { createAudioCaptureModule } from "@/offscreen/audio-capture";
import type { OffscreenModuleFactory } from "@/offscreen/types";

export const offscreenModules: OffscreenModuleFactory[] = [
  createAudioCaptureModule,
];
