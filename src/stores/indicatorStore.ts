import { createStore, type StoreApi } from "zustand/vanilla";
import { extensionStore } from "@/stores/extensionStore";
import { autocompleteStore } from "@/stores/tools/autocompleteStore";
import { chatStore } from "@/stores/tools/chatStore";
import { contextStore } from "@/stores/tools/contextStore";
import { toolsStore } from "@/stores/tools/toolsStore";
import {
  hideIndicator,
  setBottomBorderLoading,
  showIndicator,
} from "@/utils/indicators";

export { initIndicatorListener } from "@/utils/indicators";

const DEFAULT_TOP_INDICATOR_MAX_DURATION_MS = 3000;
const DEFAULT_BOTTOM_INDICATOR_MAX_DURATION_MS = 10000;

interface IndicatorState {
  topCount: number;
  bottomCount: number;
}

export const indicatorStore = createStore<IndicatorState>()(() => ({
  topCount: 0,
  bottomCount: 0,
}));

const topTimers: ReturnType<typeof setTimeout>[] = [];
const bottomTimers: ReturnType<typeof setTimeout>[] = [];

function getTopIndicatorMaxDurationMs(): number {
  const { config } = extensionStore.getState();
  return (
    config?.behavior.topIndicatorMaxDurationMs ??
    DEFAULT_TOP_INDICATOR_MAX_DURATION_MS
  );
}

function getBottomIndicatorMaxDurationMs(): number {
  const { config } = extensionStore.getState();
  return (
    config?.behavior.bottomIndicatorMaxDurationMs ??
    DEFAULT_BOTTOM_INDICATOR_MAX_DURATION_MS
  );
}

export function showTopIndicator(): void {
  const count = indicatorStore.getState().topCount + 1;
  indicatorStore.setState({ topCount: count });
  if (count === 1) {
    const config = extensionStore.getState().config;
    if (config) showIndicator("top-border", config);
  }
  topTimers.push(setTimeout(hideTopIndicator, getTopIndicatorMaxDurationMs()));
}

export function hideTopIndicator(): void {
  const timer = topTimers.shift();
  if (timer) clearTimeout(timer);
  const count = Math.max(0, indicatorStore.getState().topCount - 1);
  indicatorStore.setState({ topCount: count });
  if (count === 0) hideIndicator("top-border");
}

export function showBottomIndicator(): void {
  const count = indicatorStore.getState().bottomCount + 1;
  indicatorStore.setState({ bottomCount: count });
  if (count === 1) {
    const config = extensionStore.getState().config;
    if (config) {
      showIndicator("bottom-border", config);
      setBottomBorderLoading(true);
    }
  }
  bottomTimers.push(
    setTimeout(hideBottomIndicator, getBottomIndicatorMaxDurationMs()),
  );
}

export function hideBottomIndicator(): void {
  const timer = bottomTimers.shift();
  if (timer) clearTimeout(timer);
  const count = Math.max(0, indicatorStore.getState().bottomCount - 1);
  indicatorStore.setState({ bottomCount: count });
  if (count === 0) hideIndicator("bottom-border");
}

function subscribeLoadingToIndicator<T extends { status: string }>(
  store: StoreApi<T>,
  show: () => void,
  hide: () => void,
): void {
  let active = false;
  store.subscribe((state, prev) => {
    if (state.status === prev.status) return;
    if (state.status === "loading" && !active) {
      active = true;
      show();
    } else if (state.status !== "loading" && active) {
      active = false;
      hide();
    }
  });
}

subscribeLoadingToIndicator(
  autocompleteStore,
  showBottomIndicator,
  hideBottomIndicator,
);
subscribeLoadingToIndicator(
  toolsStore,
  showBottomIndicator,
  hideBottomIndicator,
);
subscribeLoadingToIndicator(
  chatStore,
  showBottomIndicator,
  hideBottomIndicator,
);
subscribeLoadingToIndicator(contextStore, showTopIndicator, hideTopIndicator);
