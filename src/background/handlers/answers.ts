import type { BackgroundMessageHandler } from "@/background/handlers/types";
import api, {
  extractApiErrorCode,
  isUnauthorizedError,
} from "@/libs/api-dispatch";
import { getEndpoint } from "@/libs/endpoints";
import { getPageId } from "@/libs/page-id";

export const handleMessages: BackgroundMessageHandler = (
  message,
  sender,
  sendResponse,
) => {
  if (message.action === "answers_request") {
    const apiPath = message.apiPath ?? getEndpoint("answers");
    const pageId = getPageId(sender.tab);
    api
      .post(apiPath, {
        pageId,
        pageURL: message.pageURL,
        pageScreenshot: message.pageScreenshot ?? "",
        pageContent: message.pageContent ?? "",
        pageMetadata: message.pageMetadata ?? "",
        pageForms: message.pageForms ?? "",
        text: message.text,
      })
      .then(({ data }) =>
        sendResponse({
          success: true,
          suggestions: data.data?.suggestions ?? [],
          toolUsageId: data.data?.toolUsageId,
        }),
      )
      .catch((error) => {
        if (isUnauthorizedError(error)) {
          sendResponse({ success: false, noToken: true });
          return;
        }
        const code = extractApiErrorCode(error);
        if (code) {
          sendResponse({ success: false, errorCode: code });
          return;
        }
        sendResponse({ success: false, error: "API error" });
      });
    return true;
  }
  return null;
};
