import { createStore } from "zustand/vanilla";
import { BASE_URL } from "@/libs/constants";
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
import { GeneralInputStrategy } from "@/utils/general-strategy";
import { showIndicator } from "@/utils/indicators";
import { matchSite } from "@/utils/site-match";

const editorChangeListeners: Array<() => void> = [];

export function onEditorChange(listener: () => void): void {
  editorChangeListeners.push(listener);
}

interface ExtensionState {
  config: ResolvedExtensionSettings | null;
  siteConfig: SiteConfig | null;
  currentEditor: Element | null;
  aiMenuEnabled: boolean;
  aiMenuVisible: boolean;
  aiButtonEnabled: boolean;
  editorFocused: boolean;
  caretCoordinates: CaretCoordinates | null;
  disabled: boolean;
  sessionAutocompleteEnabled: boolean;
  overlayResetVersion: number;
  pageIndicatorActive: boolean;
  userToolsEnabled: Record<string, boolean>;
}

export const extensionStore = createStore<ExtensionState>()(() => ({
  config: null,
  siteConfig: null,
  currentEditor: null,
  aiMenuEnabled: false,
  aiMenuVisible: false,
  aiButtonEnabled: true,
  editorFocused: false,
  caretCoordinates: null,
  disabled: true,
  sessionAutocompleteEnabled: false,
  overlayResetVersion: 0,
  pageIndicatorActive: false,
  userToolsEnabled: {},
}));

export function setPageIndicatorActive(active: boolean): void {
  extensionStore.setState({ pageIndicatorActive: active });
}

let strategy: SiteStrategy | null = null;
let generalStrategy: GeneralInputStrategy | null = null;
let activeStrategy: SiteStrategy | null = null;
let cleanupObserver: (() => void) | null = null;

export function getActiveStrategy(): SiteStrategy | null {
  return activeStrategy;
}

export function resolveEditorWithStrategy(): {
  editor: HTMLElement | null;
  strategy: SiteStrategy | null;
} {
  const { currentEditor } = extensionStore.getState();
  if (currentEditor) {
    return { editor: currentEditor as HTMLElement, strategy: activeStrategy };
  }
  const siteSelector = strategy?.getEditorSelector();
  if (siteSelector) {
    const editor = document.querySelector(siteSelector) as HTMLElement | null;
    if (editor) return { editor, strategy };
  }
  const generalSelector = generalStrategy?.getEditorSelector();
  if (generalSelector) {
    const editor = document.querySelector(
      generalSelector,
    ) as HTMLElement | null;
    if (editor) return { editor, strategy: generalStrategy };
  }
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
  const tools = (config.aiMenu?.tools ?? []).map((tool) => {
    const tl = locales.aiMenu.tools[tool.id];
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
    aiMenu: {
      ...config.aiMenu,
      transformsNoSelectionTooltip: locales.aiMenu.transformsNoSelectionTooltip,
      tools,
      transforms: (config.aiMenu?.transforms ?? []).map((t) => ({
        ...t,
        label: locales.aiMenu.transforms[t.id]?.label ?? t.label,
      })),
      links: (config.aiMenu?.links ?? []).map((l) => ({
        ...l,
        label: locales.aiMenu.links[l.id]?.label ?? l.label,
      })),
      vigoghMenu: locales.aiMenu.vigoghMenu,
    },
  };
}

export function resolveConfig(
  raw: ExtensionSettings,
  styles: ExtensionStyles,
): ResolvedExtensionSettings {
  const rawAiMenu = raw.aiMenu ?? {};
  const rawBorder = raw.indicators?.page?.border ?? {};
  const rawLoadingAnim = rawAiMenu.loadingAnimation ?? {};
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
      minSelectionLength: raw.behavior.minSelectionLength,
      captureDelayMs: raw.behavior.captureDelayMs,
      pageIndicatorMaxDurationMs: raw.behavior.pageIndicatorMaxDurationMs,
      filesAttachDragSuppressMs: raw.behavior.filesAttachDragSuppressMs,
      filesAttachSuccessSuppressMs: raw.behavior.filesAttachSuccessSuppressMs,
      filesPasteHintDismissMs: raw.behavior.filesPasteHintDismissMs,
      filesUploadPollAttempts: raw.behavior.filesUploadPollAttempts,
      filesUploadPollIntervalMs: raw.behavior.filesUploadPollIntervalMs,
      windowDragMarginPx: raw.behavior.windowDragMarginPx,
      mainContentLimit: raw.behavior.mainContentLimit,
      maxLinks: raw.behavior.maxLinks,
    },
    overlay: {
      color: raw.overlay.color,
      opacity: raw.overlay.opacity,
      badgeBackground: raw.overlay.badgeBackground,
      badgeFontSize: raw.overlay.badgeFontSize,
      maxDisplayLength: raw.overlay.maxDisplayLength,
      badgeText: getLocale(raw.overlay.badgeText),
      acceptLabel: getLocale(raw.overlay.acceptLabel),
      cancelLabel: getLocale(raw.overlay.cancelLabel),
      autocompletePageTitle: getLocale(raw.overlay.autocompletePageTitle),
      acceptHint: getLocale(raw.overlay.acceptHint),
      badgePaddingX: raw.overlay.badgePaddingX ?? 8,
      badgeGap: raw.overlay.badgeGap ?? 4,
      badgeSafetyPad: raw.overlay.badgeSafetyPad ?? 4,
    },
    aiMenu: {
      enabled: rawAiMenu.enabled,
      bottom: rawAiMenu.bottom ?? styles.aiMenu.bottom,
      right: rawAiMenu.right ?? styles.aiMenu.right,
      width: rawAiMenu.width,
      height: rawAiMenu.height ?? styles.aiMenu.height,
      iconSize: rawAiMenu.iconSize ?? styles.aiMenu.iconSize,
      iconUrl: chrome.runtime.getURL(rawAiMenu.iconUrl || "white-icon128.png"),
      shineDuration: rawAiMenu.shineDuration ?? styles.aiMenu.shineDuration,
      sweepDuration: rawAiMenu.sweepDuration ?? styles.aiMenu.sweepDuration,
      loadingAnimation: {
        enabled: rawLoadingAnim.enabled,
        duration: rawLoadingAnim.duration ?? styles.aiMenu.loadingDuration,
      },
      borderRadius: rawAiMenu.borderRadius,
      menuBorderRadius:
        rawAiMenu.menuBorderRadius ?? styles.aiMenu.menuBorderRadius,
      menuMinWidth: rawAiMenu.menuMinWidth ?? styles.aiMenu.menuMinWidth,
      menuMaxWidth: rawAiMenu.menuMaxWidth ?? styles.aiMenu.menuMaxWidth,
      appUrl: rawAiMenu.appUrl ?? `${BASE_URL}/app`,
      transformsTooltipDelayMs:
        rawAiMenu.transformsTooltipDelayMs ??
        styles.aiMenu.transformsTooltipDelayMs,
      defaultAdditionalInputMaxLength:
        rawAiMenu.defaultAdditionalInputMaxLength ?? 1000,
      transformsNoSelectionTooltip: getLocale(
        rawAiMenu.transformsNoSelectionTooltip,
      ),
      chat: { maxLength: rawAiMenu.chat!.maxLength },
      quickMessages: { maxLength: rawAiMenu.quickMessages!.maxLength },
      tools: (rawAiMenu.tools ?? []).map((t) => resolveTool(t)),
      transforms: (rawAiMenu.transforms ?? []).map(
        (t): ResolvedTransformItemConfig => ({
          id: t.id,
          enabled: t.enabled,
          icon: t.icon,
          label: t.label !== undefined ? getLocale(t.label, "") : undefined,
          transformAction: t.transformAction,
          autoApply: t.autoApply,
        }),
      ),
      links: (rawAiMenu.links ?? []).map(
        (l): ResolvedLinkItemConfig => ({
          id: l.id,
          enabled: l.enabled,
          icon: l.icon,
          label: l.label !== undefined ? getLocale(l.label, "") : undefined,
          linkAction: l.linkAction,
          href: l.href,
        }),
      ),
      vigoghMenu: rawAiMenu.vigoghMenu
        ? {
            filesLabel: getLocale(rawAiMenu.vigoghMenu.filesLabel),
            filesSendLabel: getLocale(rawAiMenu.vigoghMenu.filesSendLabel),
            filesEditLabel: getLocale(rawAiMenu.vigoghMenu.filesEditLabel),
            filesAIEnableLabel: getLocale(
              rawAiMenu.vigoghMenu.filesAIEnableLabel,
            ),
            filesAIDisableLabel: getLocale(
              rawAiMenu.vigoghMenu.filesAIDisableLabel,
            ),
            filesDeleteLabel: getLocale(rawAiMenu.vigoghMenu.filesDeleteLabel),
            filesDeleteConfirmLabel: getLocale(
              rawAiMenu.vigoghMenu.filesDeleteConfirmLabel,
            ),
            filesAttachHint: getLocale(rawAiMenu.vigoghMenu.filesAttachHint),
            filesAttachUnavailable: getLocale(
              rawAiMenu.vigoghMenu.filesAttachUnavailable,
            ),
            filesUploadLoading: getLocale(
              rawAiMenu.vigoghMenu.filesUploadLoading,
            ),
            filesUploadSuccess: getLocale(
              rawAiMenu.vigoghMenu.filesUploadSuccess,
            ),
            filesDeleteSuccess: getLocale(
              rawAiMenu.vigoghMenu.filesDeleteSuccess,
            ),
            filesRenameSuccess: getLocale(
              rawAiMenu.vigoghMenu.filesRenameSuccess,
            ),
            filesAttachLoading: getLocale(
              rawAiMenu.vigoghMenu.filesAttachLoading,
            ),
            filesAttachSuccess: getLocale(
              rawAiMenu.vigoghMenu.filesAttachSuccess,
            ),
            filesAttachFailed: getLocale(
              rawAiMenu.vigoghMenu.filesAttachFailed,
            ),
            filesPasteHint: getLocale(rawAiMenu.vigoghMenu.filesPasteHint),
            messagesLabel: getLocale(rawAiMenu.vigoghMenu.messagesLabel),
            messagesAttachHint: getLocale(
              rawAiMenu.vigoghMenu.messagesAttachHint,
            ),
            notesLabel: getLocale(rawAiMenu.vigoghMenu.notesLabel),
            notesPinHint: getLocale(rawAiMenu.vigoghMenu.notesPinHint),
            notesAIEnableLabel: getLocale(
              rawAiMenu.vigoghMenu.notesAIEnableLabel,
            ),
            notesAIDisableLabel: getLocale(
              rawAiMenu.vigoghMenu.notesAIDisableLabel,
            ),
            aiLabel: getLocale(rawAiMenu.vigoghMenu.aiLabel),
            panelLabel: getLocale(rawAiMenu.vigoghMenu.panelLabel),
            disclaimerText: getLocale(rawAiMenu.vigoghMenu.disclaimerText),
            chatDisclaimerText: getLocale(
              rawAiMenu.vigoghMenu.chatDisclaimerText,
            ),
            chatEmptyHelp: getLocale(rawAiMenu.vigoghMenu.chatEmptyHelp),
            chatEmptyExamples: getLocaleArray(
              rawAiMenu.vigoghMenu.chatEmptyExamples,
            ),
            chatPlaceholder: getLocale(rawAiMenu.vigoghMenu.chatPlaceholder),
            chatSend: getLocale(rawAiMenu.vigoghMenu.chatSend),
            chatBack: getLocale(rawAiMenu.vigoghMenu.chatBack),
            chatNewConversation: getLocale(
              rawAiMenu.vigoghMenu.chatNewConversation,
            ),
            chatNewConversationStarted: getLocale(
              rawAiMenu.vigoghMenu.chatNewConversationStarted,
            ),
            chatCopyTooltip: getLocale(rawAiMenu.vigoghMenu.chatCopyTooltip),
            chatCopied: getLocale(rawAiMenu.vigoghMenu.chatCopied),
            editTooltip: getLocale(rawAiMenu.vigoghMenu.editTooltip),
            deleteTooltip: getLocale(rawAiMenu.vigoghMenu.deleteTooltip),
            cancelLabel: getLocale(rawAiMenu.vigoghMenu.cancelLabel),
            saveLabel: getLocale(rawAiMenu.vigoghMenu.saveLabel),
            savingLabel: getLocale(rawAiMenu.vigoghMenu.savingLabel),
            messagesNewTooltip: getLocale(
              rawAiMenu.vigoghMenu.messagesNewTooltip,
            ),
            messagesEmpty: getLocale(rawAiMenu.vigoghMenu.messagesEmpty),
            messagesPlaceholder: getLocale(
              rawAiMenu.vigoghMenu.messagesPlaceholder,
            ),
            notesEmpty: getLocale(rawAiMenu.vigoghMenu.notesEmpty),
            noteEmptyLabel: getLocale(rawAiMenu.vigoghMenu.noteEmptyLabel),
          }
        : undefined,
    },
    indicators: {
      page: {
        border: {
          enabled: rawBorder.enabled,
          color1: defaultThemeColors.buttonColor1,
          color2: defaultThemeColors.buttonColor2,
          duration: rawBorder.duration ?? styles.indicators.pageBorderDuration,
        },
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
      editorSelector: rawFallback.editorSelector,
      editorType: rawFallback.editorType,
      fileAttach: rawFallback.fileAttach,
    } as ResolvedSitesFallbackConfig,
  };
}

export function loadConfig(): void {
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
      config.indicators.page.border.color1 = c1;
      config.indicators.page.border.color2 = c2;
      config.overlay.color = schemeColors?.overlayColor ?? base.overlayColor;
      config.overlay.badgeBackground =
        schemeColors?.overlayBadgeBackground ?? base.overlayBadgeBackground;

      const userPrefs = stored["vigogh-tool-preferences"];
      if (userPrefs) {
        config.aiMenu.tools = config.aiMenu.tools.map((tool) => {
          const override = userPrefs.toolsEnabled[tool.id];
          return override === undefined ? tool : { ...tool, enabled: override };
        });
        config.aiMenu.transforms = config.aiMenu.transforms.map((t) => {
          const override = userPrefs.transformsEnabled[t.id];
          return override === undefined ? t : { ...t, enabled: override };
        });
        config.indicators.page.border.enabled =
          userPrefs.indicatorsEnabled.page &&
          config.indicators.page.border.enabled;
        config.indicators.bottomBorder.enabled =
          userPrefs.indicatorsEnabled.bottomBorder &&
          config.indicators.bottomBorder.enabled;
      }

      extensionStore.setState({
        userToolsEnabled: userPrefs?.toolsEnabled ?? {},
      });

      const hostname = window.location.hostname;
      const matchedSite = matchSite(hostname, config.sites);

      const aiMenuEnabled = true;
      const aiButtonEnabled = stored["vigogh-ai-button-enabled"] ?? true;

      extensionStore.setState({
        config,
        aiMenuEnabled,
        aiMenuVisible: aiMenuEnabled,
        aiButtonEnabled,
      });

      if (config.behavior.enabled) {
        generalStrategy = new GeneralInputStrategy(config.sitesFallback);

        if (matchedSite) {
          strategy = new SiteEngine(matchedSite);
          extensionStore.setState({ siteConfig: matchedSite });
        }

        const { sessionAutocompleteEnabled } = extensionStore.getState();
        extensionStore.setState({ disabled: !sessionAutocompleteEnabled });
        tryAttachToActiveElement();
      } else {
        extensionStore.setState({
          sessionAutocompleteEnabled: false,
          disabled: true,
        });
      }
    })
    .catch(() => {});
}

export function setCurrentEditor(editor: Element | null): void {
  if (cleanupObserver) {
    cleanupObserver();
    cleanupObserver = null;
  }

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

  const siteSelector = strategy?.getEditorSelector();
  const usesSiteStrategy =
    !!siteSelector &&
    (editor.matches(siteSelector) || !!editor.closest(siteSelector));
  activeStrategy = usesSiteStrategy ? strategy : generalStrategy;

  extensionStore.setState({ currentEditor: editor, editorFocused: true });

  cleanupObserver =
    activeStrategy?.observeEditorChanges(() => {
      extensionStore.setState((s) => ({
        overlayResetVersion: s.overlayResetVersion + 1,
      }));
    }) ?? null;

  for (const listener of editorChangeListeners) listener();
}

export function setEditorFocused(focused: boolean): void {
  if (extensionStore.getState().editorFocused === focused) return;
  extensionStore.setState({ editorFocused: focused });
}

export function tryAttachToActiveElement(): void {
  const active = document.activeElement;
  if (!active || active === document.body) return;

  const siteSelector = strategy?.getEditorSelector();
  if (siteSelector) {
    const editor = active.matches(siteSelector)
      ? active
      : active.closest(siteSelector);
    if (editor) {
      setCurrentEditor(editor);
      return;
    }
  }

  const generalSelector = generalStrategy?.getEditorSelector();
  if (generalSelector) {
    const editor = active.matches(generalSelector)
      ? active
      : active.closest(generalSelector);
    if (editor) setCurrentEditor(editor);
  }
}

export function getEditorSelector(): string | null {
  return strategy?.getEditorSelector() ?? null;
}

export function getGeneralInputSelector(): string | null {
  return generalStrategy?.getEditorSelector() ?? null;
}

function applyAppearance(appearance: AiButtonAppearance | null): void {
  const { config, pageIndicatorActive } = extensionStore.getState();
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
      page: {
        ...config.indicators.page,
        border: { ...config.indicators.page.border, color1: c1, color2: c2 },
      },
    },
    overlay: {
      ...config.overlay,
      color: schemeColors?.overlayColor ?? base.overlayColor,
      badgeBackground:
        schemeColors?.overlayBadgeBackground ?? base.overlayBadgeBackground,
    },
  };
  extensionStore.setState({ config: updatedConfig });

  if (pageIndicatorActive) {
    showIndicator("page", updatedConfig);
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
    extensionStore.setState({ aiButtonEnabled: enabled });
  }

  if (!changes["vigogh-tool-preferences"]) return;
  const prefs = (changes["vigogh-tool-preferences"].newValue as
    | UserToolPreferences
    | undefined) ?? {
    toolsEnabled: {},
    transformsEnabled: {},
    indicatorsEnabled: { page: true, bottomBorder: true },
    aiMenuTools: {},
  };
  const current = extensionStore.getState().config;
  if (!current) return;
  const updatedTools = current.aiMenu.tools.map((tool) => {
    const override = prefs.toolsEnabled[tool.id];
    return override === undefined ? tool : { ...tool, enabled: override };
  });
  const updatedTransforms = current.aiMenu.transforms.map((t) => {
    const override = prefs.transformsEnabled[t.id];
    return override === undefined ? t : { ...t, enabled: override };
  });
  extensionStore.setState({
    config: {
      ...current,
      aiMenu: {
        ...current.aiMenu,
        tools: updatedTools,
        transforms: updatedTransforms,
      },
      indicators: {
        ...current.indicators,
        page: {
          ...current.indicators.page,
          border: {
            ...current.indicators.page.border,
            enabled:
              prefs.indicatorsEnabled.page &&
              current.indicators.page.border.enabled,
          },
        },
        bottomBorder: {
          ...current.indicators.bottomBorder,
          enabled:
            prefs.indicatorsEnabled.bottomBorder &&
            current.indicators.bottomBorder.enabled,
        },
      },
    },
    userToolsEnabled: prefs.toolsEnabled,
  });
});
