import {
  extensionStore,
  setPageIndicatorActive,
} from "@/stores/extensionStore";
import { autocompleteStore } from "@/stores/tools/autocompleteStore";
import {
  hideIndicator,
  setBottomBorderLoading,
  showIndicator,
} from "@/utils/indicators";

export { initIndicatorListener } from "@/utils/indicators";

autocompleteStore.subscribe((state, prev) => {
  if (state.status !== prev.status) {
    const config = extensionStore.getState().config;
    if (state.status === "loading" && config) {
      showIndicator("bottom-border", config);
      setBottomBorderLoading(true);
    } else {
      hideIndicator("bottom-border");
    }
  }
});

export function showPageIndicator(): void {
  const config = extensionStore.getState().config;
  if (!config) return;
  setPageIndicatorActive(true);
  showIndicator("page", config);
}

export function hidePageIndicator(): void {
  setPageIndicatorActive(false);
  hideIndicator("page");
}
