import { createStore } from "zustand/vanilla";

interface StickyNotesState {
  visibleIds: string[];
  positions: Record<string, { top: number; left: number }>;
  sizes: Record<string, { width: number; height: number }>;
  groupFocused: boolean;
  loaded: boolean;
}

export const stickyNotesStore = createStore<StickyNotesState>()(() => ({
  visibleIds: [],
  positions: {},
  sizes: {},
  groupFocused: false,
  loaded: false,
}));

export function loadStickyState(): void {
  chrome.storage.local
    .get<{
      "vigogh-sticky-notes-positions"?: Record<string, { top: number; left: number }>;
      "vigogh-sticky-notes-sizes"?: Record<string, { width: number; height: number }>;
    }>(["vigogh-sticky-notes-positions", "vigogh-sticky-notes-sizes"])
    .then((stored) => {
      const rawPositions = stored["vigogh-sticky-notes-positions"] ?? {};
      const positions: Record<string, { top: number; left: number }> = {};
      for (const [id, p] of Object.entries(rawPositions)) {
        if (p && typeof p === "object" && "top" in p && "left" in p) {
          positions[id] = p as { top: number; left: number };
        }
      }
      stickyNotesStore.setState({
        positions,
        sizes: stored["vigogh-sticky-notes-sizes"] ?? {},
        loaded: true,
      });
    })
    .catch(() => {
      stickyNotesStore.setState({ loaded: true });
    });
  chrome.storage.local.remove("vigogh-sticky-notes-hidden").catch(() => {});
}

export function showStickyNote(id: string): void {
  const current = stickyNotesStore.getState().visibleIds;
  if (current.includes(id)) return;
  stickyNotesStore.setState({ visibleIds: [...current, id] });
}

export function hideStickyNote(id: string): void {
  const next = stickyNotesStore.getState().visibleIds.filter((v) => v !== id);
  stickyNotesStore.setState({ visibleIds: next });
}

export function toggleStickyNote(id: string): void {
  if (stickyNotesStore.getState().visibleIds.includes(id)) {
    hideStickyNote(id);
  } else {
    showStickyNote(id);
  }
}

export function saveStickyPosition(id: string, pos: { top: number; left: number }): void {
  const next = { ...stickyNotesStore.getState().positions, [id]: pos };
  stickyNotesStore.setState({ positions: next });
  chrome.storage.local.set({ "vigogh-sticky-notes-positions": next }).catch(() => {});
}

export function saveStickySize(id: string, size: { width: number; height: number }): void {
  const next = { ...stickyNotesStore.getState().sizes, [id]: size };
  stickyNotesStore.setState({ sizes: next });
  chrome.storage.local.set({ "vigogh-sticky-notes-sizes": next }).catch(() => {});
}

export function setGroupFocused(focused: boolean): void {
  if (stickyNotesStore.getState().groupFocused === focused) return;
  stickyNotesStore.setState({ groupFocused: focused });
}
