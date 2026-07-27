import api, { extractApiErrorCode, isUnauthorizedError } from "@/libs/api-dispatch";
import { getEndpoint } from "@/libs/endpoints";
import type { BackgroundMessageHandler } from "@/background/handlers/types";

export const handleMessages: BackgroundMessageHandler = (message, _sender, sendResponse) => {
  if (message.action === "answers_request") {
    const apiPath = message.apiPath ?? getEndpoint("answers");
    api.post(apiPath, {
      pageURL: message.url,
      pageScreenshot: message.pageScreenshot ?? "",
      pageContent: message.pageContent ?? "",
      pageMetadata: message.pageMetadata ?? "",
      pageForms: message.pageForms ?? "",
      messages: message.messages ?? [],
      direction: message.direction,
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
