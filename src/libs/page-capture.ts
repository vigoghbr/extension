import { logger } from "@/libs/logger";
import { extractPageScreenshot } from "@/libs/page-screenshot-extraction";
import type { PageSessionData } from "@/types";

export async function capturePageData(
  tabId: number,
  windowId: number,
  silent: boolean,
): Promise<PageSessionData> {
  if (__DEV__) logger.debug("background:capture-page:start");

  const stored = await chrome.storage.local
    .get("vigogh-settings")
    .catch(() => ({}) as Record<string, unknown>);
  const settings = stored["vigogh-settings"] as
    | { behavior?: { pageContentMaxSizeKB?: number } }
    | undefined;
  const pageContentMaxBytes =
    (settings?.behavior?.pageContentMaxSizeKB ?? 512) * 1024;

  const contentData = await chrome.tabs.sendMessage(tabId, {
    action: "extract_page_content",
    maxLength: pageContentMaxBytes,
  });

  if (!contentData) {
    throw new Error("No results from content script");
  }

  const screenshot = await extractPageScreenshot(tabId, windowId, silent);

  const data: PageSessionData = {
    pageURL: contentData.pageURL || "",
    pageContent: contentData.pageContent || "",
    pageMetadata: contentData.pageMetadata || "",
    pageForms: contentData.pageForms || "",
    pageScreenshot: screenshot,
  };

  if (__DEV__) {
    logger.debug("background:capture-page:ready", {
      pageMetadataLength: data.pageMetadata.length,
      pageFormsLength: data.pageForms.length,
      hasScreenshot: !!data.pageScreenshot,
    });
  }

  return data;
}
