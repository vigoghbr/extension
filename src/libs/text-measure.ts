let measureCtx: CanvasRenderingContext2D | null = null;

export function getMeasureCtx(): CanvasRenderingContext2D | null {
  if (measureCtx) return measureCtx;
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  measureCtx = canvas.getContext("2d");
  return measureCtx;
}

export function measureWidth(text: string, font: string): number {
  const ctx = getMeasureCtx();
  if (!ctx) return 0;
  ctx.font = font;
  return ctx.measureText(text).width;
}
