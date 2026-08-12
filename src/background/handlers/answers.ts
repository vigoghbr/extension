import { ensureFreshContext } from "@/background/handlers/context-guard";
import type { BackgroundMessageHandler } from "@/background/handlers/types";
import api, {
  extractApiErrorCode,
  isUnauthorizedError,
} from "@/libs/api-dispatch";
import { getEndpoint } from "@/libs/endpoints";
import { getPageId } from "@/libs/page-id";
import type { ToolResponse } from "@/types";

async function handleAnswersRequest(
  pageId: string,
  tab: chrome.tabs.Tab | undefined,
  apiPath: string,
  text: string | undefined,
): Promise<ToolResponse> {
  try {
    await ensureFreshContext(pageId, tab);
    const { data } = await api.post(apiPath, { pageId, text });
    return {
      success: true,
      suggestions: data.data?.suggestions ?? [],
      toolUsageId: data.data?.toolUsageId,
    };
  } catch (error) {
    if (isUnauthorizedError(error)) {
      return { success: false, noToken: true };
    }
    const code = extractApiErrorCode(error);
    if (code) {
      return { success: false, errorCode: code };
    }
    return { success: false, error: "API error" };
  }
}

export const handleMessages: BackgroundMessageHandler = (
  message,
  sender,
  sendResponse,
) => {
  if (message.action === "answers_request") {
    const apiPath = message.apiPath ?? getEndpoint("answers");
    const pageId = getPageId(sender.tab);
    handleAnswersRequest(pageId, sender.tab, apiPath, message.text)
      .then(sendResponse)
      .catch(() => sendResponse({ success: false }));
    return true;
  }
  return null;
};
