import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useStore } from "zustand";
import { Loader, X } from "lucide-react";
import { useDraggable } from "@/hooks/useDraggable";
import { useResizable, type ResizeEdge } from "@/hooks/useResizable";
import { extensionStore } from "@/stores/extensionStore";
import { stylesStore } from "@/stores/stylesStore";
import { resolveZIndex } from "@/utils/z-index";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/views/ui/tooltip";
import type { ThemeColorSet } from "@/types";

export interface WindowAction {
  icon: ReactNode;
  tooltip: string;
  onClick: () => void;
  loading?: boolean;
  hidden?: boolean;
}

export interface WindowProps {
  colors: ThemeColorSet;
  icon: ReactNode;
  title: string;
  actions?: WindowAction[];
  onClose?: () => void;
  closeTooltip?: string;
  bottom: number;
  right: number;
  draggable?: boolean;
  resizable?: boolean;
  minWidth?: number;
  minHeight?: number;
  maxWidth?: number;
  initialWidth?: number;
  initialHeight?: number;
  headerBackground?: string;
  headerTextColor?: string;
  bodyBackground?: string;
  borderRadius?: number | string;
  showDivider?: boolean;
  dataAttrs?: Record<string, string>;
  disclaimer?: string;
  closeIconColor?: string;
  initialFocused?: boolean;
  unfocusedOpacity?: number;
  onPositionEnd?: (pos: { bottom: number; right: number }) => void;
  onSizeEnd?: (size: { width: number; height: number }) => void;
  children: ReactNode | ((state: { isFocused: boolean; isHovered: boolean }) => ReactNode);
}

const ALL_EDGES: ResizeEdge[] = ["n", "s", "e", "w", "ne", "nw", "se", "sw"];

function buildEdgeStyles(handleSize: number): Record<ResizeEdge, { style: React.CSSProperties; cursor: string }> {
  return {
    n: { style: { top: 0, left: handleSize, right: handleSize, height: handleSize }, cursor: "ns-resize" },
    s: { style: { bottom: 0, left: handleSize, right: handleSize, height: handleSize }, cursor: "ns-resize" },
    e: { style: { right: 0, top: handleSize, bottom: handleSize, width: handleSize }, cursor: "ew-resize" },
    w: { style: { left: 0, top: handleSize, bottom: handleSize, width: handleSize }, cursor: "ew-resize" },
    ne: { style: { top: 0, right: 0, width: handleSize * 2, height: handleSize * 2 }, cursor: "nesw-resize" },
    nw: { style: { top: 0, left: 0, width: handleSize * 2, height: handleSize * 2 }, cursor: "nwse-resize" },
    se: { style: { bottom: 0, right: 0, width: handleSize * 2, height: handleSize * 2 }, cursor: "nwse-resize" },
    sw: { style: { bottom: 0, left: 0, width: handleSize * 2, height: handleSize * 2 }, cursor: "nesw-resize" },
  };
}

export function Window(props: WindowProps) {
  const {
    colors,
    icon,
    title,
    actions = [],
    onClose,
    closeTooltip,
    bottom,
    right,
    draggable = true,
    resizable = true,
    minWidth = 220,
    minHeight = 160,
    maxWidth,
    initialWidth,
    initialHeight,
    headerBackground,
    headerTextColor,
    bodyBackground,
    borderRadius,
    showDivider = true,
    dataAttrs,
    disclaimer,
    closeIconColor,
    initialFocused = true,
    unfocusedOpacity,
    onPositionEnd,
    onSizeEnd,
    children,
  } = props;

  const containerRef = useRef<HTMLDivElement>(null);
  const dragLabel = useStore(extensionStore, (s) => s.config?.messages.info.DRAG_LABEL);
  const closeLabel = useStore(extensionStore, (s) => s.config?.messages.info.CLOSE_LABEL);
  const windowStyles = useStore(stylesStore, (s) => s.styles?.window);
  const zLayers = useStore(stylesStore, (s) => s.styles?.zLayers);
  const handleSize = windowStyles?.handleSize ?? 6;
  const effectiveBorderRadius = borderRadius ?? windowStyles?.borderRadius ?? "12px";
  const edgeStyles = buildEdgeStyles(handleSize);
  const [isFocused, setIsFocused] = useState(initialFocused);
  const [isHovered, setIsHovered] = useState(false);
  const effectiveZIndex = resolveZIndex({ isHovered, isFocused }, zLayers);

  useEffect(() => {
    const handleMouseDown = (e: MouseEvent) => {
      const path = e.composedPath();
      const inside = containerRef.current && path.includes(containerRef.current);
      setIsFocused(!!inside);
    };
    document.addEventListener("mousedown", handleMouseDown, true);
    return () => document.removeEventListener("mousedown", handleMouseDown, true);
  }, []);

  const estW = initialWidth ?? minWidth;
  const estH = initialHeight ?? minHeight;
  const initialTop = window.innerHeight - bottom - estH;
  const initialLeft = window.innerWidth - right - estW;
  const dragMargin = useStore(extensionStore, (s) => s.config?.behavior.windowDragMarginPx);
  const { pos, setPos, onHeaderMouseDown } = useDraggable(containerRef, initialTop, initialLeft, dragMargin);
  const { size, onMouseDownEdge } = useResizable(containerRef, {
    minWidth,
    minHeight,
    initialWidth,
    initialHeight,
    position: pos,
    onPositionChange: setPos,
  });

  const visibleActions = actions.filter((a) => !a.hidden);

  const buttonStyle: React.CSSProperties = { padding: 0 };
  if (headerTextColor) buttonStyle.color = headerTextColor;
  const titleStyle: React.CSSProperties = headerTextColor ? { color: headerTextColor } : {};

  const handleHeaderMouseDown = (e: React.MouseEvent) => {
    onHeaderMouseDown(e);
    if (!onPositionEnd) return;
    const onUp = () => {
      document.removeEventListener("mouseup", onUp, true);
      const el = containerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      onPositionEnd({
        bottom: window.innerHeight - rect.top - rect.height,
        right: window.innerWidth - rect.left - rect.width,
      });
    };
    document.addEventListener("mouseup", onUp, true);
  };

  const handleEdgeMouseDown = (edge: ResizeEdge) => (e: React.MouseEvent) => {
    onMouseDownEdge(edge)(e);
    if (!onSizeEnd && !onPositionEnd) return;
    const onUp = () => {
      document.removeEventListener("mouseup", onUp, true);
      const el = containerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      if (onSizeEnd) onSizeEnd({ width: rect.width, height: rect.height });
      if (onPositionEnd) onPositionEnd({
        bottom: window.innerHeight - rect.top - rect.height,
        right: window.innerWidth - rect.left - rect.width,
      });
    };
    document.addEventListener("mouseup", onUp, true);
  };

  const headerStyle: React.CSSProperties = headerBackground ? { background: headerBackground } : {};
  const headerInner = (
    <div
      className={`flex items-center gap-2 px-3 pt-3 pb-2 select-none ${draggable ? "cursor-grab" : ""}`}
      style={headerStyle}
      onMouseDown={draggable ? handleHeaderMouseDown : undefined}
    >
      {icon}
      <span
        className="flex-1 text-sm font-medium text-white truncate"
        style={titleStyle}
      >
        {title}
      </span>
      {visibleActions.map((action, idx) => (
        <Tooltip key={idx}>
          <TooltipTrigger asChild>
            <button
              type="button"
              className="flex items-center justify-center w-6 h-6 rounded bg-transparent text-white cursor-pointer hover:text-white border-none"
              style={buttonStyle}
              onMouseDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (!action.loading) action.onClick();
              }}
            >
              {action.loading ? <Loader size={13} className="animate-spin" /> : action.icon}
            </button>
          </TooltipTrigger>
          <TooltipContent>{action.tooltip}</TooltipContent>
        </Tooltip>
      ))}
      {onClose && (
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              className="flex items-center justify-center w-6 h-6 rounded bg-transparent cursor-pointer border-none"
              style={{ ...buttonStyle, color: closeIconColor ?? buttonStyle.color ?? "#fff" }}
              onMouseDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onClose();
              }}
            >
              <X size={14} />
            </button>
          </TooltipTrigger>
          <TooltipContent>{closeTooltip ?? closeLabel}</TooltipContent>
        </Tooltip>
      )}
    </div>
  );

  return (
    <div
      ref={containerRef}
      className="fixed backdrop-blur-xl overflow-hidden flex flex-col"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        zIndex: effectiveZIndex,
        top: `${pos.top}px`,
        left: `${pos.left}px`,
        background: bodyBackground ?? colors.menuBackground,
        border: `1px solid ${colors.menuBorderColor}`,
        borderRadius: typeof effectiveBorderRadius === "number" ? `${effectiveBorderRadius}px` : effectiveBorderRadius,
        boxShadow: colors.containerShadow,
        minWidth: `${minWidth}px`,
        minHeight: `${minHeight}px`,
        maxWidth: maxWidth ? `${maxWidth}px` : undefined,
        width: size ? `${size.width}px` : undefined,
        height: size?.height != null ? `${size.height}px` : undefined,
        opacity: (isFocused || isHovered) ? 1 : (unfocusedOpacity ?? 0.45),
        transition: (isFocused || isHovered) ? "none" : `opacity ${windowStyles?.transitionMs ?? 200}ms ease`,
      }}
      {...dataAttrs}
    >
      {draggable ? (
        <Tooltip>
          <TooltipTrigger asChild>{headerInner}</TooltipTrigger>
          <TooltipContent>{dragLabel}</TooltipContent>
        </Tooltip>
      ) : (
        headerInner
      )}

      {showDivider && <div className="h-px bg-border mx-0" />}

      <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
        {typeof children === "function" ? children({ isFocused, isHovered }) : children}
      </div>

      {disclaimer && (
        <div className="px-3 pt-0 pb-2 text-[11px] text-white/50 text-center">
          {disclaimer}
        </div>
      )}

      {resizable &&
        ALL_EDGES.map((edge) => (
          <div
            key={edge}
            className="absolute"
            style={{ ...edgeStyles[edge].style, cursor: edgeStyles[edge].cursor, zIndex: 1 }}
            onMouseDown={handleEdgeMouseDown(edge)}
          />
        ))}
    </div>
  );
}
