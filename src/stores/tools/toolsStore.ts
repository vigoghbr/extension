import { createStore } from "zustand/vanilla";
import { openPlansScreen } from "@/libs/sidepanel";
import { toastr } from "@/libs/toastr";
import { touchToolActivity } from "@/libs/tool-inactivity-timer";
import {
  extensionStore,
  getActiveStrategy,
  resolveEditorWithStrategy,
} from "@/stores/extensionStore";
import { autocompleteStore } from "@/stores/tools/autocompleteStore";
import type { ResolvedAnswerToolConfig, ToolResponse } from "@/types";
import { applyTextWithIdentify } from "@/utils/apply-text";
import { isExtensionContextValid } from "@/utils/extension-context";
import { onLoginRequired, requestLogin } from "@/utils/login-required";
import { hasAuthToken, sendBackgroundRequest } from "@/utils/runtime-request";
import { handleToolError } from "@/utils/tool-error";

type AsyncStatus = "idle" | "loading" | "success" | "error";

interface AnswersState {
  status: AsyncStatus;
  suggestions: string[];
  activeItemId: string | null;
  hasSelectedText: boolean;
  hasEditorText: boolean;
  errorCode: string | null;
  toolUsageId: string | null;
}

export const toolsStore = createStore<AnswersState>()(() => ({
  status: "idle",
  suggestions: [],
  activeItemId: null,
  hasSelectedText: false,
  hasEditorText: false,
  errorCode: null,
  toolUsageId: null,
}));

export function requestAnswers(
  itemId: string,
  directionOverride?: string,
): void {
  if (!isExtensionContextValid()) return;

  const { config } = extensionStore.getState();
  if (!config) return;

  hasAuthToken().then((authed) => {
    if (!authed) {
      requestLogin();
      return;
    }
    runRequestAnswers(itemId, directionOverride);
  });
}

function runRequestAnswers(itemId: string, directionOverride?: string): void {
  if (!isExtensionContextValid()) return;
  const { config } = extensionStore.getState();
  if (!config) return;
  const { editor, strategy } = resolveEditorWithStrategy();

  const toolConfig = config.widget.tools.find((t) => t.id === itemId) as
    | ResolvedAnswerToolConfig
    | undefined;
  const apiPath = toolConfig?.apiPath ?? "/v1/tools/answers";

  const editorText = editor && strategy ? strategy.getCurrentText(editor) : "";
  const text =
    directionOverride !== undefined
      ? directionOverride.trim() || undefined
      : editorText.trim() || undefined;

  const toastId = toastr.loading("GENERATING_SUGGESTIONS");

  toolsStore.setState({ status: "loading", activeItemId: itemId });
  touchToolActivity();

  sendBackgroundRequest<ToolResponse>(
    { action: "answers_request", text, apiPath },
    (response) => {
      toastr.dismiss(toastId);
      if (chrome.runtime.lastError) {
        handleToolError();
        return;
      }
      if (!response?.success || !response.suggestions?.length) {
        const code = response?.errorCode;
        if (code) {
          toastr.error(code);
          toolsStore.setState({
            status: "error",
            activeItemId: null,
            errorCode: code,
          });
          if (code === "SUBSCRIPTION_REQUIRED") void openPlansScreen();
          return;
        }
        handleToolError();
        return;
      }
      toolsStore.setState({
        status: "success",
        suggestions: response.suggestions,
        toolUsageId: response.toolUsageId ?? null,
      });
      touchToolActivity();
    },
    { onNoToken: () => toastr.dismiss(toastId) },
  );
}

export function acceptAnswer(text: string): void {
  navigator.clipboard.writeText(text);
  applyTextWithIdentify(text, "COPIED_CLICK_TO_PASTE");
  touchToolActivity();
}

export function setSelectedRange(range: Range | null): void {
  toolsStore.setState({
    hasSelectedText: range !== null && range.toString().trim().length > 0,
  });
}

export function setHasEditorText(hasText: boolean): void {
  toolsStore.setState({ hasEditorText: hasText });
}

export function applyTransform(
  itemId: string,
  transformAction: string,
  autoApply?: boolean,
): void {
  const { currentEditor, config } = extensionStore.getState();
  const editor = currentEditor as HTMLElement | null;
  if (!editor || !config || !isExtensionContextValid()) return;

  const strategy = getActiveStrategy();
  const savedText = strategy?.getCurrentText(editor) ?? "";
  if (!savedText) return;

  toolsStore.setState({ status: "loading", activeItemId: itemId });

  sendBackgroundRequest<ToolResponse>(
    { action: "transforms_request", text: savedText, transformAction },
    (response) => {
      if (
        chrome.runtime.lastError ||
        !response?.success ||
        !response.suggestions?.length
      ) {
        if (response?.errorCode) {
          toastr.error(response.errorCode);
          toolsStore.setState({ status: "idle", activeItemId: null });
          return;
        }
        handleToolError();
        return;
      }
      if (autoApply) {
        const result = response.suggestions[0] ?? "";
        toolsStore.setState({ status: "idle", activeItemId: null });
        if (!result) return;
        applyTextWithIdentify(result, "SELECT_APPLY_TARGET");
      } else {
        toolsStore.setState({
          status: "success",
          suggestions: response.suggestions,
        });
      }
    },
  );
}

export function acceptTransform(suggestion: string): void {
  navigator.clipboard.writeText(suggestion);
  autocompleteStore.setState({ suppressUntilKeydown: true });
  applyTextWithIdentify(suggestion, "SELECT_APPLY_TARGET").then(() => {
    toastr.success("TEXT_PASTED");
  });
}

export function clearAnswers(): void {
  toolsStore.setState({
    status: "idle",
    suggestions: [],
    activeItemId: null,
    errorCode: null,
    toolUsageId: null,
  });
}

onLoginRequired(clearAnswers);

export function clearToolResults(): void {
  clearAnswers();
}
