import { ensureFreshContext } from "@/background/handlers/context-guard";
import type { BackgroundMessageHandler } from "@/background/handlers/types";
import api from "@/libs/api-dispatch";
import { getEndpoint } from "@/libs/endpoints";
import { getPageId } from "@/libs/page-id";
import type { AutocompleteResponse } from "@/types";

async function handleAutocompleteRequest(
  pageId: string,
  tab: chrome.tabs.Tab | undefined,
  text: string,
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
    await ensureFreshContext(pageId, tab);
    const { data } = await api.post(getEndpoint("autocomplete"), {
      pageId,
      text,
    });
    return {
      success: true,
      completions: data.data?.completions || [],
      toolUsageId: data.data?.toolUsageId,
    };
  } catch {
    return { success: false, error: "API error", reason: "api_error" };
  }
}

async function handleAutocompleteAccept(
  toolUsageId: string,
  suggestionIndex: number,
): Promise<void> {
  const stored = await chrome.storage.local.get("vigogh-auth-token");
  if (!stored["vigogh-auth-token"]) return;
  api
    .post(getEndpoint("autocompleteAccept"), { toolUsageId, suggestionIndex })
    .catch(() => {});
}

export const handleMessages: BackgroundMessageHandler = (
  message,
  sender,
  sendResponse,
) => {
  if (message.action === "autocomplete_request") {
    const pageId = getPageId(sender.tab);
    handleAutocompleteRequest(pageId, sender.tab, message.text)
      .then(sendResponse)
      .catch(() => sendResponse({ success: false }));
    return true;
  }
  if (message.action === "autocomplete_accept") {
    handleAutocompleteAccept(
      message.toolUsageId,
      message.suggestionIndex,
    ).catch(() => {});
    sendResponse({ success: true });
    return false;
  }
  return null;
};
