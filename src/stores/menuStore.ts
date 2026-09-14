import { createStore } from "zustand/vanilla";
import { stylesStore } from "@/stores/stylesStore";
import { isExtensionContextValid } from "@/utils/extension-context";

const RECENT_TOOLS_KEY = "vigogh-recent-tools";
const DEFAULT_HISTORY_LIMIT = 12;

interface MenuState {
  recentToolIds: string[];
}

export const menuStore = createStore<MenuState>()(() => ({
  recentToolIds: [],
}));

function sanitize(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((id): id is string => typeof id === "string");
}

function resolveHistoryLimit(): number {
  return (
    stylesStore.getState().styles?.widget.menuRecentHistoryLimit ??
    DEFAULT_HISTORY_LIMIT
  );
}

export function loadRecentTools(): void {
  if (!isExtensionContextValid()) return;
  chrome.storage.local
    .get<{ [RECENT_TOOLS_KEY]?: string[] }>(RECENT_TOOLS_KEY)
    .then((stored) => {
      menuStore.setState({ recentToolIds: sanitize(stored[RECENT_TOOLS_KEY]) });
    })
    .catch(() => {});
}

export function recordToolUsage(id: string): void {
  const limit = resolveHistoryLimit();
  if (limit <= 0) return;
  const current = menuStore.getState().recentToolIds;
  const next = [id, ...current.filter((v) => v !== id)].slice(0, limit);
  menuStore.setState({ recentToolIds: next });
  if (!isExtensionContextValid()) return;
  chrome.storage.local.set({ [RECENT_TOOLS_KEY]: next }).catch(() => {});
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  if (!(RECENT_TOOLS_KEY in changes)) return;
  menuStore.setState({
    recentToolIds: sanitize(changes[RECENT_TOOLS_KEY].newValue),
  });
});
