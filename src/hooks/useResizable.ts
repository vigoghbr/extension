import { useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import { MARGIN, type Position } from "./useDraggable";

export type ResizeEdge = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

export type Size = { width: number; height?: number };

interface Options {
  minWidth: number;
  minHeight: number;
  maxWidth?: number;
  maxHeight?: number;
  initialWidth?: number;
  initialHeight?: number;
  position: Position;
  onPositionChange: (pos: Position) => void;
}

export function useResizable(
  containerRef: RefObject<HTMLDivElement | null>,
  options: Options,
) {
  const { minWidth, minHeight, maxWidth, maxHeight, initialWidth, initialHeight, position, onPositionChange } = options;
  const [size, setSize] = useState<Size | null>(null);
  const userResizedRef = useRef(false);

  useEffect(() => {
    if (userResizedRef.current || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const maxW = Math.min(maxWidth ?? Infinity, window.innerWidth - 2 * MARGIN);
    const maxH = Math.min(maxHeight ?? Infinity, window.innerHeight - 2 * MARGIN);
    const baseWidth = initialWidth ?? rect.width;
    setSize({
      width: Math.max(minWidth, Math.min(maxW, baseWidth)),
      height: initialHeight != null ? Math.max(minHeight, Math.min(maxH, initialHeight)) : initialHeight,
    });
  }, [containerRef, initialWidth, initialHeight, minWidth, minHeight, maxWidth, maxHeight]);

  useEffect(() => {
    const clampToViewport = () => {
      setSize((s) => {
        if (!s) return s;
        const maxW = Math.min(maxWidth ?? Infinity, window.innerWidth - 2 * MARGIN);
        const maxH = Math.min(maxHeight ?? Infinity, window.innerHeight - 2 * MARGIN);
        const newWidth = Math.max(minWidth, Math.min(maxW, s.width));
        const newHeight = s.height != null ? Math.max(minHeight, Math.min(maxH, s.height)) : s.height;
        if (newWidth === s.width && newHeight === s.height) return s;
        return { width: newWidth, height: newHeight };
      });
    };
    window.addEventListener("resize", clampToViewport);
    return () => window.removeEventListener("resize", clampToViewport);
  }, [minWidth, minHeight, maxWidth, maxHeight]);

  const onMouseDownEdge = (edge: ResizeEdge) => (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    userResizedRef.current = true;
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const startWidth = rect.width;
    const startHeight = rect.height;
    const startX = e.clientX;
    const startY = e.clientY;
    const startTop = position.top;
    const startLeft = position.left;

    const onMove = (ev: MouseEvent) => {
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      let newWidth = startWidth;
      let newHeight = startHeight;
      let newTop = startTop;
      let newLeft = startLeft;

      if (edge.includes("e")) {
        const widthCap = window.innerWidth - startLeft - MARGIN;
        const upperWidth = maxWidth != null ? Math.min(maxWidth, widthCap) : widthCap;
        newWidth = Math.max(minWidth, Math.min(upperWidth, startWidth + dx));
      }
      if (edge.includes("w")) {
        const widthCap = startLeft + startWidth - MARGIN;
        const upperWidth = maxWidth != null ? Math.min(maxWidth, widthCap) : widthCap;
        const dxClamped = Math.max(startWidth - upperWidth, Math.min(startWidth - minWidth, dx));
        newWidth = startWidth - dxClamped;
        newLeft = startLeft + dxClamped;
      }
      if (edge.includes("s")) {
        const heightCap = window.innerHeight - startTop - MARGIN;
        const upperHeight = maxHeight != null ? Math.min(maxHeight, heightCap) : heightCap;
        newHeight = Math.max(minHeight, Math.min(upperHeight, startHeight + dy));
      }
      if (edge.includes("n")) {
        const heightCap = startTop + startHeight - MARGIN;
        const upperHeight = maxHeight != null ? Math.min(maxHeight, heightCap) : heightCap;
        const dyClamped = Math.max(startHeight - upperHeight, Math.min(startHeight - minHeight, dy));
        newHeight = startHeight - dyClamped;
        newTop = startTop + dyClamped;
      }

      setSize({ width: newWidth, height: newHeight });
      if (newTop !== startTop || newLeft !== startLeft) {
        onPositionChange({ top: newTop, left: newLeft });
      }
    };

    const onUp = () => {
      document.removeEventListener("mousemove", onMove, true);
      document.removeEventListener("mouseup", onUp, true);
    };
    document.addEventListener("mousemove", onMove, true);
    document.addEventListener("mouseup", onUp, true);
  };

  return { size, onMouseDownEdge };
}
