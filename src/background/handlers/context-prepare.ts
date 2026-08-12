import type { BackgroundMessageHandler } from "@/background/handlers/types";
import api from "@/libs/api-dispatch";
import { getEndpoint } from "@/libs/endpoints";
import { getPageId } from "@/libs/page-id";
import type { ContextPrepareResponse, PageSessionData } from "@/types";

const CONTEXT_EXPIRY_SKEW_MS = 10_000;
const pageContextExpiry = new Map<string, number>();
const inflightSend = new Map<string, Promise<boolean>>();

export function isContextFresh(pageId: string): boolean {
  const expiresAt = pageContextExpiry.get(pageId);
  return (
    expiresAt !== undefined && Date.now() < expiresAt - CONTEXT_EXPIRY_SKEW_MS
  );
}

export function getInflightSend(pageId: string): Promise<boolean> | undefined {
  return inflightSend.get(pageId);
}

export async function sendPrepareContext(
  pageId: string,
  data: Partial<PageSessionData>,
): Promise<boolean> {
  const existing = inflightSend.get(pageId);
  if (existing) return existing;

  const send = (async () => {
    const stored = await chrome.storage.local.get("vigogh-auth-token");
    if (!stored["vigogh-auth-token"]) return false;

    const { data: envelope } = await api.post<{
      data: ContextPrepareResponse;
    }>(getEndpoint("context"), { pageId, ...data });

    const expiresAt = envelope.data?.expiresAt;
    if (expiresAt) pageContextExpiry.set(pageId, new Date(expiresAt).getTime());

    return true;
  })();

  inflightSend.set(pageId, send);
  try {
    return await send;
  } finally {
    inflightSend.delete(pageId);
  }
}

export const handleMessages: BackgroundMessageHandler = (
  message,
  sender,
  sendResponse,
) => {
  if (message.action === "prepare_context_request") {
    const pageId = getPageId(sender.tab);
    sendPrepareContext(pageId, {
      pageURL: message.pageURL,
      pageContent: message.pageContent,
      pageMetadata: message.pageMetadata,
      pageForms: message.pageForms,
      pageScreenshot: message.pageScreenshot,
    })
      .then((success) => sendResponse({ success }))
      .catch(() => sendResponse({ success: false }));
    return true;
  }
  return null;
};
