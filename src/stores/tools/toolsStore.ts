import { createStore } from "zustand/vanilla";
import { logger } from "@/libs/logger";
import {
  emitErrorToastr,
  emitInfoToastr,
  emitLoadingToastr,
  emitSuccessToastr,
  toast,
} from "@/libs/toast";
import type { ResolvedAnswerToolConfig, ToolResponse } from "@/types";
import { extensionStore, getActiveStrategy, onEditorChange, resolveEditorWithStrategy } from "@/stores/extensionStore";
import { autocompleteStore } from "@/stores/tools/autocompleteStore";
import { applyTextToEditor } from "@/utils/apply-text";
import { blobUrlToBase64 } from "@/utils/blob-to-base64";
import { isExtensionContextValid } from "@/utils/extension-context";
import { onLoginRequired, requestLogin } from "@/utils/login-required";
import { showPageIndicator } from "@/stores/indicatorsStore";
import { openPlansScreen } from "@/libs/sidepanel";
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

let selectedRange: Range | null = null;
let pendingEditor: HTMLElement | null = null;
let pendingApplyText: string | null = null;

export function requestAnswers(itemId: string, directionOverride?: string): void {
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

  const toolConfig = config.aiMenu.tools.find((t) => t.id === itemId) as ResolvedAnswerToolConfig | undefined;
  const apiPath = toolConfig?.apiPath ?? "/v1/tools/answers";

  const text = editor && strategy ? strategy.getCurrentText(editor) : "";
  const direction = directionOverride !== undefined
    ? (directionOverride.trim() || undefined)
    : (text.trim() || undefined);
  const url = window.location.href;

  const messages = editor && strategy
    ? strategy.getConversationContext(editor).map((m) => ({ ...m }))
    : [];

  const mediaFields = ["image", "audio", "video", "file"] as const;
  const resolvedMessagesPromise = Promise.all(
    messages.map(async (m) => {
      const result = { ...m } as Record<string, unknown>;
      for (const field of mediaFields) {
        const value = result[field];
        if (typeof value === "string" && value.startsWith("blob:")) {
          try {
            result[field] = await blobUrlToBase64(value);
          } catch (error) {
            logger.log("answers:blob-fetch-failed", { field, url: value, error: String(error) });
          }
        }
      }
      if (typeof result.text !== "string") result.text = "";
      return result;
    }),
  );
  const toastId = emitLoadingToastr("GENERATING_SUGGESTIONS");
  const dispatchAnswers = (
    messages: unknown[],
    pageScreenshot?: string,
    pageContent = "",
    pageMetadata = "",
    pageForms = "",
  ): void => {
    sendBackgroundRequest<ToolResponse>(
      {
        action: "answers_request",
        url,
        messages,
        pageContent,
        pageMetadata,
        pageForms,
        pageScreenshot,
        direction,
        apiPath,
      },
      (response) => {
        toast.dismiss(toastId);
        if (chrome.runtime.lastError) {
          handleToolError();
          return;
        }
        if (!response?.success || !response.suggestions?.length) {
          const code = response?.errorCode;
          if (code) {
            emitErrorToastr(code);
            toolsStore.setState({ status: "error", activeItemId: null, errorCode: code });
            if (code === "SUBSCRIPTION_REQUIRED") void openPlansScreen();
            return;
          }
          handleToolError();
          return;
        }
        toolsStore.setState({ status: "success", suggestions: response.suggestions, toolUsageId: response.toolUsageId ?? null });
      },
      { onNoToken: () => toast.dismiss(toastId) },
    );
  };

  showPageIndicator();
  toolsStore.setState({ status: "loading", activeItemId: itemId });

  resolvedMessagesPromise
    .then((messages) => {
      chrome.runtime.sendMessage(
        { action: "capture_page" },
        (
          res:
            | {
                success?: boolean;
                data?: {
                  pageScreenshot?: string;
                  pageContent?: string;
                  pageMetadata?: string;
                  pageForms?: string;
                };
              }
            | undefined,
        ) => {
          if (chrome.runtime.lastError || !res?.success) {
            toast.dismiss(toastId);
            handleToolError();
            return;
          }
          dispatchAnswers(
            messages,
            res.data?.pageScreenshot,
            res.data?.pageContent ?? "",
            res.data?.pageMetadata ?? "",
            res.data?.pageForms ?? "",
          );
        },
      );
    })
    .catch((error) => {
      toast.dismiss(toastId);
      logger.log("answers:extract-failed", { error: String(error) });
      handleToolError();
    });
}

export function acceptAnswer(text: string): void {
  navigator.clipboard.writeText(text);
  autocompleteStore.setState({ suppressUntilKeydown: true });

  const applied = applyTextToEditor(text);
  if (applied) {
    emitSuccessToastr("CHAT_COPIED");
    pendingApplyText = null;
    return;
  }

  pendingApplyText = text;
  emitInfoToastr("APPLY_TARGET_MISSING");
}

export function flushPendingAnswerApply(): void {
  if (!pendingApplyText) return;
  const text = pendingApplyText;
  if (!applyTextToEditor(text)) return;
  pendingApplyText = null;
}

onEditorChange(flushPendingAnswerApply);

export function setSelectedRange(range: Range | null): void {
  selectedRange = range;
  toolsStore.setState({ hasSelectedText: range !== null && range.toString().trim().length > 0 });
}

export function setHasEditorText(hasText: boolean): void {
  toolsStore.setState({ hasEditorText: hasText });
}

export function applyTransform(itemId: string, transformAction: string, autoApply?: boolean): void {
  const { currentEditor, config } = extensionStore.getState();
  const editor = currentEditor as HTMLElement | null;
  if (!editor || !config || !isExtensionContextValid()) return;

  const strategy = getActiveStrategy();
  const savedText = strategy?.getCurrentText(editor) ?? "";
  if (!savedText) return;

  if (!autoApply) {
    pendingEditor = editor;
  }

  toolsStore.setState({ status: "loading", activeItemId: itemId });

  sendBackgroundRequest<ToolResponse>(
    { action: "transforms_request", text: savedText, transformAction },
    (response) => {
      if (chrome.runtime.lastError || !response?.success || !response.suggestions?.length) {
        handleToolError();
        return;
      }
      if (autoApply) {
        const result = response.suggestions[0] ?? "";
        toolsStore.setState({ status: "idle", activeItemId: null });
        if (!result) return;
        strategy?.replaceAllText(editor, result);
      } else {
        toolsStore.setState({ status: "success", suggestions: response.suggestions });
      }
    },
  );
}

export function acceptTransform(suggestion: string): void {
  const editor = pendingEditor;
  const strategy = getActiveStrategy();
  if (!editor || !strategy) return;
  strategy.replaceAllText(editor, suggestion);
  navigator.clipboard.writeText(suggestion);
  emitSuccessToastr("CHAT_COPIED");
  autocompleteStore.setState({ suppressUntilKeydown: true });
}

export function clearAnswers(): void {
  pendingEditor = null;
  toolsStore.setState({ status: "idle", suggestions: [], activeItemId: null, errorCode: null, toolUsageId: null });
}

onLoginRequired(clearAnswers);

export function clearToolResults(): void {
  clearAnswers();
}
