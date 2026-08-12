import { createStore } from "zustand/vanilla";
import { extensionStore } from "@/stores/extensionStore";
import {
  hideIndicator,
  setBottomBorderLoading,
  showIndicator,
} from "@/utils/indicators";

const DEFAULT_BORDER_SAFETY_TIMEOUT_MS = 15000;

interface BorderState {
  topCount: number;
  bottomCount: number;
}

export const borderStore = createStore<BorderState>()(() => ({
  topCount: 0,
  bottomCount: 0,
}));

const topTimers: ReturnType<typeof setTimeout>[] = [];
const bottomTimers: ReturnType<typeof setTimeout>[] = [];

function getBorderSafetyTimeoutMs(): number {
  const { config } = extensionStore.getState();
  return (
    config?.behavior.pageIndicatorMaxDurationMs ??
    DEFAULT_BORDER_SAFETY_TIMEOUT_MS
  );
}

export function showTopBorder(): void {
  const count = borderStore.getState().topCount + 1;
  borderStore.setState({ topCount: count });
  if (count === 1) {
    const config = extensionStore.getState().config;
    if (config) showIndicator("top-border", config);
  }
  topTimers.push(setTimeout(hideTopBorder, getBorderSafetyTimeoutMs()));
}

export function hideTopBorder(): void {
  const timer = topTimers.shift();
  if (timer) clearTimeout(timer);
  const count = Math.max(0, borderStore.getState().topCount - 1);
  borderStore.setState({ topCount: count });
  if (count === 0) hideIndicator("top-border");
}

export function showBottomBorder(): void {
  const count = borderStore.getState().bottomCount + 1;
  borderStore.setState({ bottomCount: count });
  if (count === 1) {
    const config = extensionStore.getState().config;
    if (config) {
      showIndicator("bottom-border", config);
      setBottomBorderLoading(true);
    }
  }
  bottomTimers.push(setTimeout(hideBottomBorder, getBorderSafetyTimeoutMs()));
}

export function hideBottomBorder(): void {
  const timer = bottomTimers.shift();
  if (timer) clearTimeout(timer);
  const count = Math.max(0, borderStore.getState().bottomCount - 1);
  borderStore.setState({ bottomCount: count });
  if (count === 0) hideIndicator("bottom-border");
}
