import {
  insertTextIntoContentEditable,
  insertTextIntoTextarea,
  replaceAllTextInContentEditable,
  replaceAllTextInTextarea,
} from "@/libs/text-insertion";
import type { CaretCoordinates, SiteConfig, SiteStrategy } from "@/types";
import {
  pasteFileIntoEditor,
  pasteTextIntoEditor,
} from "@/utils/general-strategy";

export class SiteEngine implements SiteStrategy {
  readonly siteKey: string;
  private config: SiteConfig;

  constructor(config: SiteConfig) {
    this.siteKey = config.key;
    this.config = config;
  }

  getCurrentText(editor: HTMLElement): string {
    if (this.config.editorType === "mixed" && editor.tagName === "TEXTAREA") {
      return (editor as HTMLTextAreaElement).value;
    }

    const paragraphs = editor.querySelectorAll("p");
    if (paragraphs.length === 0) return editor.textContent?.trim() || "";
    return Array.from(paragraphs)
      .map((p) => p.textContent || "")
      .join("\n");
  }

  getCaretCoordinates(editor: HTMLElement): CaretCoordinates | null {
    if (this.config.editorType === "mixed" && editor.tagName === "TEXTAREA") {
      const rect = editor.getBoundingClientRect();
      return {
        top: rect.top,
        left: rect.left + rect.width * 0.5,
        height: rect.height,
      };
    }

    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return null;

    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();

    if (rect.width === 0 && rect.height === 0) {
      const editorRect = editor.getBoundingClientRect();
      return {
        top: editorRect.top,
        left: editorRect.left,
        height: editorRect.height,
      };
    }

    return {
      top: rect.top,
      left: rect.right,
      height: rect.height,
    };
  }

  insertText(editor: HTMLElement, text: string): void {
    if (this.config.editorType === "mixed" && editor.tagName === "TEXTAREA") {
      insertTextIntoTextarea(editor as HTMLTextAreaElement, text);
    } else {
      insertTextIntoContentEditable(editor, text);
    }
  }

  replaceAllText(editor: HTMLElement, text: string): void {
    if (this.config.editorType === "mixed" && editor.tagName === "TEXTAREA") {
      replaceAllTextInTextarea(editor as HTMLTextAreaElement, text);
    } else {
      replaceAllTextInContentEditable(editor, text);
    }
  }

  replaceSelectedText(
    editor: HTMLElement,
    newText: string,
    savedRange: Range,
  ): void {
    editor.focus();

    if (this.config.editorType === "mixed" && editor.tagName === "TEXTAREA") {
      const textarea = editor as HTMLTextAreaElement;
      const start = savedRange.startOffset;
      const end = savedRange.endOffset;
      const value = textarea.value;
      const nativeSetter = Object.getOwnPropertyDescriptor(
        HTMLTextAreaElement.prototype,
        "value",
      )?.set;
      const newValue = value.slice(0, start) + newText + value.slice(end);
      if (nativeSetter) {
        nativeSetter.call(textarea, newValue);
      } else {
        textarea.value = newValue;
      }
      textarea.selectionStart = start + newText.length;
      textarea.selectionEnd = start + newText.length;
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
      textarea.dispatchEvent(new Event("change", { bubbles: true }));
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

    if (!cancelled) {
      document.execCommand("insertText", false, newText);
    }

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
    if (this.config.editorType === "mixed" && editor.tagName === "TEXTAREA") {
      return false;
    }
    return pasteFileIntoEditor(editor, file);
  }
}
