import { createStore } from "zustand/vanilla";
import { emitErrorToastr } from "@/libs/toast";
import type { ChatCreateResponse, ChatSendResponse } from "@/types";
import { isExtensionContextValid } from "@/utils/extension-context";
import { onLoginRequired } from "@/utils/login-required";
import { sendBackgroundRequest } from "@/utils/runtime-request";
import { handleToolError } from "@/utils/tool-error";

export interface ChatMessage {
  id: string;
  role: "user" | "bot";
  text: string;
}

interface ChatState {
  chatId: string | null;
  messages: ChatMessage[];
  status: "idle" | "loading" | "error";
  errorCode: string | null;
  pageScreenshot: string | null;
  pageContent: string | null;
  pageMetadata: string | null;
  pageForms: string | null;
  pageURL: string | null;
}

export const chatStore = createStore<ChatState>()(() => ({
  chatId: null,
  messages: [],
  status: "idle",
  errorCode: null,
  pageScreenshot: null,
  pageContent: null,
  pageMetadata: null,
  pageForms: null,
  pageURL: null,
}));

export function setPageScreenshot(screenshot: string | null): void {
  chatStore.setState({ pageScreenshot: screenshot });
}

export function setPageContext(
  pageContent: string | null,
  pageMetadata: string | null,
  pageForms: string | null,
  url: string | null,
): void {
  chatStore.setState({ pageContent, pageMetadata, pageForms, pageURL: url });
}

let nextId = 0;

export function sendChatMessage(text: string): void {
  if (!isExtensionContextValid()) return;
  const trimmed = text.trim();
  if (!trimmed) return;
  const { status, messages, chatId } = chatStore.getState();
  if (status === "loading") return;

  const userMessage: ChatMessage = {
    id: String(++nextId),
    role: "user",
    text: trimmed,
  };
  chatStore.setState((s) => ({
    messages: [...s.messages, userMessage],
    status: "loading",
    errorCode: null,
  }));

  const isFirstMessage = messages.length === 0;
  const proceed = () => {
    if (!chatId) {
      createAndSend(trimmed);
    } else {
      doSend(chatId, trimmed);
    }
  };

  if (isFirstMessage) {
    chrome.runtime.sendMessage(
      { action: "capture_page" },
      (res: {
        success: boolean;
        data?: {
          pageScreenshot?: string;
          pageContent?: string;
          pageMetadata?: string;
          pageForms?: string;
        };
      }) => {
        if (chrome.runtime.lastError || !res?.success) {
          handleToolError();
          chatStore.setState((s) => ({
            messages: s.messages.filter((m) => m.id !== userMessage.id),
            status: "idle",
          }));
          return;
        }
        setPageContext(
          res.data?.pageContent ?? "",
          res.data?.pageMetadata ?? "",
          res.data?.pageForms ?? "",
          window.location.href,
        );
        if (res.data?.pageScreenshot)
          setPageScreenshot(res.data.pageScreenshot);
        proceed();
      },
    );
  } else {
    proceed();
  }
}

function createAndSend(trimmed: string): void {
  sendBackgroundRequest<ChatCreateResponse>(
    { action: "chat_create" },
    (createRes) => {
      if (chrome.runtime.lastError || !createRes?.success) {
        const code = createRes?.errorCode;
        if (code) {
          emitErrorToastr(code);
          chatStore.setState({ status: "error", errorCode: code });
          return;
        }
        handleToolError();
        return;
      }
      const newChatId = createRes.chatId!;
      chatStore.setState({ chatId: newChatId });
      doSend(newChatId, trimmed);
    },
  );
}

function doSend(chatId: string, message: string): void {
  const { pageScreenshot, pageContent, pageMetadata, pageForms, pageURL } =
    chatStore.getState();
  setPageScreenshot(null);
  setPageContext(null, null, null, null);
  sendBackgroundRequest<ChatSendResponse>(
    {
      action: "chat_send",
      chatId,
      message,
      pageScreenshot: pageScreenshot ?? undefined,
      pageContent: pageContent ?? undefined,
      pageMetadata: pageMetadata ?? undefined,
      pageForms: pageForms ?? undefined,
      pageURL: pageURL ?? undefined,
    },
    (sendRes) => {
      if (chrome.runtime.lastError || !sendRes?.success) {
        const code = sendRes?.errorCode;
        if (code) {
          emitErrorToastr(code);
          chatStore.setState({ status: "error", errorCode: code });
          return;
        }
        handleToolError();
        return;
      }
      const botMessage: ChatMessage = {
        id: String(++nextId),
        role: "bot",
        text: sendRes.response ?? "",
      };
      chatStore.setState((s) => ({
        messages: [...s.messages, botMessage],
        status: "idle",
      }));
    },
  );
}

export function resetChat(): void {
  chatStore.setState({
    chatId: null,
    messages: [],
    status: "idle",
    errorCode: null,
    pageScreenshot: null,
    pageContent: null,
    pageMetadata: null,
    pageForms: null,
    pageURL: null,
  });
}

onLoginRequired(resetChat);
