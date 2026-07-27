import type { RefObject } from "react";
import { useLayoutEffect, useState } from "react";

export const MARGIN = 20;

export type Position = { top: number; left: number };

export function clampToViewport(
  top: number,
  left: number,
  width: number,
  height: number,
  margin: number = MARGIN,
): Position {
  const maxTop = Math.max(margin, window.innerHeight - height - margin);
  const maxLeft = Math.max(margin, window.innerWidth - width - margin);
  return {
    top: Math.max(margin, Math.min(maxTop, top)),
    left: Math.max(margin, Math.min(maxLeft, left)),
  };
}

export function useDraggable(
  containerRef: RefObject<HTMLDivElement | null>,
  initialTop: number,
  initialLeft: number,
  margin: number = MARGIN,
) {
  const [pos, setPos] = useState<Position>({
    top: initialTop,
    left: initialLeft,
  });

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const apply = () => {
      const w = el.offsetWidth;
      const h = el.offsetHeight;
      if (w === 0 || h === 0) return;
      setPos((p) => {
        const next = clampToViewport(p.top, p.left, w, h, margin);
        if (next.top === p.top && next.left === p.left) return p;
        return next;
      });
    };
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    window.addEventListener("resize", apply);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", apply);
    };
  }, [containerRef, margin]);

  const onHeaderMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const offsetX = e.clientX - rect.left;
    const offsetY = e.clientY - rect.top;
    const onMove = (ev: MouseEvent) => {
      const pw = el.offsetWidth;
      const ph = el.offsetHeight;
      setPos(
        clampToViewport(
          ev.clientY - offsetY,
          ev.clientX - offsetX,
          pw,
          ph,
          margin,
        ),
      );
    };
    const onUp = () => {
      document.removeEventListener("mousemove", onMove, true);
      document.removeEventListener("mouseup", onUp, true);
    };
    document.addEventListener("mousemove", onMove, true);
    document.addEventListener("mouseup", onUp, true);
  };

  return { pos, setPos, onHeaderMouseDown };
}
