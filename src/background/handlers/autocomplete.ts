import type { BackgroundMessageHandler } from "@/background/handlers/types";
import api from "@/libs/api-dispatch";
import { getEndpoint } from "@/libs/endpoints";
import { getPageId } from "@/libs/page-id";
import type { AutocompleteResponse } from "@/types";

async function handleAutocompleteRequest(
  pageId: string,
  text: string,
  pageURL?: string,
  pageScreenshot?: string,
  pageContent?: string,
  pageMetadata?: string,
  pageForms?: string,
): Promise<AutocompleteResponse> {
  const stored = await chrome.storage.local.get("vigogh-auth-token");
  if (!stored["vigogh-auth-token"]) {
    return {
      success: false,
      error: "No auth token",
      reason: "unauthenticated",
    };
  }

  try {
    const { data } = await api.post(getEndpoint("autocomplete"), {
      pageId,
      text,
      pageURL,
      pageScreenshot,
      pageContent,
      pageMetadata,
      pageForms,
    });
    return {
      success: true,
      completion: data.data?.completion || "",
      toolUsageId: data.data?.toolUsageId,
    };
  } catch {
    return { success: false, error: "API error", reason: "api_error" };
  }
}

async function handleAutocompleteAccept(toolUsageId: string): Promise<void> {
  const stored = await chrome.storage.local.get("vigogh-auth-token");
  if (!stored["vigogh-auth-token"]) return;
  api.post(getEndpoint("autocompleteAccept"), { toolUsageId }).catch(() => {});
}

export const handleMessages: BackgroundMessageHandler = (
  message,
  sender,
  sendResponse,
) => {
  if (message.action === "autocomplete_request") {
    const pageId = getPageId(sender.tab);
    handleAutocompleteRequest(
      pageId,
      message.text,
      message.pageURL,
      message.pageScreenshot,
      message.pageContent,
      message.pageMetadata,
      message.pageForms,
    )
      .then(sendResponse)
      .catch(() => sendResponse({ success: false }));
    return true;
  }
  if (message.action === "autocomplete_accept") {
    handleAutocompleteAccept(message.toolUsageId).catch(() => {});
    sendResponse({ success: true });
    return false;
  }
  return null;
};
