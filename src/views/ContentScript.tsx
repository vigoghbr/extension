import { createRoot } from "react-dom/client";
import { initSessionCache as initAuthSessionCache } from "@/libs/auth";
import { installGlobalHandlers, logger } from "@/libs/logger";
import { extractPageContent } from "@/libs/page-content-extraction";
import { extractPageForms } from "@/libs/page-forms-extraction";
import { extractPageMetadata } from "@/libs/page-metadata-extraction";
import { extractPageURL } from "@/libs/page-url-extraction";
import { initSessionCache } from "@/libs/session";
import { toastr } from "@/libs/toastr";
import {
  activatePanel,
  extensionStore,
  getActiveStrategy,
  getEditorSelector,
  loadConfig,
  setCurrentEditor,
  setEditorFocused,
} from "@/stores/extensionStore";
import { initIndicatorListener } from "@/stores/indicatorsStore";
import {
  acceptCompletion,
  autocompleteStore,
  clearSuppress,
  dismissCompletion,
  scheduleCompletion,
} from "@/stores/tools/autocompleteStore";
import { setHasEditorText, setSelectedRange } from "@/stores/tools/toolsStore";
import { widgetStore } from "@/stores/widgetStore";
import { isExtensionContextValid } from "@/utils/extension-context";
import { type AttachableFile, triggerAttach } from "@/utils/files-attach";
import { DEFAULT_GENERAL_SELECTOR } from "@/utils/general-strategy";
import { applyQuickMessage } from "@/utils/quick-message-apply";
import App from "@/views/App";

if (!(window as any).__vigoghInit) {
  (window as any).__vigoghInit = true;
  installGlobalHandlers();

  function mount(): void {
    const host = document.createElement("div");
    host.id = "vigogh-extension-host";
    host.style.cssText =
      "font-size: 16px; line-height: 1.5; font-family: sans-serif; color: initial;";
    const shadowRoot = host.attachShadow({ mode: "open" });
    document.body.appendChild(host);

    const mountPoint = document.createElement("div");
    shadowRoot.appendChild(mountPoint);
    createRoot(mountPoint, {
      onUncaughtError: (error) => logger.error("react:uncaught", { error }),
      onCaughtError: (error) => logger.error("react:caught", { error }),
    }).render(<App />);

    loadConfig();
    void initAuthSessionCache();
    void initSessionCache();
    initIndicatorListener();
    setupListeners(host);
    notifyExtensionStatus();
    if (isExtensionContextValid()) {
      try {
        chrome.runtime.sendMessage({ action: "auth_check" }, () => {
          void chrome.runtime.lastError;
        });
      } catch {}
    }
  }

  function notifyExtensionStatus(): void {
    const unsubscribe = extensionStore.subscribe((state, prev) => {
      if (state.widgetVisible && !prev.widgetVisible) {
        toastr.neutral("AI_BUTTON_AVAILABLE", {
          id: "vigogh-ai-button-available",
        });
        unsubscribe();
      }
    });
  }

  function getEditorText(editor: Element): string {
    if (
      editor instanceof HTMLInputElement ||
      editor instanceof HTMLTextAreaElement
    ) {
      return editor.value;
    }
    return editor.textContent ?? "";
  }

  function updateHasEditorText(editor: Element): void {
    const strategy = getActiveStrategy();
    const text = strategy
      ? strategy.getCurrentText(editor as HTMLElement)
      : getEditorText(editor);
    setHasEditorText(text.trim().length > 0);
  }

  function setupListeners(host: HTMLElement): void {
    document.addEventListener(
      "focusin",
      (e: FocusEvent) => {
        const target = e.target as Element | null;
        if (!target) return;

        const siteSelector = getEditorSelector();
        if (siteSelector) {
          const editor = target.matches(siteSelector)
            ? target
            : target.closest(siteSelector);
          if (editor) {
            setCurrentEditor(editor);
            updateHasEditorText(editor);
            return;
          }
        }

        const editor = target.matches(DEFAULT_GENERAL_SELECTOR)
          ? target
          : target.closest(DEFAULT_GENERAL_SELECTOR);
        if (editor) {
          setCurrentEditor(editor);
          updateHasEditorText(editor);
        }
      },
      true,
    );

    document.addEventListener(
      "focusout",
      (e: FocusEvent) => {
        const related = e.relatedTarget as Node | null;
        if (related && (related === host || host.contains(related))) return;
        if (widgetStore.getState().activePopovers.length > 0) return;
        if (autocompleteStore.getState().overlayVisible) return;
        const { currentEditor } = extensionStore.getState();
        if (currentEditor) updateHasEditorText(currentEditor);
        setEditorFocused(false);
      },
      true,
    );

    document.addEventListener(
      "input",
      (e: Event) => {
        const target = e.target as Node | null;
        const { currentEditor } = extensionStore.getState();
        if (
          currentEditor &&
          (target === currentEditor || currentEditor.contains(target))
        ) {
          updateHasEditorText(currentEditor);
        }
        const { autocompleteEditor } = autocompleteStore.getState();
        if (
          autocompleteEditor &&
          (target === autocompleteEditor || autocompleteEditor.contains(target))
        ) {
          scheduleCompletion();
        }
      },
      true,
    );

    document.addEventListener(
      "keyup",
      (e: KeyboardEvent) => {
        if (e.key.length !== 1 && e.key !== "Backspace" && e.key !== "Delete")
          return;
        const target = e.target as Node | null;
        const { currentEditor } = extensionStore.getState();
        if (
          currentEditor &&
          (target === currentEditor || currentEditor.contains(target))
        ) {
          updateHasEditorText(currentEditor);
        }
        const { autocompleteEditor } = autocompleteStore.getState();
        if (
          autocompleteEditor &&
          (target === autocompleteEditor || autocompleteEditor.contains(target))
        ) {
          scheduleCompletion();
        }
      },
      true,
    );

    document.addEventListener(
      "keydown",
      (e: KeyboardEvent) => {
        const autocompleteState = autocompleteStore.getState();
        const { config } = extensionStore.getState();
        if (
          autocompleteState.suppressUntilKeydown &&
          e.key.length === 1 &&
          !e.ctrlKey &&
          !e.metaKey &&
          !e.altKey
        ) {
          clearSuppress();
        }
        if (!autocompleteState.overlayVisible) return;
        if (!config) return;
        const acceptKey = config.behavior.acceptKey;
        const dismissKey = config.behavior.dismissKey;
        if (e.key === acceptKey) {
          e.preventDefault();
          e.stopPropagation();
          acceptCompletion();
          return;
        }
        if (e.key === dismissKey) {
          e.preventDefault();
          dismissCompletion();
        }
      },
      true,
    );

    document.addEventListener(
      "mouseup",
      (_e: MouseEvent) => {
        const { currentEditor } = extensionStore.getState();
        if (!currentEditor) return;
        const selection = window.getSelection();
        if (!selection || selection.isCollapsed || !selection.rangeCount)
          return;
        if (!currentEditor.contains(selection.anchorNode)) return;
        const selectedText = selection.toString().trim();
        const { config } = extensionStore.getState();
        if (!config) return;
        if (selectedText.length < (config.behavior.minSelectionLength ?? 0))
          return;
        setSelectedRange(selection.getRangeAt(0).cloneRange());
      },
      true,
    );

    document.addEventListener(
      "dragover",
      (e: DragEvent) => {
        const types = e.dataTransfer?.types ?? [];
        if (
          types.includes("application/x-vigogh-text") ||
          types.includes("application/x-vigogh-file") ||
          types.includes("application/x-vigogh-quick-message")
        ) {
          e.preventDefault();
        }
      },
      true,
    );

    document.addEventListener(
      "drop",
      (e: DragEvent) => {
        const fileData = e.dataTransfer?.getData("application/x-vigogh-file");
        if (fileData) {
          e.preventDefault();
          e.stopPropagation();
          try {
            const item = JSON.parse(fileData) as AttachableFile;
            void triggerAttach(item);
          } catch (error) {
            logger.error("files:drop:parse-error", { error });
          }
          return;
        }
        const quickMessageText = e.dataTransfer?.getData(
          "application/x-vigogh-quick-message",
        );
        if (quickMessageText) {
          e.preventDefault();
          e.stopPropagation();
          applyQuickMessage(quickMessageText);
          return;
        }
        const text = e.dataTransfer?.getData("application/x-vigogh-text");
        if (!text) return;
        const { currentEditor } = extensionStore.getState();
        if (!currentEditor) return;
        if (!currentEditor.contains(e.target as Node)) return;
        e.preventDefault();
        const strategy = getActiveStrategy();
        if (strategy) {
          strategy.insertText(currentEditor as HTMLElement, text);
        } else {
          (currentEditor as HTMLElement).focus();
          document.execCommand("insertText", false, text);
        }
      },
      true,
    );

    chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
      if (msg.action === "extract_page_content") {
        const maxBytes = msg.maxLength ?? 512 * 1024;
        const pageURL = extractPageURL();
        const pageContent = extractPageContent(maxBytes);
        const pageMetadata = extractPageMetadata();
        const pageForms = extractPageForms();

        if (__DEV__) {
          logger.debug("content:extract-page-content:pageURL", { pageURL });
          logger.debug("content:extract-page-content:pageContent", {
            pageContent,
          });
          logger.debug("content:extract-page-content:pageMetadata", {
            pageMetadata,
          });
          logger.debug("content:extract-page-content:pageForms", {
            pageForms,
          });
        }

        sendResponse({ pageURL, pageContent, pageMetadata, pageForms });
        return;
      }
      if (msg.action === "serious_error_toast") {
        const code = msg.payload?.isAuthError ? "UNAUTHORIZED" : null;
        toastr.error(code, {
          id: `vigogh-serious-error-${msg.payload?.status ?? 0}`,
        });
      }
      if (msg.action === "hide_for_capture") {
        host.style.visibility = "hidden";
        const bottom = document.getElementById("vigogh-bottom-indicator");
        if (bottom) bottom.style.visibility = "hidden";
        const top = document.getElementById("vigogh-top-indicator");
        if (top) top.style.visibility = "hidden";
      }
      if (msg.action === "restore_after_capture") {
        host.style.visibility = "";
        const bottom = document.getElementById("vigogh-bottom-indicator");
        if (bottom) bottom.style.visibility = "";
        const top = document.getElementById("vigogh-top-indicator");
        if (top) top.style.visibility = "";
      }
      if (msg.action === "activate_widget") {
        activatePanel();
      }
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mount);
  } else {
    mount();
  }
}
