import { resolveConfig } from "@/stores/extensionStore";
import type {
  AiButtonAppearance,
  ExtensionLocales,
  ExtensionSettings,
  ExtensionStyles,
  IframeToSidepanelPostMessage,
  PageSessionData,
  ThemeDefinition,
  ToolResponse,
  UserToolPreferences,
} from "@/types";

interface ToolPreferencesStorage {
  "vigogh-tool-preferences"?: UserToolPreferences;
}

interface AiButtonAppearanceStorage {
  "vigogh-ai-button-appearance"?: AiButtonAppearance;
}

interface AiButtonEnabledStorage {
  "vigogh-ai-button-enabled"?: boolean;
}

interface PendingRouteStorage {
  "vigogh-pending-route"?: string;
}

async function getThemesWithLabels(): Promise<ThemeDefinition[]> {
  const stored = await chrome.storage.local.get<{
    "vigogh-locales"?: ExtensionLocales;
    "vigogh-styles"?: ExtensionStyles;
  }>(["vigogh-locales", "vigogh-styles"]);
  const locales = stored["vigogh-locales"];
  const styles = stored["vigogh-styles"];
  if (!styles) return [];
  if (!locales?.themes) return styles.themes;
  return styles.themes.map((t) => ({
    ...t,
    labels: locales.themes[t.name]?.label as
      | { us: string; br: string }
      | undefined,
  }));
}

import { logger, logRemoteEntry } from "@/libs/logger";
import { isExtensionContextValid } from "@/utils/extension-context";

function sendDataToIframe(
  iframe: HTMLIFrameElement,
  targetOrigin: string,
  data: PageSessionData,
): void {
  try {
    iframe.contentWindow!.postMessage(
      {
        type: "VIGOGH_PAGE_DATA",
        data: {
          pageURL: data.pageURL || "",
          pageContent: data.pageContent || "",
          pageMetadata: data.pageMetadata || "",
          pageForms: data.pageForms || "",
          pageScreenshot: data.pageScreenshot || "",
          applyConfig: null,
        },
      },
      targetOrigin,
    );
  } catch (error) {
    console.error("Sidepanel: Error sending data to iframe:", error);
    logger.error("sidepanel:bridge", { error });
  }
}

function captureAndSend(iframe: HTMLIFrameElement, targetOrigin: string): void {
  try {
    chrome.runtime.sendMessage(
      { action: "capture_page" as const },
      (response: { success: boolean; data: PageSessionData | null }) => {
        if (chrome.runtime.lastError) {
          console.error(
            "Sidepanel: Error capturing page:",
            chrome.runtime.lastError,
          );
          logger.error("sidepanel:bridge", {
            error: new Error(chrome.runtime.lastError.message),
          });
          return;
        }

        if (!response?.success || !response.data) {
          console.error("Sidepanel: Capture failed or no data returned");
          return;
        }

        sendDataToIframe(iframe, targetOrigin, response.data);
      },
    );
  } catch (error) {
    console.error("Sidepanel: Failed to capture page:", error);
    logger.error("sidepanel:bridge", { error });
  }
}

let captureCooldownMs = 1000;
let lastCaptureTime = 0;

chrome.storage.local
  .get<{ "vigogh-settings"?: ExtensionSettings; "vigogh-styles"?: ExtensionStyles }>([
    "vigogh-settings",
    "vigogh-styles",
  ])
  .then((stored) => {
    const config = stored["vigogh-settings"];
    const styles = stored["vigogh-styles"];
    if (config && styles)
      captureCooldownMs =
        resolveConfig(config, styles).behavior.captureCooldownMs ??
        captureCooldownMs;
  })
  .catch(() => {});

export function setupIframeBridge(
  iframe: HTMLIFrameElement,
  targetOrigin: string,
  sidepanelUrl: string,
): void {
  iframe.src = sidepanelUrl;

  function sendPinnedStatus(isPinned: boolean): void {
    iframe.contentWindow!.postMessage(
      { type: "VIGOGH_EXTENSION_PINNED_STATUS", isPinned },
      targetOrigin,
    );
  }

  function checkAndSendPinnedStatus(): void {
    if (!isExtensionContextValid()) return;

    chrome.action
      .getUserSettings()
      .then((settings) => {
        sendPinnedStatus(settings.isOnToolbar);
      })
      .catch((error) => {
        logger.error("sidepanel:bridge", { error });
      });
  }

  chrome.action.onUserSettingsChanged.addListener((change) => {
    if (change.isOnToolbar !== undefined) {
      sendPinnedStatus(change.isOnToolbar);
    }
  });

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg?.action === "serious_error_toast") {
      try {
        iframe.contentWindow?.postMessage(
          { type: "VIGOGH_SERIOUS_ERROR", payload: msg.payload },
          targetOrigin,
        );
      } catch {}
    }
    if (msg?.action === "navigate_sidepanel" && typeof msg.path === "string") {
      try {
        iframe.contentWindow?.postMessage(
          { type: "VIGOGH_NAVIGATE", path: msg.path },
          targetOrigin,
        );
      } catch {}
    }
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if (!("vigogh-ai-button-enabled" in changes)) return;
    const enabled =
      (changes["vigogh-ai-button-enabled"].newValue as boolean | undefined) ?? true;
    try {
      iframe.contentWindow?.postMessage(
        { type: "VIGOGH_AI_BUTTON_ENABLED", enabled },
        targetOrigin,
      );
    } catch {}
  });

  window.addEventListener(
    "message",
    (event: MessageEvent<IframeToSidepanelPostMessage>) => {
      if (event.origin !== targetOrigin) return;

      if (event.data?.type === "VIGOGH_IFRAME_READY") {
        logger.info("iframe:ready");
        iframe.contentWindow!.postMessage(
          { type: "VIGOGH_EXTENSION_ID", id: chrome.runtime.id },
          targetOrigin,
        );
        if (isExtensionContextValid()) {
          try {
            chrome.runtime.sendMessage(
              { action: "auth_check" as const },
              (response) => {
                if (chrome.runtime.lastError) return;
                const customToken: string | undefined = response?.customToken;
                if (!customToken) return;
                iframe.contentWindow!.postMessage(
                  { type: "VIGOGH_CUSTOM_TOKEN", token: customToken },
                  targetOrigin,
                );
              },
            );
          } catch {}
        }
        checkAndSendPinnedStatus();
        chrome.storage.local
          .get<ToolPreferencesStorage>("vigogh-tool-preferences")
          .then((stored) => {
            const preferences: UserToolPreferences = stored[
              "vigogh-tool-preferences"
            ] ?? {
              toolsEnabled: {},
              transformsEnabled: {},
              indicatorsEnabled: { page: true, bottomBorder: true },
              aiMenuTools: {},
            };
            iframe.contentWindow!.postMessage(
              { type: "VIGOGH_TOOL_PREFERENCES", preferences },
              targetOrigin,
            );
          })
          .catch(() => {});
        Promise.all([
          chrome.storage.local.get<AiButtonAppearanceStorage>("vigogh-ai-button-appearance"),
          getThemesWithLabels(),
        ])
          .then(([stored, themes]) => {
            const appearance: AiButtonAppearance | null =
              stored["vigogh-ai-button-appearance"] ?? null;
            iframe.contentWindow!.postMessage(
              { type: "VIGOGH_AI_BUTTON_APPEARANCE", appearance, themes },
              targetOrigin,
            );
          })
          .catch(() => {});
        chrome.storage.local
          .get<AiButtonEnabledStorage>("vigogh-ai-button-enabled")
          .then((stored) => {
            const enabled: boolean = stored["vigogh-ai-button-enabled"] ?? true;
            iframe.contentWindow!.postMessage(
              { type: "VIGOGH_AI_BUTTON_ENABLED", enabled },
              targetOrigin,
            );
          })
          .catch(() => {});
        chrome.storage.local
          .get<PendingRouteStorage>("vigogh-pending-route")
          .then((stored) => {
            const path = stored["vigogh-pending-route"];
            if (typeof path !== "string" || !path) return;
            chrome.storage.local.remove("vigogh-pending-route").catch(() => {});
            iframe.contentWindow!.postMessage(
              { type: "VIGOGH_NAVIGATE", path },
              targetOrigin,
            );
          })
          .catch(() => {});
      } else if (event.data?.type === "VIGOGH_CAPTURE_PAGE") {
        const now = Date.now();
        if (now - lastCaptureTime < captureCooldownMs) return;
        lastCaptureTime = now;
        if (!isExtensionContextValid()) return;
        captureAndSend(iframe, targetOrigin);
      } else if (event.data?.type === "VIGOGH_SET_AUTH_TOKEN") {
        if (!isExtensionContextValid()) return;

        const token = event.data.token;
        const refreshToken: string | undefined = event.data.refreshToken;
        chrome.runtime.sendMessage(
          { action: "set_auth_token" as const, token, refreshToken },
          () => {
            if (chrome.runtime.lastError) {
              console.error(
                "Sidepanel: Error setting auth token:",
                chrome.runtime.lastError,
              );
            }
          },
        );
      } else if (event.data?.type === "VIGOGH_CLEAR_AUTH_TOKEN") {
        if (!isExtensionContextValid()) return;

        chrome.runtime.sendMessage(
          { action: "clear_auth_token" as const },
          () => {
            if (chrome.runtime.lastError) {
              console.error(
                "Sidepanel: Error clearing auth token:",
                chrome.runtime.lastError,
              );
            }
          },
        );
      } else if (event.data?.type === "VIGOGH_TEXT_TRANSFORM") {
        if (!isExtensionContextValid()) return;

        const { action } = event.data;

        chrome.runtime.sendMessage(
          {
            action: "sidepanel_transforms_request" as const,
            transformAction: action,
          },
          (response: ToolResponse) => {
            if (chrome.runtime.lastError) {
              iframe.contentWindow!.postMessage(
                {
                  type: "VIGOGH_TEXT_TRANSFORM_RESULT",
                  success: false,
                  error: "extension_error",
                },
                targetOrigin,
              );
              return;
            }
            iframe.contentWindow!.postMessage(
              {
                type: "VIGOGH_TEXT_TRANSFORM_RESULT",
                success: response?.success ?? false,
                error: response?.error,
              },
              targetOrigin,
            );
          },
        );
      } else if (event.data?.type === "VIGOGH_SET_FEATURE_FLAGS") {
        if (!isExtensionContextValid()) return;
        chrome.runtime.sendMessage(
          {
            action: "set_feature_flags" as const,
            featureFlags: event.data.featureFlags,
          },
          () => {
            if (chrome.runtime.lastError) {
              logger.error("sidepanel:bridge", {
                error: new Error(chrome.runtime.lastError.message),
              });
            }
          },
        );
      } else if (event.data?.type === "VIGOGH_INDICATOR_EVENT") {
        if (!isExtensionContextValid()) return;
        const { indicator, show } = event.data;
        chrome.runtime.sendMessage(
          { action: "indicator_event" as const, indicator, show },
          () => {
            if (chrome.runtime.lastError) {
              logger.error("sidepanel:bridge", {
                error: new Error(chrome.runtime.lastError.message),
              });
            }
          },
        );
      } else if (event.data?.type === "VIGOGH_CHECK_SELECTION") {
        if (!isExtensionContextValid()) return;
        chrome.runtime.sendMessage(
          { action: "check_selection_state" as const },
          (response: { success: boolean; hasText: boolean }) => {
            if (chrome.runtime.lastError) {
              iframe.contentWindow!.postMessage(
                { type: "VIGOGH_SELECTION_STATE", hasText: false },
                targetOrigin,
              );
              return;
            }
            iframe.contentWindow!.postMessage(
              {
                type: "VIGOGH_SELECTION_STATE",
                hasText: response?.hasText ?? false,
              },
              targetOrigin,
            );
          },
        );
      } else if (event.data?.type === "VIGOGH_GET_TOOL_PREFERENCES") {
        if (!isExtensionContextValid()) return;
        chrome.storage.local
          .get<ToolPreferencesStorage>("vigogh-tool-preferences")
          .then((stored) => {
            const preferences: UserToolPreferences = stored[
              "vigogh-tool-preferences"
            ] ?? {
              toolsEnabled: {},
              transformsEnabled: {},
              indicatorsEnabled: { page: true, bottomBorder: true },
              aiMenuTools: {},
            };
            iframe.contentWindow!.postMessage(
              { type: "VIGOGH_TOOL_PREFERENCES", preferences },
              targetOrigin,
            );
          })
          .catch(() => {});
      } else if (event.data?.type === "VIGOGH_SET_TOOL_PREFERENCES") {
        if (!isExtensionContextValid()) return;
        chrome.runtime.sendMessage(
          {
            action: "set_tool_preferences" as const,
            preferences: event.data.preferences,
          },
          () => {
            if (chrome.runtime.lastError) {
              logger.error("sidepanel:bridge", {
                error: new Error(chrome.runtime.lastError.message),
              });
            }
          },
        );
      } else if (event.data?.type === "VIGOGH_GET_AI_BUTTON_APPEARANCE") {
        if (!isExtensionContextValid()) return;
        Promise.all([
          chrome.storage.local.get<AiButtonAppearanceStorage>("vigogh-ai-button-appearance"),
          getThemesWithLabels(),
        ])
          .then(([stored, themes]) => {
            const appearance: AiButtonAppearance | null =
              stored["vigogh-ai-button-appearance"] ?? null;
            iframe.contentWindow!.postMessage(
              { type: "VIGOGH_AI_BUTTON_APPEARANCE", appearance, themes },
              targetOrigin,
            );
          })
          .catch(() => {});
      } else if (event.data?.type === "VIGOGH_SET_AI_BUTTON_APPEARANCE") {
        if (!isExtensionContextValid()) return;
        const { appearance } = event.data;
        if (appearance === null) {
          chrome.storage.local
            .remove("vigogh-ai-button-appearance")
            .catch(() => {});
        } else {
          chrome.storage.local
            .set({ "vigogh-ai-button-appearance": appearance })
            .catch(() => {});
        }
      } else if (event.data?.type === "VIGOGH_GET_AI_BUTTON_ENABLED") {
        if (!isExtensionContextValid()) return;
        chrome.storage.local
          .get<AiButtonEnabledStorage>("vigogh-ai-button-enabled")
          .then((stored) => {
            const enabled: boolean = stored["vigogh-ai-button-enabled"] ?? true;
            iframe.contentWindow!.postMessage(
              { type: "VIGOGH_AI_BUTTON_ENABLED", enabled },
              targetOrigin,
            );
          })
          .catch(() => {});
      } else if (event.data?.type === "VIGOGH_SET_AI_BUTTON_ENABLED") {
        if (!isExtensionContextValid()) return;
        chrome.runtime.sendMessage(
          {
            action: "set_ai_button_enabled" as const,
            enabled: event.data.enabled,
          },
          () => {
            if (chrome.runtime.lastError) {
              logger.error("sidepanel:bridge", {
                error: new Error(chrome.runtime.lastError.message),
              });
            }
          },
        );
      } else if (event.data?.type === "VIGOGH_SET_REGION") {
        if (!isExtensionContextValid()) return;
        chrome.storage.local
          .set({ "vigogh-region": event.data.region })
          .catch(() => {});
      } else if (event.data?.type === "VIGOGH_CLOSE_SIDEPANEL") {
        window.close();
      } else if (event.data?.type === "VIGOGH_DEBUG_LOG") {
        const { level, prefix, data } = event.data;
        logRemoteEntry("sidepanel", level, prefix, data);
      }
    },
  );
}
