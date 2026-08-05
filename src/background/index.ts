import {
  ALLOWED_EXTERNAL_MESSAGE_ORIGINS,
  STATIC_BASE_URL,
} from "@/libs/constants";
import { initLogger, logger } from "@/libs/logger";
import type {
  ExtensionLocales,
  ExtensionMessage,
  PageSessionData,
} from "@/types";
import "@/libs/api-runner";
import { maybeRefreshAuthToken } from "@/libs/auth";

initLogger("background");

import { toolHandlers } from "@/background/handlers";
import { extractPageDataInPage } from "@/libs/html-page-extraction";
import {
  openSidePanelForTab,
  openSidePanelFromActiveTab,
} from "@/libs/sidepanel";
import { captureActiveTab } from "@/utils/capture";

let pageData: PageSessionData | null = null;

chrome.storage.local
  .remove([
    "vigogh-autocomplete-sites",
    "vigogh-ai-menu-all-sites",
    "vigogh-ai-menu-sites",
    "vigogh-ai-menu-custom-sites",
  ])
  .catch(() => {});

if (__DEV__) {
  let lastToken = "";
  const tokenUrl = chrome.runtime.getURL("build_token.json");

  function pollReload(): void {
    fetch(tokenUrl, { cache: "no-store" })
      .then((r) => r.json())
      .then((data: { t: string }) => {
        if (lastToken && data.t !== lastToken) {
          chrome.runtime.reload();
          return;
        }
        lastToken = data.t;
        setTimeout(pollReload, 1500);
      })
      .catch(() => setTimeout(pollReload, 2000));
  }

  pollReload();
}

async function persistAuthToken(message: {
  token: string;
  refreshToken?: string;
  customToken?: string;
}): Promise<void> {
  const { token, refreshToken, customToken } = message;
  const toStore: Record<string, unknown> = { "vigogh-auth-token": token };
  if (refreshToken) toStore["vigogh-auth-refresh-token"] = refreshToken;
  if (customToken) {
    toStore["vigogh-pending-custom-token"] = customToken;
    toStore["vigogh-pending-custom-token-expires-at"] =
      Date.now() + 5 * 60 * 1000;
  }
  toStore["vigogh-auth-token-expires-at"] = Date.now() + 60 * 60 * 1000;

  await chrome.storage.local.set(toStore);
  logger.info("auth:token-set", {
    hasRefreshToken: !!refreshToken,
    hasCustomToken: !!customToken,
  });
  fetchAndCacheConfig().catch(() => {});
}

async function fetchAndCacheConfig(): Promise<void> {
  await maybeRefreshAuthToken().catch(() => null);

  const [settingsResponse, localesResponse, stylesResponse] = await Promise.all(
    [
      fetch(`${STATIC_BASE_URL}/extensions/settings.json`),
      fetch(`${STATIC_BASE_URL}/extensions/locales.json`).catch(() => null),
      fetch(`${STATIC_BASE_URL}/extensions/styles.json`).catch(() => null),
    ],
  );

  if (!settingsResponse.ok) return;

  const config = await settingsResponse.json();
  if (!config?.sites) return;

  const toStore: Record<string, unknown> = { "vigogh-settings": config };

  if (localesResponse?.ok) {
    const locales = await localesResponse.json().catch(() => null);
    if (locales) toStore["vigogh-locales"] = locales;
  }

  if (stylesResponse?.ok) {
    const styles = await stylesResponse.json().catch(() => null);
    if (styles) toStore["vigogh-styles"] = styles;
  }

  await chrome.storage.local.set(toStore);
}

fetchAndCacheConfig().catch(() => {});

chrome.runtime.onInstalled.addListener(async (details) => {
  logger.info("background:installed", { reason: details.reason });
  maybeRefreshAuthToken().catch(() => {});
  try {
    await fetchAndCacheConfig();
  } catch {}
});

async function capturePageData(tabId: number, windowId: number): Promise<void> {
  if (__DEV__) logger.debug("background:capture-page:start");

  const stored = await chrome.storage.local
    .get("vigogh-settings")
    .catch(() => ({}) as Record<string, unknown>);
  const settings = stored["vigogh-settings"] as
    | { behavior?: { mainContentLimit?: number; maxLinks?: number } }
    | undefined;
  const mainContentLimit = settings?.behavior?.mainContentLimit ?? 12000;
  const maxLinks = settings?.behavior?.maxLinks ?? 50;

  const results = await chrome.scripting.executeScript({
    target: { tabId },
    func: extractPageDataInPage,
    args: [mainContentLimit, maxLinks],
  });

  if (!results?.[0]?.result) {
    throw new Error("No results from content script");
  }

  const contentData = results[0].result;

  const screenshot = await captureActiveTab(tabId, windowId);

  pageData = {
    pageURL: contentData.pageURL || "",
    pageContent: contentData.pageContent || "",
    pageMetadata: contentData.pageMetadata || "",
    pageForms: contentData.pageForms || "",
    pageScreenshot: screenshot,
  };

  if (__DEV__) {
    logger.debug("background:capture-page:ready", {
      pageContentLength: pageData.pageContent.length,
      pageMetadataLength: pageData.pageMetadata.length,
      pageFormsLength: pageData.pageForms.length,
      hasScreenshot: !!pageData.pageScreenshot,
    });
  }
}

async function ensureSettingsCached(): Promise<void> {
  const stored = await chrome.storage.local.get<{
    "vigogh-settings"?: unknown;
    "vigogh-locales"?: unknown;
    "vigogh-styles"?: unknown;
  }>(["vigogh-settings", "vigogh-locales", "vigogh-styles"]);
  if (
    stored["vigogh-settings"] &&
    stored["vigogh-locales"] &&
    stored["vigogh-styles"]
  )
    return;
  await fetchAndCacheConfig();
}

async function resolveNotAvailableMessage(): Promise<string> {
  const stored = await chrome.storage.local.get<{
    "vigogh-locales"?: ExtensionLocales;
    "vigogh-region"?: "us" | "br";
  }>(["vigogh-locales", "vigogh-region"]);
  const locales = stored["vigogh-locales"];
  const region: "us" | "br" = stored["vigogh-region"] ?? "br";
  const errors = locales?.messages?.errors;
  const entry = errors?.EXTENSION_NOT_AVAILABLE_HERE ?? errors?.DEFAULT;
  if (!entry) return "";
  if (typeof entry === "string") return entry;
  return entry[region] ?? entry.br ?? entry.us ?? "";
}

const injectedTabs = new Set<number>();

chrome.tabs.onRemoved.addListener((tabId) => {
  injectedTabs.delete(tabId);
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === "loading") injectedTabs.delete(tabId);
});

chrome.action.onClicked.addListener((tab) => {
  if (!tab.id) return;
  const tabId = tab.id;
  const windowId = tab.windowId;
  logger.info("background:action-click", { tabId });

  void handleActionClick(tabId, windowId);
});

async function handleActionClick(
  tabId: number,
  windowId: number | undefined,
): Promise<void> {
  const stored = await chrome.storage.local
    .get("vigogh-ai-button-enabled")
    .catch(() => ({}) as Record<string, unknown>);
  const wasEnabled = stored["vigogh-ai-button-enabled"] !== false;

  if (!wasEnabled) {
    await chrome.storage.local
      .set({ "vigogh-ai-button-enabled": true })
      .catch(() => {});
    if (!injectedTabs.has(tabId)) {
      void handleFirstClick(tabId);
    } else {
      fetchAndCacheConfig().catch(() => {});
    }
    return;
  }

  if (injectedTabs.has(tabId)) {
    chrome.sidePanel
      .open(windowId !== undefined ? { tabId, windowId } : { tabId })
      .then(() => {
        logger.info("background:open-side-panel:ok", { tabId });
      })
      .catch((error: Error) => {
        logger.error("background:open-side-panel", { error });
      });
    fetchAndCacheConfig().catch(() => {});
    return;
  }

  void handleFirstClick(tabId);
}

async function handleFirstClick(tabId: number): Promise<void> {
  fetchAndCacheConfig().catch(() => {});
  await ensureSettingsCached();

  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["contentScript.js"],
    });
    injectedTabs.add(tabId);
    logger.info("background:inject-content-script:ok", { tabId });
  } catch (error) {
    logger.error("background:inject-content-script", { error: error as Error });
    const message = await resolveNotAvailableMessage();
    chrome.scripting
      .executeScript({
        target: { tabId },
        func: (msg: string) => {
          alert(msg);
        },
        args: [message],
      })
      .catch((alertError: Error) => {
        logger.error("background:not-available-alert", { error: alertError });
      });
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id) return false;

  if (message.action === "capture_page") {
    if (__DEV__) logger.debug("background:capture-page:request-received");

    chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
      const tab = tabs?.[0];
      if (!tab?.id || !tab.windowId) {
        sendResponse({ success: false, error: "No active tab" });
        return;
      }

      capturePageData(tab.id, tab.windowId)
        .then(() => {
          sendResponse({ success: true, data: pageData });
          pageData = null;
        })
        .catch((error: Error) => {
          logger.error("background:capture-page", { error });
          sendResponse({ success: false, error: error.message });
        });
    });

    return true;
  }

  if (message.action === "set_auth_token") {
    persistAuthToken(message)
      .then(() => sendResponse({ success: true }))
      .catch(() => sendResponse({ success: false }));
    return true;
  }

  if (message.action === "clear_auth_token") {
    chrome.storage.local
      .remove([
        "vigogh-auth-token",
        "vigogh-auth-refresh-token",
        "vigogh-auth-token-expires-at",
      ])
      .then(() => {
        logger.info("auth:token-cleared");
        sendResponse({ success: true });
      })
      .catch(() => sendResponse({ success: false }));
    return true;
  }

  if (message.action === "auth_check") {
    maybeRefreshAuthToken()
      .then((token) => {
        chrome.storage.local
          .get<{
            "vigogh-pending-custom-token"?: string;
            "vigogh-pending-custom-token-expires-at"?: number;
          }>([
            "vigogh-pending-custom-token",
            "vigogh-pending-custom-token-expires-at",
          ])
          .then((stored) => {
            const customToken = stored["vigogh-pending-custom-token"];
            const expiresAt = stored["vigogh-pending-custom-token-expires-at"];
            const isValid =
              !!customToken && !!expiresAt && Date.now() < expiresAt;

            if (customToken) {
              chrome.storage.local
                .remove([
                  "vigogh-pending-custom-token",
                  "vigogh-pending-custom-token-expires-at",
                ])
                .catch(() => {});
            }

            sendResponse({
              success: true,
              hasToken: !!token,
              customToken: isValid ? customToken : undefined,
            });
          })
          .catch(() => sendResponse({ success: true, hasToken: !!token }));
      })
      .catch(() => sendResponse({ success: false }));
    return true;
  }

  if (message.action === "reload_active_tab") {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]?.id != null) chrome.tabs.reload(tabs[0].id);
    });
    sendResponse({ success: true });
    return false;
  }

  if (message.action === "set_feature_flags") {
    chrome.storage.local
      .set({ "vigogh-feature-flags": message.featureFlags })
      .then(() => sendResponse({ success: true }))
      .catch(() => sendResponse({ success: false }));
    return true;
  }

  if (message.action === "set_tool_preferences") {
    chrome.storage.local
      .set({ "vigogh-tool-preferences": message.preferences })
      .then(() => sendResponse({ success: true }))
      .catch(() => sendResponse({ success: false }));
    return true;
  }

  if (message.action === "set_ai_button_enabled") {
    chrome.storage.local
      .set({ "vigogh-ai-button-enabled": !!message.enabled })
      .then(() => sendResponse({ success: true }))
      .catch(() => sendResponse({ success: false }));
    return true;
  }

  if (message.action === "check_selection_state") {
    chrome.tabs
      .query({ active: true, currentWindow: true })
      .then(async (tabs) => {
        const tab = tabs[0];
        if (!tab?.id) {
          sendResponse({ success: true, hasText: false });
          return;
        }
        try {
          const results = await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: () =>
              (window.getSelection()?.toString().trim().length ?? 0) > 0,
          });
          sendResponse({
            success: true,
            hasText: (results[0]?.result as boolean) ?? false,
          });
        } catch {
          sendResponse({ success: true, hasText: false });
        }
      })
      .catch(() => sendResponse({ success: true, hasText: false }));
    return true;
  }

  if (message.action === "serious_error_broadcast") {
    const payload = message.payload;
    chrome.tabs
      .query({ active: true, lastFocusedWindow: true })
      .then((tabs) => {
        const tabId = tabs[0]?.id;
        if (tabId !== undefined) {
          chrome.tabs
            .sendMessage(tabId, { action: "serious_error_toast", payload })
            .catch(() => {});
        }
      })
      .catch(() => {});
    chrome.runtime
      .sendMessage({ action: "serious_error_toast", payload })
      .catch(() => {});
    sendResponse({ ok: true });
    return false;
  }

  if (message.action === "open_side_panel") {
    const tabId = sender.tab?.id;
    const windowId = sender.tab?.windowId;
    const opener =
      tabId !== undefined || windowId !== undefined
        ? openSidePanelForTab(tabId, windowId)
        : openSidePanelFromActiveTab();
    opener
      .then((ok) => sendResponse({ ok }))
      .catch(() => sendResponse({ ok: false }));
    return true;
  }

  if (message.action === "indicator_event") {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs[0];
      if (tab?.id) {
        chrome.tabs
          .sendMessage(tab.id, {
            action: "indicator_event",
            indicator: message.indicator,
            show: message.show,
          })
          .catch(() => {});
      }
    });
    sendResponse({ success: true });
    return false;
  }

  for (const handler of toolHandlers) {
    const result = handler(message as ExtensionMessage, sender, sendResponse);
    if (result !== null) return result;
  }

  return false;
});

function isAllowedExternalOrigin(origin: string | undefined): boolean {
  if (!origin) return false;
  if (ALLOWED_EXTERNAL_MESSAGE_ORIGINS.includes(origin)) return true;
  return origin.startsWith("https://") && origin.endsWith(".vigogh.com");
}

chrome.runtime.onMessageExternal.addListener(
  (message, sender, sendResponse) => {
    if (!isAllowedExternalOrigin(sender.origin)) {
      logger.warn("auth:external-origin-rejected", {
        origin: sender.origin,
        action: message?.action,
      });
      sendResponse({ success: false });
      return false;
    }

    if (message.action === "set_auth_token") {
      persistAuthToken(message)
        .then(() => sendResponse({ success: true }))
        .catch(() => sendResponse({ success: false }));
      return true;
    }

    return false;
  },
);

chrome.runtime.onStartup.addListener(() => {
  maybeRefreshAuthToken().catch(() => {});
});

maybeRefreshAuthToken().catch(() => {});
