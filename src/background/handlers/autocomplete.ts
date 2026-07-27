import type { BackgroundMessageHandler } from "@/background/handlers/types";
import api from "@/libs/api-dispatch";
import { getEndpoint } from "@/libs/endpoints";
import { logger } from "@/libs/logger";
import type { AutocompleteResponse } from "@/types";

async function handleAutocompleteRequest(
  text: string,
  url: string,
  messages: { role: string; text: string }[],
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
      text,
      url,
      messages,
    });
    return {
      success: true,
      completion: data.data?.completion || "",
      toolUsageId: data.data?.toolUsageId,
    };
  } catch (error) {
    logger.error("autocomplete:request", { error });
    return { success: false, error: "API error", reason: "api_error" };
  }
}

async function handleAutocompleteAccept(toolUsageId: string): Promise<void> {
  const stored = await chrome.storage.local.get("vigogh-auth-token");
  if (!stored["vigogh-auth-token"]) return;
  api
    .post(getEndpoint("autocompleteAccept"), { toolUsageId })
    .catch((error) => logger.error("autocomplete:accept", { error }));
}

export const handleMessages: BackgroundMessageHandler = (
  message,
  _sender,
  sendResponse,
) => {
  if (message.action === "autocomplete_request") {
    handleAutocompleteRequest(
      message.text,
      message.url,
      (message as { messages?: { role: string; text: string }[] }).messages ||
        [],
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
