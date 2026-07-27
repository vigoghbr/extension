import { useEffect, useState } from "react";
import { useStore } from "zustand";
import { extensionStore, resolveThemeColors } from "@/stores/extensionStore";
import { autocompleteStore } from "@/stores/tools/autocompleteStore";
import VigoghMenu from "./VigoghMenu";
import Overlay from "./tools/Overlay";
import StickyNotesLayer from "./StickyNotesLayer";
import { Toaster } from "./ui/sonner";
import { TooltipProvider } from "./ui/tooltip";
import type { AiButtonAppearance } from "@/types";
import cssText from "@/styles/index.compiled.css";
import sonnerCss from "sonner/dist/styles.css";

const fontUrl = chrome.runtime.getURL("font.ttf");
const fontCss = `@font-face{font-family:"Google Sans";src:url("${fontUrl}") format("truetype");font-weight:400;font-style:normal;font-display:swap;}*{font-family:"Google Sans",sans-serif;}`;

export default function App() {
  const aiMenuVisible = useStore(extensionStore, (s) => s.aiMenuVisible);
  const aiButtonEnabled = useStore(extensionStore, (s) => s.aiButtonEnabled);
  const overlayVisible = useStore(autocompleteStore, (s) => s.overlayVisible);
  const config = useStore(extensionStore, (s) => s.config);
  const [appearance, setAppearance] = useState<AiButtonAppearance | null>(null);
  const [tooltipContainer, setTooltipContainer] = useState<HTMLDivElement | null>(null);

  useEffect(() => {
    chrome.storage.local
      .get<{ "vigogh-ai-button-appearance"?: AiButtonAppearance }>("vigogh-ai-button-appearance")
      .then((stored) => {
        setAppearance(stored["vigogh-ai-button-appearance"] ?? null);
      })
      .catch(() => {});
    const handleStorageChange = (changes: Record<string, chrome.storage.StorageChange>) => {
      if ("vigogh-ai-button-appearance" in changes) {
        setAppearance(
          (changes["vigogh-ai-button-appearance"].newValue as AiButtonAppearance | undefined) ?? null,
        );
      }
    };
    chrome.storage.local.onChanged.addListener(handleStorageChange);
    return () => chrome.storage.local.onChanged.removeListener(handleStorageChange);
  }, []);

  const colors = config ? resolveThemeColors(config, appearance) : null;

  const themeVarsCss = colors
    ? `:host {\n${Object.entries(colors.cssVars).map(([k, v]) => `  ${k}: ${v};`).join("\n")}\n}`
    : "";

  if (!aiButtonEnabled) return null;

  return (
    <TooltipProvider portalContainer={tooltipContainer}>
      <style>{fontCss + cssText + sonnerCss + themeVarsCss}</style>
      {aiMenuVisible && <VigoghMenu />}
      {overlayVisible && <Overlay />}
      {colors && <StickyNotesLayer colors={colors} />}
      {colors && <Toaster position="top-right" colors={colors} />}
      <div ref={setTooltipContainer} style={{ position: "fixed", inset: 0, zIndex: 2147483647, pointerEvents: "none" }} />
    </TooltipProvider>
  );
}
