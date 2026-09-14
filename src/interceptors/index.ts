import { installAudioInterceptor } from "./audio";

const MARKER = "__vigoghInterceptors";

function install(): void {
  const globalScope = window as unknown as Record<string, unknown>;
  if (globalScope[MARKER]) return;
  globalScope[MARKER] = true;

  installAudioInterceptor();
}

install();
