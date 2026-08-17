import { extensionStore } from "@/stores/extensionStore";

const DEFAULT_TOOL_INACTIVITY_TIMEOUT_MS = 300000;

let timer: ReturnType<typeof setTimeout> | null = null;
let isActiveFn: () => boolean = () => false;
let onExpireFn: () => void = () => {};

function getInactivityTimeoutMs(): number {
  return (
    extensionStore.getState().config?.behavior.toolInactivityTimeoutMs ??
    DEFAULT_TOOL_INACTIVITY_TIMEOUT_MS
  );
}

export function configureToolInactivityTimer(opts: {
  isActive: () => boolean;
  onExpire: () => void;
}): void {
  isActiveFn = opts.isActive;
  onExpireFn = opts.onExpire;
}

export function touchToolActivity(): void {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  if (!isActiveFn()) return;
  timer = setTimeout(() => {
    timer = null;
    onExpireFn();
  }, getInactivityTimeoutMs());
}
