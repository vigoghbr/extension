import {
  insertTextIntoContentEditable,
  insertTextIntoTextarea,
  replaceAllTextInContentEditable,
  replaceAllTextInTextarea,
} from "@/libs/text-insertion";
import type {
  CaretCoordinates,
  ConversationMessage,
  SiteConfig,
  SiteContextDirect,
  SiteContextMode,
  SiteContextWithModes,
  SiteStrategy,
} from "@/types";
import {
  pasteFileIntoEditor,
  pasteTextIntoEditor,
} from "@/utils/general-strategy";

export function hasModesContext(
  context: SiteConfig["context"],
): context is SiteContextWithModes {
  return "modes" in context;
}

export function extractMessagesFromContainer(
  container: Element,
  mode: SiteContextMode | SiteContextDirect,
): ConversationMessage[] {
  const messages: ConversationMessage[] = [];

  if (mode.allIncoming) {
    const textSelector = mode.textSelector;
    if (textSelector) {
      const textEl = container.querySelector(textSelector);
      const text = textEl?.textContent?.trim();
      if (text) {
        messages.push({ role: "incoming", text });
      }
    }
    return messages;
  }

  type MediaBody = {
    image?: string;
    audio?: string;
    video?: string;
    file?: string;
  };
  type MessageBody = { text: string } | MediaBody;

  if (!mode.messageSelector) return messages;

  const messageEls = container.querySelectorAll(mode.messageSelector);
  const maxMessages = mode.maxMessages ?? 10;
  const recent = Array.from(messageEls).slice(-maxMessages);
  const seen = mode.deduplicate ? new Set<string>() : null;

  for (const el of recent) {
    let source: Element = el;
    if (mode.textCleanup === "remove-non-last-child-divs") {
      const clone = el.cloneNode(true) as Element;
      const directDivs = Array.from(clone.querySelectorAll(":scope > div"));
      if (directDivs.length > 1) {
        directDivs.slice(0, -1).forEach((d) => d.remove());
      }
      source = clone;
    }

    const textSelector = mode.textSelector;
    const textEl = textSelector ? source.querySelector(textSelector) : null;
    const rawText = textSelector
      ? (textEl?.textContent?.trim() ?? "")
      : (source.textContent?.trim() ?? "");

    let body: MessageBody | null = null;

    if (rawText) {
      const metaSource = mode.metadataSelector
        ? (el.querySelector(mode.metadataSelector) ?? el)
        : el;
      const meta = mode.metadataAttribute
        ? (metaSource.getAttribute(mode.metadataAttribute) ?? "")
        : "";
      let text = rawText;
      if (mode.metadataStrip === "bracket-timestamp" && meta) {
        const bracketEnd = meta.indexOf("] ");
        const shortTime =
          bracketEnd >= 0 ? meta.slice(1, bracketEnd).split(",")[0].trim() : "";
        if (shortTime && text.endsWith(shortTime)) {
          text = text.slice(0, -shortTime.length).trim();
        }
      }
      if (!text) continue;

      if (seen !== null) {
        const key = meta ? `${meta}::${text}` : text;
        if (seen.has(key)) continue;
        seen.add(key);
      }

      body = { text };
    } else if (mode.mediaPlaceholders) {
      for (const placeholder of mode.mediaPlaceholders) {
        const target = el.matches(placeholder.selector)
          ? el
          : el.querySelector(placeholder.selector);
        if (!target) continue;

        if (placeholder.field === "text") {
          if (placeholder.text) body = { text: placeholder.text };
          break;
        }

        const contentEl = placeholder.contentSelector
          ? el.querySelector(placeholder.contentSelector)
          : target;
        const value = contentEl
          ? placeholder.contentAttribute
            ? contentEl.getAttribute(placeholder.contentAttribute)
            : (contentEl.getAttribute("src") ??
              contentEl.getAttribute("href") ??
              contentEl.getAttribute("data-src"))
          : null;

        if (value) {
          body = { [placeholder.field]: value };
        } else if (placeholder.text) {
          body = { text: placeholder.text };
        }
        break;
      }
    }

    if (!body) continue;

    let role: "incoming" | "outgoing" = "incoming";
    if (mode.outgoingSelector) {
      const isOutgoing =
        mode.outgoingRelation === "ancestor"
          ? !!el.closest(mode.outgoingSelector)
          : el.matches(mode.outgoingSelector) ||
            !!el.querySelector(mode.outgoingSelector);
      role = isOutgoing ? "outgoing" : "incoming";
    }
    messages.push({ role, ...body });
  }

  return messages;
}

export function resolveConversationContext(
  editor: HTMLElement,
  ctx: SiteConfig["context"],
): ConversationMessage[] {
  if (hasModesContext(ctx)) {
    for (const mode of ctx.modes) {
      const container =
        mode.containerRelation === "closest"
          ? editor.closest(mode.containerSelector)
          : document.querySelector(mode.containerSelector);
      if (!container) continue;
      const messages = extractMessagesFromContainer(container, mode);
      if (messages.length > 0) return messages;
    }
    return [];
  }
  const container =
    ctx.containerRelation === "closest"
      ? editor.closest(ctx.containerSelector)
      : document.querySelector(ctx.containerSelector);
  if (!container) return [];
  return extractMessagesFromContainer(container, ctx);
}

export class SiteEngine implements SiteStrategy {
  readonly siteKey: string;
  private config: SiteConfig;

  constructor(config: SiteConfig) {
    this.siteKey = config.key;
    this.config = config;
  }

  getEditorSelector(): string {
    return this.config.editorSelector;
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

  getConversationContext(editor: HTMLElement): ConversationMessage[] {
    return resolveConversationContext(editor, this.config.context);
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

  observeEditorChanges(callback: () => void): (() => void) | null {
    const obs = this.config.observer;
    if (!obs) return null;

    const target = document.querySelector(obs.target);
    if (!target) return null;

    const observer = new MutationObserver(() => callback());
    observer.observe(target, {
      childList: obs.childList,
      subtree: obs.subtree,
    });

    return () => observer.disconnect();
  }
}
