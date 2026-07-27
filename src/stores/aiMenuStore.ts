import { createStore } from "zustand/vanilla";
import { hidePageIndicator } from "@/stores/indicatorsStore";
import { toolsStore } from "@/stores/tools/toolsStore";
import type { ResolvedAnswerToolConfig } from "@/types";
import { onLoginRequired } from "@/utils/login-required";
import { setForceCloseAiMenu } from "@/utils/tool-error";

export type ActivePopover = "ai" | "files" | "messages" | "notes";

interface AiMenuState {
  activePopovers: ActivePopover[];
  activeInputItem: ResolvedAnswerToolConfig | null;
  direction: string;
  chatOpen: boolean;
}

export const aiMenuStore = createStore<AiMenuState>(() => ({
  activePopovers: [],
  activeInputItem: null,
  direction: "",
  chatOpen: false,
}));

export function isPopoverActive(popover: ActivePopover): boolean {
  return aiMenuStore.getState().activePopovers.includes(popover);
}

export function openPopover(popover: ActivePopover): void {
  const { activePopovers } = aiMenuStore.getState();
  if (activePopovers.includes(popover)) return;
  aiMenuStore.setState({ activePopovers: [...activePopovers, popover] });
}

export function closePopover(popover?: ActivePopover): void {
  if (toolsStore.getState().status === "loading") return;
  if (!popover) {
    const prev = aiMenuStore.getState().activeInputItem;
    if (prev) hidePageIndicator();
    aiMenuStore.setState({
      activePopovers: [],
      activeInputItem: null,
      direction: "",
      chatOpen: false,
    });
    return;
  }
  const { activePopovers, activeInputItem } = aiMenuStore.getState();
  const next = activePopovers.filter((p) => p !== popover);
  if (popover === "ai") {
    if (activeInputItem) hidePageIndicator();
    aiMenuStore.setState({
      activePopovers: next,
      activeInputItem: null,
      direction: "",
      chatOpen: false,
    });
  } else {
    aiMenuStore.setState({ activePopovers: next });
  }
}

export function forceCloseAiMenu(): void {
  if (aiMenuStore.getState().activeInputItem) hidePageIndicator();
  aiMenuStore.setState({
    activePopovers: [],
    activeInputItem: null,
    direction: "",
    chatOpen: false,
  });
}

export function togglePopover(popover: ActivePopover): void {
  if (isPopoverActive(popover)) {
    closePopover(popover);
  } else {
    openPopover(popover);
  }
}

export function openMenu(): void {
  openPopover("ai");
}

export function closeMenu(): void {
  closePopover("ai");
}

export function toggleMenu(): void {
  togglePopover("ai");
}

export function openChat(): void {
  aiMenuStore.setState({ chatOpen: true });
}

export function closeChat(): void {
  aiMenuStore.setState({ chatOpen: false });
}

export function setActiveInputItem(
  item: ResolvedAnswerToolConfig | null,
): void {
  const prev = aiMenuStore.getState().activeInputItem;
  aiMenuStore.setState({ activeInputItem: item });

  if (!item && prev) {
    hidePageIndicator();
  }
}

export function setDirection(text: string): void {
  aiMenuStore.setState({ direction: text });
}

onLoginRequired(forceCloseAiMenu);
setForceCloseAiMenu(forceCloseAiMenu);

toolsStore.subscribe((state, prev) => {
  if (
    state.status === "idle" &&
    state.activeItemId === null &&
    (prev.status !== "idle" || prev.activeItemId !== null)
  ) {
    setActiveInputItem(null);
  }
  if (state.status === "error" && prev.status !== "error") {
    forceCloseAiMenu();
  }
  if (state.status === "success" && prev.status !== "success") {
    hidePageIndicator();
    aiMenuStore.setState({ direction: "" });
    if (aiMenuStore.getState().activeInputItem) openPopover("ai");
  }
});
