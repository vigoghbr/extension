import {
  getInflightSend,
  isContextFresh,
  sendPrepareContext,
} from "@/background/handlers/context-prepare";
import { logger } from "@/libs/logger";
import { capturePageData } from "@/libs/page-capture";

const inflightRefresh = new Map<string, Promise<void>>();

export async function ensureFreshContext(
  pageId: string,
  tab: chrome.tabs.Tab | undefined,
): Promise<void> {
  if (isContextFresh(pageId)) return;

  const pendingSend = getInflightSend(pageId);
  if (pendingSend) {
    await pendingSend;
    return;
  }

  const existing = inflightRefresh.get(pageId);
  if (existing) return existing;

  const refresh = (async () => {
    if (!tab?.id || tab.windowId === undefined) return;
    try {
      const data = await capturePageData(tab.id, tab.windowId, true);
      await sendPrepareContext(pageId, data);
    } catch (error) {
      logger.error("context-guard:refresh-failed", { error, pageId });
    }
  })();

  inflightRefresh.set(pageId, refresh);
  try {
    await refresh;
  } finally {
    inflightRefresh.delete(pageId);
  }
}
