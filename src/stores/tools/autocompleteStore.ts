import { createStore } from "zustand/vanilla";
import { extensionStore, getActiveStrategy } from "@/stores/extensionStore";
import { isExtensionContextValid } from "@/utils/extension-context";
import {
  emitErrorToastr,
  emitLoadingToastr,
  emitNeutralToastr,
  toast,
} from "@/libs/toast";

type AsyncStatus = "idle" | "loading" | "success" | "error";

interface AutocompleteState {
  currentCompletion: string;
  currentSavedText: string;
  currentCompletionId: string;
  overlayVisible: boolean;
  suppressUntilKeydown: boolean;
  requestGeneration: number;
  status: AsyncStatus;
  error: string | null;
}

export const autocompleteStore = createStore<AutocompleteState>()(() => ({
  currentCompletion: "",
  currentSavedText: "",
  currentCompletionId: "",
  overlayVisible: false,
  suppressUntilKeydown: false,
  requestGeneration: 0,
  status: "idle",
  error: null,
}));

let debounceTimer: ReturnType<typeof setTimeout> | null = null;

export function clearDebounce(): void {
  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
}

function resetOverlayState(): void {
  extensionStore.setState({ caretCoordinates: null });
  autocompleteStore.setState({
    overlayVisible: false,
    currentCompletion: "",
    currentCompletionId: "",
  });
}

extensionStore.subscribe((state, prev) => {
  if (state.overlayResetVersion !== prev.overlayResetVersion) {
    if (!state.currentEditor) clearDebounce();
    if (!autocompleteStore.getState().overlayVisible) {
      extensionStore.setState({ caretCoordinates: null });
    }
  }
});

function requestCompletionInternal(editor: HTMLElement, isResponse: boolean): void {
  const extState = extensionStore.getState();
  if (extState.disabled) return;
  if (!isExtensionContextValid()) return;
  const strategy = getActiveStrategy();
  if (!strategy || !extState.config) return;

  const state = autocompleteStore.getState();
  if (!isResponse && state.suppressUntilKeydown) return;

  const text = strategy.getCurrentText(editor);
  if (!isResponse && text.length < extState.config.behavior.minTextLength) return;

  const context = strategy.getConversationContext(editor);
  const url = window.location.href;
  const newGen = state.requestGeneration + 1;

  autocompleteStore.setState({ requestGeneration: newGen, status: "loading" });
  const toastId = emitLoadingToastr("GENERATING_SUGGESTION", { id: "autocomplete-loading" });

  chrome.runtime.sendMessage(
    {
      action: "autocomplete_request",
      text,
      url,
      messages: context.map((m) => ({ role: m.role, text: m.text })),
    },
    (response) => {
      toast.dismiss(toastId);
      if (chrome.runtime.lastError) return;
      const current = autocompleteStore.getState();
      if (current.requestGeneration !== newGen) return;
      if (current.suppressUntilKeydown) return;
      if (!response?.success || !response.completion) {
        if (response?.reason === "api_error") {
          emitErrorToastr(null, { id: "autocomplete-api-error" });
        }
        autocompleteStore.setState({ status: "idle" });
        return;
      }
      if (!isResponse) {
        const currentText = getActiveStrategy()!.getCurrentText(editor);
        if (currentText !== text) return;
      }

      const caret = getActiveStrategy()!.getCaretCoordinates(editor);
      if (!caret) {
        autocompleteStore.setState({ status: "idle" });
        return;
      }

      extensionStore.setState({ caretCoordinates: caret });
      autocompleteStore.setState({
        currentCompletion: response.completion,
        currentSavedText: text,
        currentCompletionId: response.toolUsageId ?? "",
        overlayVisible: true,
        status: "success",
      });

      emitNeutralToastr("SUGGESTION_READY", { id: "autocomplete-ready" });
    },
  );
}

export function scheduleCompletion(): void {
  const extState = extensionStore.getState();
  const state = autocompleteStore.getState();
  if (extState.disabled || state.suppressUntilKeydown) return;

  extensionStore.setState({ caretCoordinates: null });
  autocompleteStore.setState({
    overlayVisible: false,
    currentCompletion: "",
    currentCompletionId: "",
  });
  clearDebounce();

  const editor = extState.currentEditor as HTMLElement | null;
  if (!editor || !extState.config) return;

  debounceTimer = setTimeout(() => requestCompletionInternal(editor, false), extState.config.behavior.debounceMs);
}

export function requestResponseNow(): void {
  const extState = extensionStore.getState();
  if (extState.disabled) return;
  const editor = extState.currentEditor as HTMLElement | null;
  if (!editor || !isExtensionContextValid()) return;
  autocompleteStore.setState({ suppressUntilKeydown: false });
  requestCompletionInternal(editor, true);
}

export function acceptCompletion(): void {
  const state = autocompleteStore.getState();
  const extState = extensionStore.getState();
  if (!extState.currentEditor || !state.currentCompletion) return;

  const editor = extState.currentEditor as HTMLElement;
  const completion = state.currentCompletion;
  const completionId = state.currentCompletionId;

  extensionStore.setState({ caretCoordinates: null });
  autocompleteStore.setState({
    suppressUntilKeydown: true,
    requestGeneration: state.requestGeneration + 1,
    overlayVisible: false,
    currentCompletion: "",
    currentCompletionId: "",
  });

  getActiveStrategy()?.pasteText(editor, completion, "insert");

  emitNeutralToastr("SUGGESTION_APPLIED");

  if (completionId && isExtensionContextValid()) {
    chrome.runtime.sendMessage({
      action: "autocomplete_accept",
      toolUsageId: completionId,
    });
  }
}

export function dismissCompletion(): void {
  extensionStore.setState({ caretCoordinates: null });
  autocompleteStore.setState({
    overlayVisible: false,
    currentCompletion: "",
    currentCompletionId: "",
  });
}

export function clearSuppress(): void {
  autocompleteStore.setState({ suppressUntilKeydown: false });
}

export function setSiteEnabled(enabled: boolean): void {
  if (!enabled) {
    clearDebounce();
    extensionStore.setState({ disabled: true, caretCoordinates: null, sessionAutocompleteEnabled: false });
    autocompleteStore.setState((state) => ({
      overlayVisible: false,
      currentCompletion: "",
      currentCompletionId: "",
      requestGeneration: state.requestGeneration + 1,
    }));
  } else {
    extensionStore.setState({ disabled: false, sessionAutocompleteEnabled: true });
  }
}

export function toggleAutocomplete(): void {
  const { disabled } = extensionStore.getState();
  const newEnabled = disabled;
  setSiteEnabled(newEnabled);
  emitNeutralToastr(newEnabled ? "AUTOCOMPLETE_ENABLED" : "AUTOCOMPLETE_DISABLED");
}
