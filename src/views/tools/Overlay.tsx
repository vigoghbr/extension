import { useEffect, useState } from "react";
import { useStore } from "zustand";
import { measureWidth } from "@/libs/text-measure";
import { extensionStore } from "@/stores/extensionStore";
import {
  acceptCompletion,
  autocompleteStore,
  cycleCompletion,
} from "@/stores/tools/autocompleteStore";

interface EditorStyles {
  fontFamily: string;
  fontSize: string;
  fontWeight: string;
  lineHeight: string;
  letterSpacing: string;
}

const ELLIPSIS = "…";

function fitText(text: string, maxPx: number, font: string): string {
  if (maxPx <= 0) return "";
  if (measureWidth(text, font) <= maxPx) return text;
  if (measureWidth(ELLIPSIS, font) > maxPx) return "";
  let lo = 0;
  let hi = text.length;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (measureWidth(text.slice(0, mid) + ELLIPSIS, font) <= maxPx) {
      lo = mid;
    } else {
      hi = mid - 1;
    }
  }
  return lo === 0 ? ELLIPSIS : text.slice(0, lo) + ELLIPSIS;
}

export default function Overlay() {
  const currentEditor = useStore(extensionStore, (s) => s.currentEditor);
  const caretCoordinates = useStore(extensionStore, (s) => s.caretCoordinates);
  const config = useStore(extensionStore, (s) => s.config);
  const suggestions = useStore(autocompleteStore, (s) => s.suggestions);
  const currentIndex = useStore(autocompleteStore, (s) => s.currentIndex);
  const currentCompletion = suggestions[currentIndex] ?? "";
  const [editorStyles, setEditorStyles] = useState<EditorStyles | null>(null);
  const [, setTick] = useState(0);

  useEffect(() => {
    if (!currentEditor) {
      setEditorStyles(null);
      return;
    }
    const computed = window.getComputedStyle(currentEditor as HTMLElement);
    setEditorStyles({
      fontFamily: computed.fontFamily,
      fontSize: computed.fontSize,
      fontWeight: computed.fontWeight,
      lineHeight: computed.lineHeight,
      letterSpacing: computed.letterSpacing,
    });
  }, [currentEditor]);

  useEffect(() => {
    if (!currentEditor) return;
    const bump = () => setTick((t) => t + 1);
    window.addEventListener("resize", bump);
    window.addEventListener("scroll", bump, { capture: true, passive: true });
    const ro = new ResizeObserver(bump);
    ro.observe(currentEditor as Element);
    return () => {
      window.removeEventListener("resize", bump);
      window.removeEventListener("scroll", bump, {
        capture: true,
      } as EventListenerOptions);
      ro.disconnect();
    };
  }, [currentEditor]);

  if (!caretCoordinates || !currentCompletion || !config) return null;

  const overlayConfig = config.overlay;

  const textFont = editorStyles
    ? `${editorStyles.fontWeight} ${editorStyles.fontSize} ${editorStyles.fontFamily}`
    : "";
  const badgeFont = `${overlayConfig.badgeFontSize} ${editorStyles?.fontFamily ?? "sans-serif"}`;

  const prevBadgeWidth =
    measureWidth(overlayConfig.prevBadgeText, badgeFont) +
    overlayConfig.badgePaddingX;
  const nextBadgeWidth =
    measureWidth(overlayConfig.nextBadgeText, badgeFont) +
    overlayConfig.badgePaddingX;
  const tabBadgeWidth =
    measureWidth(overlayConfig.badgeText, badgeFont) +
    overlayConfig.badgePaddingX;
  const badgesGroupWidth =
    prevBadgeWidth +
    nextBadgeWidth +
    tabBadgeWidth +
    overlayConfig.badgeGap * 2;

  let displayText = currentCompletion;
  let badgesLeft =
    caretCoordinates.left +
    measureWidth(currentCompletion, textFont) +
    overlayConfig.badgeGap;

  if (currentEditor && editorStyles) {
    const editorEl = currentEditor as HTMLElement;
    const rect = editorEl.getBoundingClientRect();
    const paddingRight =
      parseFloat(window.getComputedStyle(editorEl).paddingRight) || 0;
    const rightEdge = rect.right - paddingRight;
    badgesLeft = rightEdge - badgesGroupWidth - overlayConfig.badgeSafetyPad;
    const available =
      badgesLeft - caretCoordinates.left - overlayConfig.badgeGap;
    displayText = fitText(currentCompletion, available, textFont);
  }

  const handleAcceptMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    acceptCompletion();
  };

  const handleCycleMouseDown =
    (direction: "prev" | "next") => (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      cycleCompletion(direction);
    };

  const badgeStyle = {
    background: overlayConfig.badgeBackground,
    fontSize: overlayConfig.badgeFontSize,
    color: overlayConfig.color,
  };

  return (
    <>
      <div
        className="fixed z-[2147483647] pointer-events-none inline-flex items-center"
        style={{
          top: `${caretCoordinates.top}px`,
          left: `${caretCoordinates.left}px`,
          height: `${caretCoordinates.height}px`,
        }}
      >
        <span
          onMouseDown={handleAcceptMouseDown}
          className="pointer-events-auto cursor-pointer whitespace-pre select-none"
          style={{
            color: overlayConfig.color,
            opacity: Number(overlayConfig.opacity),
            fontFamily: editorStyles?.fontFamily,
            fontSize: editorStyles?.fontSize,
            fontWeight: editorStyles?.fontWeight,
            lineHeight: editorStyles?.lineHeight,
            letterSpacing: editorStyles?.letterSpacing,
          }}
        >
          {displayText}
        </span>
      </div>
      <div
        className="fixed z-[2147483647] pointer-events-none inline-flex items-center"
        style={{
          top: `${caretCoordinates.top}px`,
          left: `${badgesLeft}px`,
          height: `${caretCoordinates.height}px`,
        }}
      >
        <span
          onMouseDown={handleCycleMouseDown("prev")}
          className="pointer-events-auto cursor-pointer rounded-sm px-1 select-none align-baseline"
          style={badgeStyle}
        >
          {overlayConfig.prevBadgeText}
        </span>
        <span
          onMouseDown={handleCycleMouseDown("next")}
          className="pointer-events-auto cursor-pointer rounded-sm px-1 ml-1 select-none align-baseline"
          style={badgeStyle}
        >
          {overlayConfig.nextBadgeText}
        </span>
        <span
          onMouseDown={handleAcceptMouseDown}
          className="pointer-events-auto cursor-pointer rounded-sm px-1 ml-1 select-none align-baseline"
          style={badgeStyle}
        >
          {overlayConfig.badgeText}
        </span>
      </div>
    </>
  );
}
