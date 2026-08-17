import { useEffect, useRef } from "react";
import { useStore } from "zustand";
import { extensionStore } from "@/stores/extensionStore";
import { stylesStore } from "@/stores/stylesStore";
import { widgetStore } from "@/stores/widgetStore";
import { DEFAULT_Z_LAYERS } from "@/utils/z-index";

const DEFAULT_SCROLL_FREEZE_ENABLED = true;

const SCROLL_KEYS = new Set([
  " ",
  "PageUp",
  "PageDown",
  "Home",
  "End",
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
]);

export default function ScrollFreezeOverlay() {
  const chatOpen = useStore(widgetStore, (s) => s.chatOpen);
  const activeInputItem = useStore(widgetStore, (s) => s.activeInputItem);
  const zLayers = useStore(stylesStore, (s) => s.styles?.zLayers);
  const scrollFreezeEnabled = useStore(
    extensionStore,
    (s) =>
      s.config?.behavior.scrollFreezeEnabled ?? DEFAULT_SCROLL_FREEZE_ENABLED,
  );
  const frozen = scrollFreezeEnabled && (chatOpen || activeInputItem !== null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!frozen) return;
    const node = ref.current;
    if (!node) return;

    const preventScroll = (e: Event) => {
      e.preventDefault();
    };
    const preventKeyScroll = (e: KeyboardEvent) => {
      if (!SCROLL_KEYS.has(e.key)) return;
      const host = document.getElementById("vigogh-extension-host");
      if (host && e.composedPath().includes(host)) return;
      e.preventDefault();
    };

    node.addEventListener("wheel", preventScroll, { passive: false });
    node.addEventListener("touchmove", preventScroll, { passive: false });
    document.addEventListener("keydown", preventKeyScroll, { capture: true });

    return () => {
      node.removeEventListener("wheel", preventScroll);
      node.removeEventListener("touchmove", preventScroll);
      document.removeEventListener("keydown", preventKeyScroll, {
        capture: true,
      });
    };
  }, [frozen]);

  if (!frozen) return null;

  const zIndex = (zLayers ?? DEFAULT_Z_LAYERS).default - 1;

  return (
    <div
      ref={ref}
      style={{
        position: "fixed",
        inset: 0,
        zIndex,
        background: "transparent",
        pointerEvents: "auto",
      }}
    />
  );
}
