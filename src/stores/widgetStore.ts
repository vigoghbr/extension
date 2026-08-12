import { createStore } from "zustand/vanilla";
import { toolsStore } from "@/stores/tools/toolsStore";
import type { ResolvedAnswerToolConfig } from "@/types";
import { onLoginRequired } from "@/utils/login-required";
import { setForceCloseWidget } from "@/utils/tool-error";

export type ActivePopover = "ai" | "files" | "messages" | "notes";

interface WidgetState {
  activePopovers: ActivePopover[];
  activeInputItem: ResolvedAnswerToolConfig | null;
  direction: string;
  chatOpen: boolean;
}

export const widgetStore = createStore<WidgetState>(() => ({
  activePopovers: [],
  activeInputItem: null,
  direction: "",
  chatOpen: false,
}));

export function isPopoverActive(popover: ActivePopover): boolean {
  return widgetStore.getState().activePopovers.includes(popover);
}

export function openPopover(popover: ActivePopover): void {
  const { activePopovers } = widgetStore.getState();
  if (activePopovers.includes(popover)) return;
  widgetStore.setState({ activePopovers: [...activePopovers, popover] });
}

export function closePopover(popover?: ActivePopover): void {
  if (toolsStore.getState().status === "loading") return;
  if (!popover) {
    widgetStore.setState({
      activePopovers: [],
      activeInputItem: null,
      direction: "",
      chatOpen: false,
    });
    return;
  }
  const { activePopovers } = widgetStore.getState();
  const next = activePopovers.filter((p) => p !== popover);
  if (popover === "ai") {
    widgetStore.setState({
      activePopovers: next,
      activeInputItem: null,
      direction: "",
      chatOpen: false,
    });
  } else {
    widgetStore.setState({ activePopovers: next });
  }
}

export function forceCloseWidget(): void {
  widgetStore.setState({
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
  widgetStore.setState({ chatOpen: true });
}

export function closeChat(): void {
  widgetStore.setState({ chatOpen: false });
}

export function setActiveInputItem(
  item: ResolvedAnswerToolConfig | null,
): void {
  widgetStore.setState({ activeInputItem: item });
}

export function setDirection(text: string): void {
  widgetStore.setState({ direction: text });
}

onLoginRequired(forceCloseWidget);
setForceCloseWidget(forceCloseWidget);

toolsStore.subscribe((state, prev) => {
  if (
    state.status === "idle" &&
    state.activeItemId === null &&
    (prev.status !== "idle" || prev.activeItemId !== null)
  ) {
    setActiveInputItem(null);
  }
  if (state.status === "error" && prev.status !== "error") {
    forceCloseWidget();
  }
  if (state.status === "success" && prev.status !== "success") {
    widgetStore.setState({ direction: "" });
    if (widgetStore.getState().activeInputItem) openPopover("ai");
  }
});
