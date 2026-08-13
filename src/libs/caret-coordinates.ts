import type { CaretCoordinates } from "@/types";

export function getSelectionCaretCoordinates(
  editor: HTMLElement,
): CaretCoordinates {
  const rect = editor.getBoundingClientRect();
  const selection = window.getSelection();

  if (selection && selection.rangeCount > 0) {
    const range = selection.getRangeAt(0);
    const isInsideEditor = editor.contains(range.startContainer);
    if (isInsideEditor) {
      const caretRect = range.getBoundingClientRect();
      if (caretRect.width !== 0 || caretRect.height !== 0) {
        return {
          top: caretRect.top,
          left: caretRect.right,
          height: caretRect.height,
        };
      }

      const marker = document.createElement("span");
      marker.textContent = "​";
      try {
        const probe = range.cloneRange();
        probe.collapse(false);
        probe.insertNode(marker);
        const markerRect = marker.getBoundingClientRect();
        marker.remove();
        if (markerRect.width !== 0 || markerRect.height !== 0) {
          return {
            top: markerRect.top,
            left: markerRect.right,
            height: markerRect.height,
          };
        }
      } catch {
        marker.remove();
      }
    }
  }

  return {
    top: rect.top,
    left: rect.left,
    height: rect.height,
  };
}
