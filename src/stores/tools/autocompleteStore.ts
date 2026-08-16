import { createStore } from "zustand/vanilla";
import {
  type IdentifyFieldHandle,
  identifyField,
} from "@/libs/field-identifier";
import { requireSession } from "@/libs/sidepanel";
import { toastr } from "@/libs/toastr";
import {
  extensionStore,
  resolveInitialTargetField,
  resolveStrategyForElement,
} from "@/stores/extensionStore";
import { prepareToolContext } from "@/stores/tools/contextStore";
import { isExtensionContextValid } from "@/utils/extension-context";
import { requestLogin } from "@/utils/login-required";

type AsyncStatus = "idle" | "loading" | "success" | "error";

interface AutocompleteState {
  autocompleteEditor: HTMLElement | null;
  suggestions: string[];
  currentIndex: number;
  currentSavedText: string;
  currentCompletionId: string;
  overlayVisible: boolean;
  suppressUntilKeydown: boolean;
  requestGeneration: number;
  status: AsyncStatus;
  error: string | null;
}

export const autocompleteStore = createStore<AutocompleteState>()(() => ({
  autocompleteEditor: null,
  suggestions: [],
  currentIndex: 0,
  currentSavedText: "",
  currentCompletionId: "",
  overlayVisible: false,
  suppressUntilKeydown: false,
  requestGeneration: 0,
  status: "idle",
  error: null,
}));

let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let pendingIdentify: IdentifyFieldHandle | null = null;
let fieldWatchdog: MutationObserver | null = null;

export function clearDebounce(): void {
  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
}

function requestCompletionInternal(
  editor: HTMLElement,
  isResponse: boolean,
): void {
  const extState = extensionStore.getState();
  if (extState.disabled) return;
  if (!isExtensionContextValid()) return;
  const strategy = resolveStrategyForElement(editor);
  if (!strategy || !extState.config) return;

  const state = autocompleteStore.getState();
  if (!isResponse && state.suppressUntilKeydown) return;

  const text = strategy.getCurrentText(editor);
  if (!isResponse && text.length < extState.config.behavior.minTextLength)
    return;

  const newGen = state.requestGeneration + 1;

  autocompleteStore.setState({ requestGeneration: newGen, status: "loading" });
  const toastId = toastr.loading("GENERATING_SUGGESTION", {
    id: "autocomplete-loading",
  });

  chrome.runtime.sendMessage(
    { action: "autocomplete_request", text },
    (response) => {
      toastr.dismiss(toastId);
      if (chrome.runtime.lastError) return;
      const current = autocompleteStore.getState();
      if (current.requestGeneration !== newGen) return;
      if (current.suppressUntilKeydown) return;
      if (!response?.success || !response.completions?.length) {
        if (response?.reason === "unauthenticated") {
          disarmAutocomplete();
          requestLogin();
          return;
        }
        if (response?.errorCode) {
          toastr.error(response.errorCode);
        } else if (response?.reason === "api_error") {
          toastr.error(null, { id: "autocomplete-api-error" });
        }
        autocompleteStore.setState({ status: "idle" });
        return;
      }
      if (!isResponse) {
        const currentText = strategy.getCurrentText(editor);
        if (currentText !== text) {
          autocompleteStore.setState({ status: "idle" });
          return;
        }
      }

      const caret = strategy.getCaretCoordinates(editor);
      if (!caret) {
        autocompleteStore.setState({ status: "idle" });
        return;
      }

      extensionStore.setState({ caretCoordinates: caret });
      autocompleteStore.setState({
        suggestions: response.completions,
        currentIndex: 0,
        currentSavedText: text,
        currentCompletionId: response.toolUsageId ?? "",
        overlayVisible: true,
        status: "success",
      });

      toastr.neutral("SUGGESTION_READY", { id: "autocomplete-ready" });
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
    suggestions: [],
    currentIndex: 0,
    currentCompletionId: "",
  });
  clearDebounce();

  const editor = state.autocompleteEditor;
  if (!editor || !extState.config) return;

  debounceTimer = setTimeout(
    () => requestCompletionInternal(editor, false),
    extState.config.behavior.debounceMs,
  );
}

export function requestResponseNow(): void {
  const extState = extensionStore.getState();
  if (extState.disabled) return;
  const editor = autocompleteStore.getState().autocompleteEditor;
  if (!editor || !isExtensionContextValid()) return;
  autocompleteStore.setState({ suppressUntilKeydown: false });
  requestCompletionInternal(editor, true);
}

export function acceptCompletion(): void {
  const state = autocompleteStore.getState();
  const editor = state.autocompleteEditor;
  const completion = state.suggestions[state.currentIndex];
  if (!editor || !completion) return;

  const completionId = state.currentCompletionId;
  const suggestionIndex = state.currentIndex + 1;
  const strategy = resolveStrategyForElement(editor);

  extensionStore.setState({ caretCoordinates: null });
  autocompleteStore.setState({
    suppressUntilKeydown: true,
    requestGeneration: state.requestGeneration + 1,
    overlayVisible: false,
    suggestions: [],
    currentIndex: 0,
    currentCompletionId: "",
  });

  strategy?.pasteText(editor, completion, "insert");

  toastr.neutral("SUGGESTION_APPLIED");

  if (completionId && isExtensionContextValid()) {
    chrome.runtime.sendMessage({
      action: "autocomplete_accept",
      toolUsageId: completionId,
      suggestionIndex,
    });
  }
}

export function dismissCompletion(): void {
  extensionStore.setState({ caretCoordinates: null });
  autocompleteStore.setState({
    overlayVisible: false,
    suggestions: [],
    currentIndex: 0,
    currentCompletionId: "",
  });
}

export function cycleCompletion(direction: "prev" | "next"): void {
  const state = autocompleteStore.getState();
  if (!state.overlayVisible || state.suggestions.length < 2) return;

  const delta = direction === "next" ? 1 : -1;
  const length = state.suggestions.length;
  const currentIndex = (state.currentIndex + delta + length) % length;

  autocompleteStore.setState({ currentIndex });
}

export function clearSuppress(): void {
  autocompleteStore.setState({ suppressUntilKeydown: false });
}

function cancelPendingIdentify(): void {
  if (pendingIdentify) {
    pendingIdentify.cancel();
    pendingIdentify = null;
  }
}

function startFieldWatchdog(): void {
  if (fieldWatchdog) return;
  fieldWatchdog = new MutationObserver(() => {
    const { autocompleteEditor } = autocompleteStore.getState();
    if (autocompleteEditor && !autocompleteEditor.isConnected) {
      reactivateAutocompleteField();
    }
  });
  fieldWatchdog.observe(document.body, { childList: true, subtree: true });
}

function stopFieldWatchdog(): void {
  fieldWatchdog?.disconnect();
  fieldWatchdog = null;
}

export function reactivateAutocompleteField(): void {
  if (extensionStore.getState().disabled) return;
  if (pendingIdentify) return;

  clearDebounce();
  extensionStore.setState({ caretCoordinates: null });
  autocompleteStore.setState({
    autocompleteEditor: null,
    overlayVisible: false,
    suggestions: [],
    currentIndex: 0,
    currentCompletionId: "",
  });

  const handle = identifyField("IDENTIFY_AUTOCOMPLETE_FIELD");
  pendingIdentify = handle;
  handle.promise.then((editor) => {
    if (pendingIdentify !== handle) return;
    pendingIdentify = null;
    autocompleteStore.setState({ autocompleteEditor: editor });
    toastr.neutral("AUTOCOMPLETE_ENABLED");
    prepareToolContext();
  });
}

export function armAutocomplete(): void {
  cancelPendingIdentify();
  const handle = resolveInitialTargetField("IDENTIFY_AUTOCOMPLETE_FIELD");
  pendingIdentify = handle;
  handle.promise.then((editor) => {
    if (pendingIdentify !== handle) return;
    pendingIdentify = null;
    autocompleteStore.setState({ autocompleteEditor: editor });
    extensionStore.setState({
      disabled: false,
      sessionAutocompleteEnabled: true,
    });
    toastr.neutral("AUTOCOMPLETE_ENABLED");
    prepareToolContext();
    startFieldWatchdog();
  });
}

export function disarmAutocomplete(): void {
  cancelPendingIdentify();
  clearDebounce();
  stopFieldWatchdog();
  extensionStore.setState({
    disabled: true,
    caretCoordinates: null,
    sessionAutocompleteEnabled: false,
  });
  autocompleteStore.setState((state) => ({
    autocompleteEditor: null,
    overlayVisible: false,
    suggestions: [],
    currentIndex: 0,
    currentCompletionId: "",
    requestGeneration: state.requestGeneration + 1,
  }));
}

export function toggleAutocomplete(): void {
  const { disabled } = extensionStore.getState();
  if (disabled) {
    requireSession(() => armAutocomplete());
  } else {
    disarmAutocomplete();
    toastr.neutral("AUTOCOMPLETE_DISABLED");
  }
}
