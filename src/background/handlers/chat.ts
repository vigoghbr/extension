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
  chatId: string,
  message: string,
  pageScreenshot?: string,
  pageContent?: string,
  pageMetadata?: string,
  pageForms?: string,
  pageURL?: string,
): Promise<ChatSendResponse> {
  try {
    const body: Record<string, unknown> = { pageId, message };
    if (pageScreenshot) body.pageScreenshot = pageScreenshot;
    if (pageContent) body.pageContent = pageContent;
    if (pageMetadata) body.pageMetadata = pageMetadata;
    if (pageForms) body.pageForms = pageForms;
    if (pageURL) body.pageURL = pageURL;
    const { data } = await api.post(
      getEndpoint("chatMessages", { chatId }),
      body,
    );
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
    handleChatSend(
      pageId,
      message.chatId,
      message.message,
      message.pageScreenshot,
      message.pageContent,
      message.pageMetadata,
      message.pageForms,
      message.pageURL,
    )
      .then(sendResponse)
      .catch(() => sendResponse({ success: false }));
    return true;
  }
  return null;
};
