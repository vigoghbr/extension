import { createRoot } from "react-dom/client";
import { installGlobalHandlers, logger } from "@/libs/logger";

installGlobalHandlers();

import { initSessionCache } from "@/libs/auth";
import { emitErrorToastr, emitNeutralToastr } from "@/libs/toast";
import { aiMenuStore } from "@/stores/aiMenuStore";
import {
  extensionStore,
  getActiveStrategy,
  getEditorSelector,
  getGeneralInputSelector,
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
import { isExtensionContextValid } from "@/utils/extension-context";
import {
  type AttachableFile,
  isAttachInProgress,
  triggerAttach,
} from "@/utils/files-attach";
import { hideIndicator, showIndicator } from "@/utils/indicators";
import { applyQuickMessage } from "@/utils/quick-message-apply";
import App from "@/views/App";

if (!(window as any).__vigoghInit) {
  (window as any).__vigoghInit = true;

  function mount(): void {
    const host = document.createElement("div");
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

    loadConfig(() => {
      requestAnimationFrame(() => {
        emitNeutralToastr("AUTOCOMPLETE_ENABLED", {
          id: "vigogh-autocomplete-restored",
        });
      });
    });
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
      if (state.aiMenuVisible && !prev.aiMenuVisible) {
        emitNeutralToastr("AI_BUTTON_AVAILABLE", {
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
    const generalToastShown = new WeakSet<Element>();

    function notifyDefaultStrategyActivated(editor: Element): void {
      if (isAttachInProgress()) return;
      if (generalToastShown.has(editor)) return;
      generalToastShown.add(editor);
      emitNeutralToastr("DEFAULT_STRATEGY_ACTIVATED", {
        id: "vigogh-default-strategy-activated",
      });
    }

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

        const generalSelector = getGeneralInputSelector();
        if (generalSelector) {
          const editor = target.matches(generalSelector)
            ? target
            : target.closest(generalSelector);
          if (editor) {
            setCurrentEditor(editor);
            updateHasEditorText(editor);
            notifyDefaultStrategyActivated(editor);
          }
        }
      },
      true,
    );

    document.addEventListener(
      "focusout",
      (e: FocusEvent) => {
        const related = e.relatedTarget as Node | null;
        if (related && (related === host || host.contains(related))) return;
        if (aiMenuStore.getState().activePopovers.length > 0) return;
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
        const { currentEditor } = extensionStore.getState();
        if (!currentEditor) return;
        const target = e.target as Node | null;
        if (target !== currentEditor && !currentEditor.contains(target)) return;
        scheduleCompletion();
        updateHasEditorText(currentEditor);
      },
      true,
    );

    document.addEventListener(
      "keyup",
      (e: KeyboardEvent) => {
        const { currentEditor } = extensionStore.getState();
        if (!currentEditor) return;
        const target = e.target as Node | null;
        if (target !== currentEditor && !currentEditor.contains(target)) return;
        if (e.key.length === 1 || e.key === "Backspace" || e.key === "Delete") {
          scheduleCompletion();
          updateHasEditorText(currentEditor);
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

    chrome.runtime.onMessage.addListener((msg) => {
      if (msg.action === "serious_error_toast") {
        const code = msg.payload?.isAuthError ? "UNAUTHORIZED" : null;
        emitErrorToastr(code, {
          id: `vigogh-serious-error-${msg.payload?.status ?? 0}`,
        });
      }
      if (msg.action === "hide_for_capture") {
        host.style.visibility = "hidden";
        const bottom = document.getElementById("vigogh-bottom-indicator");
        if (bottom) bottom.style.visibility = "hidden";
        const config = extensionStore.getState().config;
        if (config) {
          showIndicator("page", config);
          const pageEl = document.getElementById("vigogh-page-indicator");
          if (pageEl) pageEl.style.visibility = "hidden";
        }
      }
      if (msg.action === "restore_after_capture") {
        host.style.visibility = "";
        const bottom = document.getElementById("vigogh-bottom-indicator");
        if (bottom) bottom.style.visibility = "";
        const pageEl = document.getElementById("vigogh-page-indicator");
        if (pageEl) {
          pageEl.style.visibility = "";
          setTimeout(() => hideIndicator("page"), 600);
        }
      }
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mount);
  } else {
    mount();
  }
}
