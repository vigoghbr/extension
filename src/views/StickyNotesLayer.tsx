import { useEffect } from "react";
import { useStore } from "zustand";
import { notesStore } from "@/stores/tools/notesStore";
import {
  loadStickyState,
  setGroupFocused,
  stickyNotesStore,
} from "@/stores/stickyNotesStore";
import StickyNote from "./StickyNote";
import type { ThemeColorSet } from "@/types";

interface StickyNotesLayerProps {
  colors: ThemeColorSet;
}

export default function StickyNotesLayer({ colors }: StickyNotesLayerProps) {
  const items = useStore(notesStore, (s) => s.items);
  const visibleIds = useStore(stickyNotesStore, (s) => s.visibleIds);
  const positions = useStore(stickyNotesStore, (s) => s.positions);
  const sizes = useStore(stickyNotesStore, (s) => s.sizes);
  const stickyLoaded = useStore(stickyNotesStore, (s) => s.loaded);

  useEffect(() => {
    loadStickyState();
  }, []);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const path = e.composedPath();
      const inside = path.some(
        (el) =>
          el instanceof HTMLElement &&
          el.dataset?.vigoghSticky === "true",
      );
      setGroupFocused(inside);
    };
    document.addEventListener("mousedown", handler, true);
    return () => document.removeEventListener("mousedown", handler, true);
  }, []);

  if (!stickyLoaded) return null;

  const visible = items.filter((n) => visibleIds.includes(n.id));

  return (
    <>
      {visible.map((note, i) => (
        <StickyNote
          key={note.id}
          note={note}
          index={i}
          colors={colors}
          savedPos={positions[note.id]}
          savedSize={sizes[note.id]}
        />
      ))}
    </>
  );
}
