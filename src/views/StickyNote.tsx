import { Loader, Save, X } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useStore } from "zustand";
import { useDraggable } from "@/hooks/useDraggable";
import { type ResizeEdge, useResizable } from "@/hooks/useResizable";
import { extensionStore } from "@/stores/extensionStore";
import {
  hideStickyNote,
  saveStickyPosition,
  saveStickySize,
} from "@/stores/stickyNotesStore";
import { stylesStore } from "@/stores/stylesStore";
import { updateNote } from "@/stores/tools/notesStore";
import type { Note, ThemeColorSet } from "@/types";
import { stripHtml } from "@/utils/notes-html";
import { resolveZIndex } from "@/utils/z-index";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/views/ui/tooltip";

interface StickyNoteProps {
  note: Note;
  index: number;
  colors: ThemeColorSet;
  savedPos?: { top: number; left: number };
  savedSize?: { width: number; height: number };
}

const ALL_EDGES: ResizeEdge[] = ["n", "s", "e", "w", "ne", "nw", "se", "sw"];

function buildEdgeStyles(
  handleSize: number,
): Record<ResizeEdge, { style: React.CSSProperties; cursor: string }> {
  return {
    n: {
      style: {
        top: 0,
        left: handleSize,
        right: handleSize,
        height: handleSize,
      },
      cursor: "ns-resize",
    },
    s: {
      style: {
        bottom: 0,
        left: handleSize,
        right: handleSize,
        height: handleSize,
      },
      cursor: "ns-resize",
    },
    e: {
      style: {
        right: 0,
        top: handleSize,
        bottom: handleSize,
        width: handleSize,
      },
      cursor: "ew-resize",
    },
    w: {
      style: {
        left: 0,
        top: handleSize,
        bottom: handleSize,
        width: handleSize,
      },
      cursor: "ew-resize",
    },
    ne: {
      style: {
        top: 0,
        right: 0,
        width: handleSize * 2,
        height: handleSize * 2,
      },
      cursor: "nesw-resize",
    },
    nw: {
      style: { top: 0, left: 0, width: handleSize * 2, height: handleSize * 2 },
      cursor: "nwse-resize",
    },
    se: {
      style: {
        bottom: 0,
        right: 0,
        width: handleSize * 2,
        height: handleSize * 2,
      },
      cursor: "nwse-resize",
    },
    sw: {
      style: {
        bottom: 0,
        left: 0,
        width: handleSize * 2,
        height: handleSize * 2,
      },
      cursor: "nesw-resize",
    },
  };
}

export default function StickyNote({
  note,
  index,
  colors,
  savedPos,
  savedSize,
}: StickyNoteProps) {
  const stickyStyles = useStore(stylesStore, (s) => s.styles?.stickyNote);
  const stickyWindow = useStore(
    stylesStore,
    (s) => s.styles?.windows.stickyNote,
  );
  const zLayers = useStore(stylesStore, (s) => s.styles?.zLayers);
  const messages = useStore(extensionStore, (s) => s.config?.messages);
  const dragMargin =
    useStore(extensionStore, (s) => s.config?.behavior.windowDragMarginPx) ??
    20;
  const dragLabel = messages?.info.DRAG_LABEL;
  const closeLabel = messages?.info.CLOSE_LABEL;

  const minWidth = stickyWindow?.minWidth ?? 180;
  const minHeight = stickyWindow?.minHeight ?? 140;
  const maxWidth = stickyWindow?.maxWidth ?? 600;
  const maxHeight = stickyWindow?.maxHeight ?? 800;
  const initialWidth = stickyWindow?.initialWidth ?? 240;
  const estW = savedSize?.width ?? initialWidth;
  const estH = savedSize?.height ?? minHeight;
  const baseBottom = stickyStyles?.baseBottom ?? 80;
  const baseRight = stickyStyles?.baseRight ?? 20;
  const stackBottom = stickyStyles?.stackOffsetBottom ?? 30;
  const stackRight = stickyStyles?.stackOffsetRight ?? 20;
  const rawTop = window.innerHeight - baseBottom - estH - index * stackBottom;
  const rawLeft = window.innerWidth - baseRight - estW - index * stackRight;
  const maxTop = Math.max(dragMargin, window.innerHeight - estH - dragMargin);
  const maxLeft = Math.max(dragMargin, window.innerWidth - estW - dragMargin);
  const defaultTop = Math.max(dragMargin, Math.min(maxTop, rawTop));
  const defaultLeft = Math.max(dragMargin, Math.min(maxLeft, rawLeft));
  const handleSize = stickyStyles?.handleSize ?? 6;
  const borderRadius = stickyStyles?.borderRadius ?? 4;
  const headerPadding = stickyStyles?.headerPadding ?? "8px 8px 4px 8px";
  const headerGap = stickyStyles?.headerGap ?? 4;
  const buttonSize = stickyStyles?.buttonSize ?? 20;
  const saveIconSize = stickyStyles?.saveIconSize ?? 12;
  const closeIconSize = stickyStyles?.closeIconSize ?? 13;
  const boxShadowFocused =
    stickyStyles?.boxShadow ?? "0 8px 24px rgba(0,0,0,0.4)";
  const boxShadowUnfocused =
    stickyStyles?.boxShadowUnfocused ?? "0 4px 12px rgba(0,0,0,0.25)";
  const placeholderColor =
    stickyStyles?.placeholderColor ?? "rgba(255,255,255,0.4)";
  const transitionMs = stickyStyles?.transitionMs ?? 200;
  const edgeStyles = buildEdgeStyles(handleSize);

  const containerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const lastSavedRef = useRef<string>(stripHtml(note.content));

  const [content, setContent] = useState(stripHtml(note.content));
  const [saving, setSaving] = useState(false);
  const [isFocused, setIsFocused] = useState(true);
  const [isHovered, setIsHovered] = useState(false);
  const [headerHeight, setHeaderHeight] = useState(32);

  const { pos, setPos, onHeaderMouseDown } = useDraggable(
    containerRef,
    savedPos?.top ?? defaultTop,
    savedPos?.left ?? defaultLeft,
    dragMargin,
  );
  const { size, onMouseDownEdge } = useResizable(containerRef, {
    minWidth,
    minHeight,
    maxWidth,
    maxHeight,
    initialWidth: savedSize?.width ?? initialWidth,
    initialHeight: savedSize?.height,
    position: pos,
    onPositionChange: setPos,
  });

  // biome-ignore lint/correctness/useExhaustiveDependencies: these style values drive the header's rendered size and arrive asynchronously from stylesStore after mount
  useLayoutEffect(() => {
    if (headerRef.current) {
      setHeaderHeight(headerRef.current.offsetHeight);
    }
  }, [headerPadding, buttonSize, headerGap, saveIconSize, closeIconSize]);

  useEffect(() => {
    const handleMouseDown = (e: MouseEvent) => {
      const path = e.composedPath();
      const inside =
        containerRef.current && path.includes(containerRef.current);
      setIsFocused(!!inside);
    };
    document.addEventListener("mousedown", handleMouseDown, true);
    return () =>
      document.removeEventListener("mousedown", handleMouseDown, true);
  }, []);

  useEffect(() => {
    const next = stripHtml(note.content);
    if (next !== lastSavedRef.current) {
      lastSavedRef.current = next;
      setContent(next);
      if (editorRef.current && editorRef.current.innerText !== next) {
        editorRef.current.innerText = next;
      }
    }
  }, [note.content]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: must run once at mount only, to seed the contenteditable div; re-running on content change would reset the caret while typing
  useEffect(() => {
    if (editorRef.current && editorRef.current.innerText !== content) {
      editorRef.current.innerText = content;
    }
  }, []);

  function handleInput(e: React.FormEvent<HTMLDivElement>) {
    const value = (e.currentTarget.innerText ?? "").replace(/ /g, " ");
    setContent(value);
  }

  function handleSaveAction() {
    if (saving || content === lastSavedRef.current) return;
    setSaving(true);
    const value = content;
    lastSavedRef.current = value;
    updateNote(note.id, value)
      .catch(() => {})
      .finally(() => setSaving(false));
  }

  function handleHide() {
    hideStickyNote(note.id);
  }

  function handleHeaderMouseDown(e: React.MouseEvent) {
    onHeaderMouseDown(e);
    const onUp = () => {
      document.removeEventListener("mouseup", onUp, true);
      const el = containerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      saveStickyPosition(note.id, { top: rect.top, left: rect.left });
    };
    document.addEventListener("mouseup", onUp, true);
  }

  function handleEdgeMouseDown(edge: ResizeEdge) {
    return (e: React.MouseEvent) => {
      onMouseDownEdge(edge)(e);
      const onUp = () => {
        document.removeEventListener("mouseup", onUp, true);
        const el = containerRef.current;
        if (!el) return;
        const rect = el.getBoundingClientRect();
        saveStickySize(note.id, { width: rect.width, height: rect.height });
        saveStickyPosition(note.id, { top: rect.top, left: rect.left });
      };
      document.addEventListener("mouseup", onUp, true);
    };
  }

  const effectiveZIndex = resolveZIndex({ isHovered, isFocused }, zLayers);
  const isEmpty = content.length === 0;
  const headerVisible = isFocused || isHovered;
  const opacity = headerVisible ? 1 : (stickyStyles?.unfocusedOpacity ?? 0.45);

  return (
    <div
      ref={containerRef}
      data-vigogh-sticky="true"
      className="fixed"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        zIndex: effectiveZIndex,
        top: `${pos.top}px`,
        left: `${pos.left}px`,
        minWidth: `${minWidth}px`,
        minHeight: `${minHeight}px`,
        maxWidth: `${maxWidth}px`,
        maxHeight: `${maxHeight}px`,
        width: size ? `${size.width}px` : undefined,
        height: size?.height != null ? `${size.height}px` : undefined,
        opacity,
        transition: headerVisible ? "none" : `opacity ${transitionMs}ms ease`,
      }}
    >
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            ref={headerRef}
            data-role="sticky-header"
            className="flex items-center select-none cursor-grab"
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              padding: headerPadding,
              gap: `${headerGap}px`,
              zIndex: 2,
              visibility: headerVisible ? "visible" : "hidden",
              pointerEvents: headerVisible ? "auto" : "none",
              opacity: headerVisible ? 1 : 0,
              transition: `opacity ${transitionMs}ms ease`,
            }}
            onMouseDown={handleHeaderMouseDown}
          >
            <div className="flex-1" />
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  className="flex items-center justify-center rounded bg-transparent text-white cursor-pointer hover:text-white border-none"
                  style={{
                    padding: 0,
                    width: `${buttonSize}px`,
                    height: `${buttonSize}px`,
                  }}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                  }}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    handleSaveAction();
                  }}
                >
                  {saving ? (
                    <Loader size={saveIconSize} className="animate-spin" />
                  ) : (
                    <Save size={saveIconSize} strokeWidth={2.5} />
                  )}
                </button>
              </TooltipTrigger>
              <TooltipContent>
                {messages?.info.NOTE_SAVE_TOOLTIP ?? ""}
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  className="flex items-center justify-center rounded bg-transparent text-white cursor-pointer border-none"
                  style={{
                    padding: 0,
                    width: `${buttonSize}px`,
                    height: `${buttonSize}px`,
                  }}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                  }}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    handleHide();
                  }}
                >
                  <X size={closeIconSize} />
                </button>
              </TooltipTrigger>
              <TooltipContent>
                {messages?.info.NOTE_HIDE_TOOLTIP ?? closeLabel}
              </TooltipContent>
            </Tooltip>
          </div>
        </TooltipTrigger>
        <TooltipContent>{dragLabel}</TooltipContent>
      </Tooltip>

      <div
        data-role="sticky-body"
        className="backdrop-blur-xl"
        style={{
          position: "absolute",
          top: headerVisible ? 0 : `${headerHeight}px`,
          bottom: 0,
          left: 0,
          right: 0,
          background: colors.menuBackground,
          border: `1px solid ${colors.menuBorderColor}`,
          borderRadius: `${borderRadius}px`,
          boxShadow: headerVisible ? boxShadowFocused : boxShadowUnfocused,
          overflow: "hidden",
          transition: `top ${transitionMs}ms ease, box-shadow ${transitionMs}ms ease`,
        }}
      >
        <div
          ref={editorRef}
          contentEditable
          suppressContentEditableWarning
          onInput={handleInput}
          onMouseDown={(e) => e.stopPropagation()}
          style={{
            position: "absolute",
            top: headerVisible ? `${headerHeight}px` : 0,
            bottom: 0,
            left: 0,
            right: 0,
            padding: stickyStyles?.editorPadding ?? "8px 10px 10px",
            fontSize: stickyStyles?.editorFontSize ?? "13px",
            color: colors.textColor ?? "#fff",
            lineHeight: "1.5",
            outline: "none",
            userSelect: "text",
            overflowY: "auto",
            scrollbarGutter: headerVisible ? "stable" : "auto",
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
            cursor: "text",
            transition: `top ${transitionMs}ms ease`,
          }}
        />
        {isEmpty && (
          <div
            style={{
              position: "absolute",
              top: headerVisible ? `${headerHeight + 8}px` : "8px",
              left: "10px",
              right: "10px",
              fontSize: stickyStyles?.editorFontSize ?? "13px",
              color: placeholderColor,
              pointerEvents: "none",
              userSelect: "none",
              transition: `top ${transitionMs}ms ease`,
            }}
          >
            {messages?.info.NOTE_EMPTY_PLACEHOLDER}
          </div>
        )}
      </div>

      {ALL_EDGES.map((edge) => (
        <div
          key={edge}
          className="absolute"
          style={{
            ...edgeStyles[edge].style,
            cursor: edgeStyles[edge].cursor,
            zIndex: 1,
          }}
          onMouseDown={handleEdgeMouseDown(edge)}
        />
      ))}
    </div>
  );
}
