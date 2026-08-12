import type { StoreApi } from "zustand/vanilla";
import {
  hideBottomBorder,
  hideTopBorder,
  showBottomBorder,
  showTopBorder,
} from "@/stores/borderStore";
import { autocompleteStore } from "@/stores/tools/autocompleteStore";
import { chatStore } from "@/stores/tools/chatStore";
import { contextStore } from "@/stores/tools/contextStore";
import { toolsStore } from "@/stores/tools/toolsStore";

export { initIndicatorListener } from "@/utils/indicators";

function subscribeLoadingToBorder<T extends { status: string }>(
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

subscribeLoadingToBorder(autocompleteStore, showBottomBorder, hideBottomBorder);
subscribeLoadingToBorder(toolsStore, showBottomBorder, hideBottomBorder);
subscribeLoadingToBorder(chatStore, showBottomBorder, hideBottomBorder);
subscribeLoadingToBorder(contextStore, showTopBorder, hideTopBorder);
