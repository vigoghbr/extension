import { createStore } from "zustand/vanilla";
import type { IdentifyFieldHandle } from "@/libs/field-identifier";
import { requireSession } from "@/libs/sidepanel";
import { toastr } from "@/libs/toastr";
import {
  extensionStore,
  resolveStrategyForElement,
  resolveTargetField,
} from "@/stores/extensionStore";
import { prepareToolContext } from "@/stores/tools/contextStore";
import { isExtensionContextValid } from "@/utils/extension-context";
import { requestLogin } from "@/utils/login-required";

type AsyncStatus = "idle" | "loading" | "success" | "error";

interface AutocompleteState {
  autocompleteEditor: HTMLElement | null;
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
  autocompleteEditor: null,
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
let pendingIdentify: IdentifyFieldHandle | null = null;

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
      if (!response?.success || !response.completion) {
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
        currentCompletion: response.completion,
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
    currentCompletion: "",
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
  if (!editor || !state.currentCompletion) return;

  const completion = state.currentCompletion;
  const completionId = state.currentCompletionId;
  const strategy = resolveStrategyForElement(editor);

  extensionStore.setState({ caretCoordinates: null });
  autocompleteStore.setState({
    suppressUntilKeydown: true,
    requestGeneration: state.requestGeneration + 1,
    overlayVisible: false,
    currentCompletion: "",
    currentCompletionId: "",
  });

  strategy?.pasteText(editor, completion, "insert");

  toastr.neutral("SUGGESTION_APPLIED");

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

function cancelPendingIdentify(): void {
  if (pendingIdentify) {
    pendingIdentify.cancel();
    pendingIdentify = null;
  }
}

export function armAutocomplete(): void {
  cancelPendingIdentify();
  const handle = resolveTargetField("IDENTIFY_AUTOCOMPLETE_FIELD");
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
  });
}

export function disarmAutocomplete(): void {
  cancelPendingIdentify();
  clearDebounce();
  extensionStore.setState({
    disabled: true,
    caretCoordinates: null,
    sessionAutocompleteEnabled: false,
  });
  autocompleteStore.setState((state) => ({
    autocompleteEditor: null,
    overlayVisible: false,
    currentCompletion: "",
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
