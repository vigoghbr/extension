import { ensureFreshContext } from "@/background/handlers/context-guard";
import type { BackgroundMessageHandler } from "@/background/handlers/types";
import api, {
  extractApiErrorCode,
  isUnauthorizedError,
} from "@/libs/api-dispatch";
import { getEndpoint } from "@/libs/endpoints";
import { getPageId } from "@/libs/page-id";
import type { ChatCreateResponse, ChatSendResponse } from "@/types";

async function handleChatCreate(): Promise<ChatCreateResponse> {
  try {
    const { data } = await api.post(getEndpoint("chats"), {});
    return { success: true, chatId: data.data.id };
  } catch (error) {
    if (isUnauthorizedError(error)) return { success: false, noToken: true };
    const code = extractApiErrorCode(error);
    if (code) return { success: false, errorCode: code };
    return { success: false, error: "API error" };
  }
}

async function handleChatSend(
  pageId: string,
  tab: chrome.tabs.Tab | undefined,
  chatId: string,
  message: string,
): Promise<ChatSendResponse> {
  try {
    await ensureFreshContext(pageId, tab);
    const { data } = await api.post(getEndpoint("chatMessages", { chatId }), {
      pageId,
      message,
    });
    return {
      success: true,
      response: data.data.response,
      toolUsageId: data.data.toolUsageId,
    };
  } catch (error) {
    if (isUnauthorizedError(error)) return { success: false, noToken: true };
    const code = extractApiErrorCode(error);
    if (code) return { success: false, errorCode: code };
    return { success: false, error: "API error" };
  }
}

export const handleMessages: BackgroundMessageHandler = (
  message,
  sender,
  sendResponse,
) => {
  if (message.action === "chat_create") {
    handleChatCreate()
      .then(sendResponse)
      .catch(() => sendResponse({ success: false }));
    return true;
  }
  if (message.action === "chat_send") {
    const pageId = getPageId(sender.tab);
    handleChatSend(pageId, sender.tab, message.chatId, message.message)
      .then(sendResponse)
      .catch(() => sendResponse({ success: false }));
    return true;
  }
  return null;
};
