import { createStore } from "zustand/vanilla";
import { BASE_URL } from "@/libs/constants";
import {
  type IdentifyFieldHandle,
  identifyField,
} from "@/libs/field-identifier";
import { getLocale, getLocaleArray } from "@/libs/locale";
import { setStyles } from "@/stores/stylesStore";
import type {
  AiButtonAppearance,
  AnswerToolPageConfig,
  CaretCoordinates,
  ExtensionLocales,
  ExtensionSettings,
  ExtensionStyles,
  ResolvedAnswerToolConfig,
  ResolvedAnswerToolPageConfig,
  ResolvedExtensionSettings,
  ResolvedLinkItemConfig,
  ResolvedLinkToolConfig,
  ResolvedSitesFallbackConfig,
  ResolvedToggleToolConfig,
  ResolvedToolItemConfig,
  ResolvedTransformItemConfig,
  SiteConfig,
  SiteStrategy,
  ThemeColorSet,
  ToolItemConfig,
  UserToolPreferences,
} from "@/types";
import { SiteEngine } from "@/utils/engine";
import {
  DEFAULT_GENERAL_SELECTOR,
  GeneralInputStrategy,
} from "@/utils/general-strategy";
import { showIndicator } from "@/utils/indicators";
import { matchSite } from "@/utils/site-match";

interface ExtensionState {
  config: ResolvedExtensionSettings | null;
  siteConfig: SiteConfig | null;
  currentEditor: Element | null;
  widgetEnabled: boolean;
  widgetVisible: boolean;
  aiButtonEnabled: boolean;
  editorFocused: boolean;
  caretCoordinates: CaretCoordinates | null;
  disabled: boolean;
  sessionAutocompleteEnabled: boolean;
  overlayResetVersion: number;
  userToolsEnabled: Record<string, boolean>;
  panelVisible: boolean;
}

export const extensionStore = createStore<ExtensionState>()(() => ({
  config: null,
  siteConfig: null,
  currentEditor: null,
  widgetEnabled: false,
  widgetVisible: false,
  aiButtonEnabled: true,
  editorFocused: false,
  caretCoordinates: null,
  disabled: true,
  sessionAutocompleteEnabled: false,
  overlayResetVersion: 0,
  userToolsEnabled: {},
  panelVisible: false,
}));

let strategy: SiteStrategy | null = null;
let generalStrategy: GeneralInputStrategy | null = null;
let activeStrategy: SiteStrategy | null = null;

export function getActiveStrategy(): SiteStrategy | null {
  return activeStrategy;
}

export function resolveStrategyForElement(
  editor: Element,
): SiteStrategy | null {
  const { siteConfig } = extensionStore.getState();
  const siteSelector = siteConfig?.editorSelector;
  const usesSiteStrategy =
    !!siteSelector &&
    (editor.matches(siteSelector) || !!editor.closest(siteSelector));
  return usesSiteStrategy ? strategy : generalStrategy;
}

export function resolveInitialTargetField(
  toastCode: string,
): IdentifyFieldHandle {
  const { siteConfig } = extensionStore.getState();
  if (siteConfig?.editorSelector) {
    const editor = document.querySelector(
      siteConfig.editorSelector,
    ) as HTMLElement | null;
    if (editor) {
      return { promise: Promise.resolve(editor), cancel: () => {} };
    }
  }
  return identifyField(toastCode);
}

export function resolveEditorWithStrategy(): {
  editor: HTMLElement | null;
  strategy: SiteStrategy | null;
} {
  const { currentEditor, siteConfig } = extensionStore.getState();
  if (currentEditor) {
    return { editor: currentEditor as HTMLElement, strategy: activeStrategy };
  }
  if (siteConfig?.editorSelector) {
    const editor = document.querySelector(
      siteConfig.editorSelector,
    ) as HTMLElement | null;
    if (editor) return { editor, strategy };
  }
  const editor = document.querySelector(
    DEFAULT_GENERAL_SELECTOR,
  ) as HTMLElement | null;
  if (editor) return { editor, strategy: generalStrategy };
  return { editor: null, strategy: null };
}

export function resolveThemeColors(
  config: ResolvedExtensionSettings,
  appearance: AiButtonAppearance | null,
): ThemeColorSet {
  const base = config.theme.dark;
  if (appearance) {
    const named = config.themes.find((s) => s.name === appearance.theme);
    if (named) return { ...base, ...named.colors };
  }
  return base;
}

function resolvePage(page: AnswerToolPageConfig): ResolvedAnswerToolPageConfig {
  return {
    type: page.type,
    backLabel:
      page.backLabel !== undefined ? getLocale(page.backLabel, "") : undefined,
    additionalInput: page.additionalInput
      ? {
          enabled: page.additionalInput.enabled,
          maxLength: page.additionalInput.maxLength,
          placeholder:
            page.additionalInput.placeholder !== undefined
              ? getLocale(page.additionalInput.placeholder, "")
              : undefined,
        }
      : undefined,
    action: page.action
      ? {
          label:
            page.action.label !== undefined
              ? getLocale(page.action.label, "")
              : undefined,
          icon: page.action.icon,
        }
      : undefined,
    loadingMessage:
      page.loadingMessage !== undefined
        ? getLocale(page.loadingMessage, "")
        : undefined,
  };
}

function resolveTool(tool: ToolItemConfig): ResolvedToolItemConfig {
  if (tool.type === "answer") {
    const resolved: ResolvedAnswerToolConfig = {
      type: "answer",
      id: tool.id,
      enabled: tool.enabled,
      icon: tool.icon,
      label: tool.label !== undefined ? getLocale(tool.label, "") : undefined,
      style: tool.style,
      apiPath: tool.apiPath,
      pages: tool.pages?.map((p) => resolvePage(p)),
    };
    return resolved;
  }
  if (tool.type === "toggle") {
    const resolved: ResolvedToggleToolConfig = {
      type: "toggle",
      id: tool.id,
      enabled: tool.enabled,
      icon: tool.icon,
      label: tool.label !== undefined ? getLocale(tool.label, "") : undefined,
      toggleTarget: tool.toggleTarget,
    };
    return resolved;
  }
  const resolved: ResolvedLinkToolConfig = {
    type: "link",
    id: tool.id,
    enabled: tool.enabled,
    icon: tool.icon,
    label: tool.label !== undefined ? getLocale(tool.label, "") : undefined,
    linkAction: tool.linkAction,
    href: tool.href,
  };
  return resolved;
}

function mergeLocales(
  config: ExtensionSettings,
  locales: ExtensionLocales,
): ExtensionSettings {
  const tools = (config.widget?.tools ?? []).map((tool) => {
    const tl = locales.widget.tools[tool.id];
    if (!tl) return tool;
    if (tool.type === "answer" && tool.pages) {
      return {
        ...tool,
        label: tl.label,
        pages: tool.pages.map((page) => ({
          ...page,
          backLabel: tl.backLabel,
          additionalInput: page.additionalInput
            ? { ...page.additionalInput, placeholder: tl.placeholder }
            : page.additionalInput,
          action: page.action
            ? {
                ...page.action,
                label:
                  page.type === "direction"
                    ? tl.actionLabelInitial
                    : tl.actionLabel,
              }
            : page.action,
          loadingMessage: tl.loadingMessage,
        })),
      };
    }
    return { ...tool, label: tl.label };
  });

  return {
    ...config,
    messages: { ...config.messages, ...locales.messages },
    overlay: {
      ...config.overlay,
      acceptLabel: locales.overlay.acceptLabel,
      cancelLabel: locales.overlay.cancelLabel,
      autocompletePageTitle: locales.overlay.autocompletePageTitle,
      acceptHint: locales.overlay.acceptHint,
    },
    widget: {
      ...config.widget,
      transformsNoSelectionTooltip: locales.widget.transformsNoSelectionTooltip,
      tools,
      transforms: (config.widget?.transforms ?? []).map((t) => ({
        ...t,
        label: locales.widget.transforms[t.id]?.label ?? t.label,
      })),
      links: (config.widget?.links ?? []).map((l) => ({
        ...l,
        label: locales.widget.links[l.id]?.label ?? l.label,
      })),
      menu: locales.widget.menu,
    },
  };
}

export function resolveConfig(
  raw: ExtensionSettings,
  styles: ExtensionStyles,
): ResolvedExtensionSettings {
  const rawWidget = raw.widget ?? {};
  const rawTopBorder = raw.indicators?.topBorder ?? {};
  const rawLoadingAnim = rawWidget.loadingAnimation ?? {};
  const rawFallback = raw.sitesFallback ?? {};
  const rawMessages = raw.messages ?? {};

  const rawTheme = raw.theme ?? {};
  const defaultThemeColors = (
    styles.themes.find((t) => t.name === styles.defaultTheme) ??
    styles.themes[0]
  ).colors;

  return {
    version: raw.version,
    theme: {
      dark: { ...defaultThemeColors, ...rawTheme.dark },
    },
    messages: {
      errors: Object.fromEntries(
        Object.entries(rawMessages.errors ?? {}).map(([code, value]) => [
          code,
          getLocale(value),
        ]),
      ),
      success: Object.fromEntries(
        Object.entries(rawMessages.success ?? {}).map(([code, value]) => [
          code,
          getLocale(value),
        ]),
      ),
      info: Object.fromEntries(
        Object.entries(rawMessages.info ?? {}).map(([code, value]) => [
          code,
          getLocale(value),
        ]),
      ),
    },
    sites: raw.sites,
    behavior: {
      enabled: raw.behavior.enabled,
      debounceMs: raw.behavior.debounceMs,
      minTextLength: raw.behavior.minTextLength,
      captureQuality: raw.behavior.captureQuality,
      configRefreshMs: raw.behavior.configRefreshMs,
      captureCooldownMs: raw.behavior.captureCooldownMs,
      acceptKey: raw.behavior.acceptKey,
      dismissKey: raw.behavior.dismissKey,
      prevKey: raw.behavior.prevKey,
      nextKey: raw.behavior.nextKey,
      minSelectionLength: raw.behavior.minSelectionLength,
      captureDelayMs: raw.behavior.captureDelayMs,
      filesAttachDragSuppressMs: raw.behavior.filesAttachDragSuppressMs,
      filesAttachSuccessSuppressMs: raw.behavior.filesAttachSuccessSuppressMs,
      filesPasteHintDismissMs: raw.behavior.filesPasteHintDismissMs,
      filesUploadPollAttempts: raw.behavior.filesUploadPollAttempts,
      filesUploadPollIntervalMs: raw.behavior.filesUploadPollIntervalMs,
      windowDragMarginPx: raw.behavior.windowDragMarginPx,
      pageContentMaxSizeKB: raw.behavior.pageContentMaxSizeKB,
      pageScreenshotMaxSizeKB: raw.behavior.pageScreenshotMaxSizeKB,
      topIndicatorMaxDurationMs: raw.behavior.topIndicatorMaxDurationMs,
      bottomIndicatorMaxDurationMs: raw.behavior.bottomIndicatorMaxDurationMs,
      toastMaxDurationMs: raw.behavior.toastMaxDurationMs,
    },
    overlay: {
      color: raw.overlay.color,
      opacity: raw.overlay.opacity,
      badgeBackground: raw.overlay.badgeBackground,
      badgeFontSize: raw.overlay.badgeFontSize,
      maxDisplayLength: raw.overlay.maxDisplayLength,
      badgeText: getLocale(raw.overlay.badgeText),
      prevBadgeText: getLocale(raw.overlay.prevBadgeText),
      nextBadgeText: getLocale(raw.overlay.nextBadgeText),
      acceptLabel: getLocale(raw.overlay.acceptLabel),
      cancelLabel: getLocale(raw.overlay.cancelLabel),
      autocompletePageTitle: getLocale(raw.overlay.autocompletePageTitle),
      acceptHint: getLocale(raw.overlay.acceptHint),
      badgePaddingX: raw.overlay.badgePaddingX ?? 8,
      badgeGap: raw.overlay.badgeGap ?? 4,
      badgeSafetyPad: raw.overlay.badgeSafetyPad ?? 4,
    },
    widget: {
      enabled: rawWidget.enabled,
      bottom: rawWidget.bottom ?? styles.widget.bottom,
      right: rawWidget.right ?? styles.widget.right,
      width: rawWidget.width,
      height: rawWidget.height ?? styles.widget.height,
      iconSize: rawWidget.iconSize ?? styles.widget.iconSize,
      iconUrl: chrome.runtime.getURL(rawWidget.iconUrl || "white-icon128.png"),
      shineDuration: rawWidget.shineDuration ?? styles.widget.shineDuration,
      sweepDuration: rawWidget.sweepDuration ?? styles.widget.sweepDuration,
      loadingAnimation: {
        enabled: rawLoadingAnim.enabled,
        duration: rawLoadingAnim.duration ?? styles.widget.loadingDuration,
      },
      borderRadius: rawWidget.borderRadius,
      menuBorderRadius:
        rawWidget.menuBorderRadius ?? styles.widget.menuBorderRadius,
      menuMinWidth: rawWidget.menuMinWidth ?? styles.widget.menuMinWidth,
      menuMaxWidth: rawWidget.menuMaxWidth ?? styles.widget.menuMaxWidth,
      appUrl: rawWidget.appUrl ?? `${BASE_URL}/app`,
      transformsTooltipDelayMs:
        rawWidget.transformsTooltipDelayMs ??
        styles.widget.transformsTooltipDelayMs,
      defaultAdditionalInputMaxLength:
        rawWidget.defaultAdditionalInputMaxLength ?? 1000,
      transformsNoSelectionTooltip: getLocale(
        rawWidget.transformsNoSelectionTooltip,
      ),
      chat: { maxLength: rawWidget.chat!.maxLength },
      quickMessages: { maxLength: rawWidget.quickMessages!.maxLength },
      tools: (rawWidget.tools ?? []).map((t) => resolveTool(t)),
      transforms: (rawWidget.transforms ?? []).map(
        (t): ResolvedTransformItemConfig => ({
          id: t.id,
          enabled: t.enabled,
          icon: t.icon,
          label: t.label !== undefined ? getLocale(t.label, "") : undefined,
          transformAction: t.transformAction,
          autoApply: t.autoApply,
        }),
      ),
      links: (rawWidget.links ?? []).map(
        (l): ResolvedLinkItemConfig => ({
          id: l.id,
          enabled: l.enabled,
          icon: l.icon,
          label: l.label !== undefined ? getLocale(l.label, "") : undefined,
          linkAction: l.linkAction,
          href: l.href,
        }),
      ),
      menu: rawWidget.menu
        ? {
            filesLabel: getLocale(rawWidget.menu.filesLabel),
            filesSendLabel: getLocale(rawWidget.menu.filesSendLabel),
            filesEditLabel: getLocale(rawWidget.menu.filesEditLabel),
            filesAIEnableLabel: getLocale(rawWidget.menu.filesAIEnableLabel),
            filesAIDisableLabel: getLocale(rawWidget.menu.filesAIDisableLabel),
            filesDeleteLabel: getLocale(rawWidget.menu.filesDeleteLabel),
            filesDeleteConfirmLabel: getLocale(
              rawWidget.menu.filesDeleteConfirmLabel,
            ),
            filesAttachHint: getLocale(rawWidget.menu.filesAttachHint),
            filesUploadSuccess: getLocale(rawWidget.menu.filesUploadSuccess),
            filesDeleteSuccess: getLocale(rawWidget.menu.filesDeleteSuccess),
            filesRenameSuccess: getLocale(rawWidget.menu.filesRenameSuccess),
            filesPasteHint: getLocale(rawWidget.menu.filesPasteHint),
            messagesLabel: getLocale(rawWidget.menu.messagesLabel),
            messagesAttachHint: getLocale(rawWidget.menu.messagesAttachHint),
            notesLabel: getLocale(rawWidget.menu.notesLabel),
            notesPinHint: getLocale(rawWidget.menu.notesPinHint),
            notesAIEnableLabel: getLocale(rawWidget.menu.notesAIEnableLabel),
            notesAIDisableLabel: getLocale(rawWidget.menu.notesAIDisableLabel),
            aiLabel: getLocale(rawWidget.menu.aiLabel),
            panelLabel: getLocale(rawWidget.menu.panelLabel),
            disclaimerText: getLocale(rawWidget.menu.disclaimerText),
            chatDisclaimerText: getLocale(rawWidget.menu.chatDisclaimerText),
            chatEmptyHelp: getLocale(rawWidget.menu.chatEmptyHelp),
            chatEmptyExamples: getLocaleArray(rawWidget.menu.chatEmptyExamples),
            chatPlaceholder: getLocale(rawWidget.menu.chatPlaceholder),
            chatSend: getLocale(rawWidget.menu.chatSend),
            chatBack: getLocale(rawWidget.menu.chatBack),
            chatNewConversation: getLocale(rawWidget.menu.chatNewConversation),
            chatNewConversationStarted: getLocale(
              rawWidget.menu.chatNewConversationStarted,
            ),
            chatCopyTooltip: getLocale(rawWidget.menu.chatCopyTooltip),
            chatCopied: getLocale(rawWidget.menu.chatCopied),
            editTooltip: getLocale(rawWidget.menu.editTooltip),
            deleteTooltip: getLocale(rawWidget.menu.deleteTooltip),
            cancelLabel: getLocale(rawWidget.menu.cancelLabel),
            saveLabel: getLocale(rawWidget.menu.saveLabel),
            savingLabel: getLocale(rawWidget.menu.savingLabel),
            messagesNewTooltip: getLocale(rawWidget.menu.messagesNewTooltip),
            messagesEmpty: getLocale(rawWidget.menu.messagesEmpty),
            messagesPlaceholder: getLocale(rawWidget.menu.messagesPlaceholder),
            notesEmpty: getLocale(rawWidget.menu.notesEmpty),
            noteEmptyLabel: getLocale(rawWidget.menu.noteEmptyLabel),
          }
        : undefined,
    },
    indicators: {
      color1: defaultThemeColors.buttonColor1,
      color2: defaultThemeColors.buttonColor2,
      topBorder: {
        enabled: rawTopBorder.enabled,
        height:
          rawTopBorder.height ??
          styles.indicators.topBorderHeight ??
          styles.indicators.bottomBorderHeight ??
          "3px",
        duration:
          rawTopBorder.duration ??
          styles.indicators.topBorderDuration ??
          styles.indicators.bottomBorderDuration ??
          "2.5s",
      },
      bottomBorder: (() => {
        const rawBB = raw.indicators?.bottomBorder ?? {};
        return {
          enabled: rawBB.enabled,
          height: rawBB.height ?? styles.indicators.bottomBorderHeight,
          duration: rawBB.duration ?? styles.indicators.bottomBorderDuration,
          loadingDuration:
            rawBB.loadingDuration ??
            styles.indicators.bottomBorderLoadingDuration,
        };
      })(),
    },
    themes: styles.themes,
    sitesFallback: {
      fileAttach: rawFallback.fileAttach,
    } as ResolvedSitesFallbackConfig,
  };
}

export function loadConfig(onLoaded?: () => void): void {
  chrome.storage.local
    .get<{
      "vigogh-settings"?: ExtensionSettings;
      "vigogh-locales"?: ExtensionLocales;
      "vigogh-styles"?: ExtensionStyles;
      "vigogh-tool-preferences"?: UserToolPreferences;
      "vigogh-ai-button-appearance"?: AiButtonAppearance;
      "vigogh-ai-button-enabled"?: boolean;
    }>([
      "vigogh-settings",
      "vigogh-locales",
      "vigogh-styles",
      "vigogh-tool-preferences",
      "vigogh-ai-button-appearance",
      "vigogh-ai-button-enabled",
    ])
    .then((stored) => {
      const raw = stored["vigogh-settings"];
      const styles = stored["vigogh-styles"];
      if (!raw || !styles) return;
      setStyles(styles);

      const locales = stored["vigogh-locales"];
      const merged = locales ? mergeLocales(raw, locales) : raw;
      const config = resolveConfig(merged, styles);

      if (locales?.themes) {
        config.themes = config.themes.map((t) => ({
          ...t,
          labels: locales.themes[t.name]?.label as
            | { us: string; br: string }
            | undefined,
        }));
      }

      const appearance = stored["vigogh-ai-button-appearance"] ?? null;
      const schemeColors = appearance
        ? config.themes.find((s) => s.name === appearance.theme)?.colors
        : null;
      const base = config.theme.dark;
      const c1 = schemeColors?.buttonColor1 ?? base.buttonColor1;
      const c2 = schemeColors?.buttonColor2 ?? base.buttonColor2;
      config.indicators.color1 = c1;
      config.indicators.color2 = c2;
      config.overlay.color = schemeColors?.overlayColor ?? base.overlayColor;
      config.overlay.badgeBackground =
        schemeColors?.overlayBadgeBackground ?? base.overlayBadgeBackground;

      const userPrefs = stored["vigogh-tool-preferences"];
      if (userPrefs) {
        config.widget.tools = config.widget.tools.map((tool) => {
          const override = userPrefs.toolsEnabled[tool.id];
          return override === undefined ? tool : { ...tool, enabled: override };
        });
        config.widget.transforms = config.widget.transforms.map((t) => {
          const override = userPrefs.transformsEnabled[t.id];
          return override === undefined ? t : { ...t, enabled: override };
        });
        config.indicators.topBorder.enabled =
          (userPrefs.indicatorsEnabled.topBorder ?? true) &&
          config.indicators.topBorder.enabled;
        config.indicators.bottomBorder.enabled =
          (userPrefs.indicatorsEnabled.bottomBorder ?? true) &&
          config.indicators.bottomBorder.enabled;
      }

      extensionStore.setState({
        userToolsEnabled: userPrefs?.toolsEnabled ?? {},
      });

      const hostname = window.location.hostname;
      const matchedSite = matchSite(hostname, config.sites);

      const widgetEnabled = true;
      const aiButtonEnabled = stored["vigogh-ai-button-enabled"] ?? true;

      extensionStore.setState({
        config,
        widgetEnabled,
        widgetVisible: widgetEnabled,
        aiButtonEnabled,
        panelVisible: !aiButtonEnabled,
      });

      if (config.behavior.enabled) {
        generalStrategy = new GeneralInputStrategy();

        if (matchedSite) {
          strategy = new SiteEngine(matchedSite);
          extensionStore.setState({ siteConfig: matchedSite });
        }

        const { sessionAutocompleteEnabled } = extensionStore.getState();
        extensionStore.setState({
          disabled: !sessionAutocompleteEnabled,
          sessionAutocompleteEnabled,
        });
        tryAttachToActiveElement();
      } else {
        extensionStore.setState({
          sessionAutocompleteEnabled: false,
          disabled: true,
        });
      }
      onLoaded?.();
    })
    .catch(() => {});
}

export function setCurrentEditor(editor: Element | null): void {
  if (!editor) {
    activeStrategy = null;
    extensionStore.setState((s) => ({
      currentEditor: null,
      editorFocused: false,
      caretCoordinates: null,
      overlayResetVersion: s.overlayResetVersion + 1,
    }));
    return;
  }

  const prevEditor = extensionStore.getState().currentEditor;
  if (prevEditor === editor) return;

  activeStrategy = resolveStrategyForElement(editor);

  extensionStore.setState({ currentEditor: editor, editorFocused: true });
}

export function setEditorFocused(focused: boolean): void {
  if (extensionStore.getState().editorFocused === focused) return;
  extensionStore.setState({ editorFocused: focused });
}

export function setPanelVisible(visible: boolean): void {
  extensionStore.setState({ panelVisible: visible });
}

export function activatePanel(): void {
  const { panelVisible, aiButtonEnabled } = extensionStore.getState();
  if (!aiButtonEnabled && !panelVisible) {
    extensionStore.setState({ panelVisible: true });
  }
}

export function tryAttachToActiveElement(): void {
  const active = document.activeElement;
  if (!active || active === document.body) return;

  const { siteConfig } = extensionStore.getState();
  const siteSelector = siteConfig?.editorSelector;
  if (siteSelector) {
    const editor = active.matches(siteSelector)
      ? active
      : active.closest(siteSelector);
    if (editor) {
      setCurrentEditor(editor);
      return;
    }
  }

  const editor = active.matches(DEFAULT_GENERAL_SELECTOR)
    ? active
    : active.closest(DEFAULT_GENERAL_SELECTOR);
  if (editor) setCurrentEditor(editor);
}

export function getEditorSelector(): string | null {
  return extensionStore.getState().siteConfig?.editorSelector ?? null;
}

function applyAppearance(appearance: AiButtonAppearance | null): void {
  const { config } = extensionStore.getState();
  if (!config) return;

  const schemeColors = appearance
    ? config.themes.find((s) => s.name === appearance.theme)?.colors
    : null;
  const base = config.theme.dark;
  const c1 = schemeColors?.buttonColor1 ?? base.buttonColor1;
  const c2 = schemeColors?.buttonColor2 ?? base.buttonColor2;

  const updatedConfig: ResolvedExtensionSettings = {
    ...config,
    indicators: {
      ...config.indicators,
      color1: c1,
      color2: c2,
    },
    overlay: {
      ...config.overlay,
      color: schemeColors?.overlayColor ?? base.overlayColor,
      badgeBackground:
        schemeColors?.overlayBadgeBackground ?? base.overlayBadgeBackground,
    },
  };
  extensionStore.setState({ config: updatedConfig });

  if (document.getElementById("vigogh-top-indicator")) {
    showIndicator("top-border", updatedConfig);
  }

  if (document.getElementById("vigogh-bottom-indicator")) {
    showIndicator("bottom-border", updatedConfig);
  }
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;

  if ("vigogh-region" in changes) {
    loadConfig();
  }

  if ("vigogh-ai-button-appearance" in changes) {
    const appearance =
      (changes["vigogh-ai-button-appearance"]?.newValue as
        | AiButtonAppearance
        | undefined) ?? null;
    applyAppearance(appearance);
  }

  if ("vigogh-ai-button-enabled" in changes) {
    const enabled =
      (changes["vigogh-ai-button-enabled"]?.newValue as boolean | undefined) ??
      true;
    extensionStore.setState((s) => ({
      aiButtonEnabled: enabled,
      panelVisible: enabled ? s.panelVisible : true,
    }));
  }

  if (!changes["vigogh-tool-preferences"]) return;
  const prefs = (changes["vigogh-tool-preferences"].newValue as
    | UserToolPreferences
    | undefined) ?? {
    toolsEnabled: {},
    transformsEnabled: {},
    indicatorsEnabled: { topBorder: true, bottomBorder: true },
    menuTools: {},
  };
  const current = extensionStore.getState().config;
  if (!current) return;
  const updatedTools = current.widget.tools.map((tool) => {
    const override = prefs.toolsEnabled[tool.id];
    return override === undefined ? tool : { ...tool, enabled: override };
  });
  const updatedTransforms = current.widget.transforms.map((t) => {
    const override = prefs.transformsEnabled[t.id];
    return override === undefined ? t : { ...t, enabled: override };
  });
  extensionStore.setState({
    config: {
      ...current,
      widget: {
        ...current.widget,
        tools: updatedTools,
        transforms: updatedTransforms,
      },
      indicators: {
        ...current.indicators,
        topBorder: {
          ...current.indicators.topBorder,
          enabled:
            (prefs.indicatorsEnabled.topBorder ?? true) &&
            current.indicators.topBorder.enabled,
        },
        bottomBorder: {
          ...current.indicators.bottomBorder,
          enabled:
            (prefs.indicatorsEnabled.bottomBorder ?? true) &&
            current.indicators.bottomBorder.enabled,
        },
      },
    },
    userToolsEnabled: prefs.toolsEnabled,
  });
});
