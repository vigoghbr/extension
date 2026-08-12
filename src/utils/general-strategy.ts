import { getSelectionCaretCoordinates } from "@/libs/caret-coordinates";
import {
  insertTextIntoContentEditable,
  replaceAllTextInContentEditable,
} from "@/libs/text-insertion";
import { measureWidth } from "@/libs/text-measure";
import type { CaretCoordinates, SiteStrategy } from "@/types";

export const DEFAULT_GENERAL_SELECTOR = [
  'input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]):not([type="submit"]):not([type="button"]):not([type="reset"]):not([type="file"]):not([type="image"])',
  "textarea",
  '[contenteditable="true"]',
  '[contenteditable=""]',
].join(", ");

function isInputLike(
  editor: HTMLElement,
): editor is HTMLInputElement | HTMLTextAreaElement {
  return (
    editor instanceof HTMLInputElement || editor instanceof HTMLTextAreaElement
  );
}

function getNativeSetter(
  el: HTMLInputElement | HTMLTextAreaElement,
): ((v: string) => void) | undefined {
  const proto =
    el instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
  return Object.getOwnPropertyDescriptor(proto, "value")?.set as
    | ((v: string) => void)
    | undefined;
}

export class GeneralInputStrategy implements SiteStrategy {
  readonly siteKey = "general";

  getCurrentText(editor: HTMLElement): string {
    if (isInputLike(editor)) return editor.value;
    return editor.textContent?.trim() ?? "";
  }

  getCaretCoordinates(editor: HTMLElement): CaretCoordinates | null {
    const rect = editor.getBoundingClientRect();

    if (isInputLike(editor)) {
      const style = window.getComputedStyle(editor);
      const paddingLeft = parseFloat(style.paddingLeft) || 0;
      const paddingTop = parseFloat(style.paddingTop) || 0;
      const lineHeight =
        parseFloat(style.lineHeight) ||
        parseFloat(style.fontSize) ||
        rect.height;
      const font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
      const caretIndex = editor.selectionStart ?? editor.value.length;
      const before = editor.value.slice(0, caretIndex);

      if (editor instanceof HTMLTextAreaElement) {
        const lastNewline = before.lastIndexOf("\n");
        const currentLine =
          lastNewline >= 0 ? before.slice(lastNewline + 1) : before;
        const lineIndex = before.length - before.replace(/\n/g, "").length;
        const left =
          rect.left +
          paddingLeft -
          editor.scrollLeft +
          measureWidth(currentLine, font);
        const top =
          rect.top + paddingTop + lineIndex * lineHeight - editor.scrollTop;
        return { top, left, height: lineHeight };
      }

      const left =
        rect.left +
        paddingLeft -
        editor.scrollLeft +
        measureWidth(before, font);
      const top = rect.top + paddingTop;
      return { top, left, height: lineHeight };
    }

    return getSelectionCaretCoordinates(editor);
  }

  insertText(editor: HTMLElement, text: string): void {
    if (!isInputLike(editor)) {
      insertTextIntoContentEditable(editor, text);
      return;
    }
    editor.focus();
    const start = editor.selectionStart ?? editor.value.length;
    const newValue =
      editor.value.slice(0, start) + text + editor.value.slice(start);
    const set = getNativeSetter(editor);
    if (set) set.call(editor, newValue);
    else editor.value = newValue;
    editor.selectionStart = start + text.length;
    editor.selectionEnd = start + text.length;
    editor.dispatchEvent(new Event("input", { bubbles: true }));
    editor.dispatchEvent(new Event("change", { bubbles: true }));
  }

  replaceAllText(editor: HTMLElement, text: string): void {
    if (!isInputLike(editor)) {
      replaceAllTextInContentEditable(editor, text);
      return;
    }
    editor.focus();
    editor.select();
    const set = getNativeSetter(editor);
    if (set) set.call(editor, text);
    else editor.value = text;
    editor.selectionStart = text.length;
    editor.selectionEnd = text.length;
    editor.dispatchEvent(new Event("input", { bubbles: true }));
    editor.dispatchEvent(new Event("change", { bubbles: true }));
  }

  replaceSelectedText(
    editor: HTMLElement,
    newText: string,
    savedRange: Range,
  ): void {
    editor.focus();

    if (isInputLike(editor)) {
      const start = savedRange.startOffset;
      const end = savedRange.endOffset;
      const newValue =
        editor.value.slice(0, start) + newText + editor.value.slice(end);
      const set = getNativeSetter(editor);
      if (set) set.call(editor, newValue);
      else editor.value = newValue;
      editor.selectionStart = start + newText.length;
      editor.selectionEnd = start + newText.length;
      editor.dispatchEvent(new Event("input", { bubbles: true }));
      editor.dispatchEvent(new Event("change", { bubbles: true }));
      return;
    }

    const selection = window.getSelection();
    if (selection) {
      selection.removeAllRanges();
      selection.addRange(savedRange);
    }

    const cancelled = !editor.dispatchEvent(
      new InputEvent("beforeinput", {
        inputType: "insertText",
        data: newText,
        bubbles: true,
        cancelable: true,
        composed: true,
      }),
    );

    if (!cancelled) document.execCommand("insertText", false, newText);

    editor.dispatchEvent(new Event("input", { bubbles: true }));
    editor.dispatchEvent(new Event("change", { bubbles: true }));
  }

  pasteText(
    editor: HTMLElement,
    text: string,
    mode: "insert" | "replaceAll" | "replaceSelected",
    savedRange?: Range,
  ): void {
    pasteTextIntoEditor(editor, text, mode, savedRange);
  }

  pasteFile(editor: HTMLElement, file: File): boolean {
    return pasteFileIntoEditor(editor, file);
  }
}

export function pasteTextIntoEditor(
  editor: HTMLElement,
  text: string,
  mode: "insert" | "replaceAll" | "replaceSelected",
  savedRange?: Range,
): void {
  editor.focus();

  if (isInputLike(editor)) {
    if (mode === "replaceAll") {
      editor.setSelectionRange(0, editor.value.length);
    } else if (mode === "replaceSelected" && savedRange) {
      editor.setSelectionRange(savedRange.startOffset, savedRange.endOffset);
    }
  } else {
    const selection = window.getSelection();
    if (selection) {
      if (mode === "replaceAll") {
        const range = document.createRange();
        range.selectNodeContents(editor);
        selection.removeAllRanges();
        selection.addRange(range);
      } else if (mode === "replaceSelected" && savedRange) {
        selection.removeAllRanges();
        selection.addRange(savedRange);
      }
    }
  }

  const dt = new DataTransfer();
  dt.setData("text/plain", text);

  const pasteEvent = new ClipboardEvent("paste", {
    bubbles: true,
    cancelable: true,
    clipboardData: dt,
  });
  try {
    Object.defineProperty(pasteEvent, "clipboardData", { value: dt });
  } catch {}

  const handled = !editor.dispatchEvent(pasteEvent);
  if (handled) return;

  if (isInputLike(editor)) {
    const start = editor.selectionStart ?? editor.value.length;
    const end = editor.selectionEnd ?? start;
    const newValue =
      editor.value.slice(0, start) + text + editor.value.slice(end);
    const set = getNativeSetter(editor);
    if (set) set.call(editor, newValue);
    else editor.value = newValue;
    editor.selectionStart = start + text.length;
    editor.selectionEnd = start + text.length;
    editor.dispatchEvent(new Event("input", { bubbles: true }));
    editor.dispatchEvent(new Event("change", { bubbles: true }));
    return;
  }

  document.execCommand("insertText", false, text);
  editor.dispatchEvent(new Event("input", { bubbles: true }));
  editor.dispatchEvent(new Event("change", { bubbles: true }));
}

export function pasteFileIntoEditor(editor: HTMLElement, file: File): boolean {
  if (isInputLike(editor)) return false;

  editor.focus();

  const dt = new DataTransfer();
  dt.items.add(file);

  const pasteEvent = new ClipboardEvent("paste", {
    bubbles: true,
    cancelable: true,
    clipboardData: dt,
  });

  try {
    Object.defineProperty(pasteEvent, "clipboardData", { value: dt });
  } catch {}

  const cancelled = !editor.dispatchEvent(pasteEvent);
  return cancelled;
}
