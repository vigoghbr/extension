import { createStore } from "zustand/vanilla";
import { toastr } from "@/libs/toastr";
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
}

export const chatStore = createStore<ChatState>()(() => ({
  chatId: null,
  messages: [],
  status: "idle",
  errorCode: null,
}));

let nextId = 0;

export function sendChatMessage(text: string): void {
  if (!isExtensionContextValid()) return;
  const trimmed = text.trim();
  if (!trimmed) return;
  const { status, chatId } = chatStore.getState();
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

  if (!chatId) {
    createAndSend(trimmed);
  } else {
    doSend(chatId, trimmed);
  }
}

function createAndSend(trimmed: string): void {
  sendBackgroundRequest<ChatCreateResponse>(
    { action: "chat_create" },
    (createRes) => {
      if (chrome.runtime.lastError || !createRes?.success) {
        const code = createRes?.errorCode;
        if (code) {
          toastr.error(code);
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
  sendBackgroundRequest<ChatSendResponse>(
    { action: "chat_send", chatId, message },
    (sendRes) => {
      if (chrome.runtime.lastError || !sendRes?.success) {
        const code = sendRes?.errorCode;
        if (code) {
          toastr.error(code);
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
  });
}

onLoginRequired(resetChat);
