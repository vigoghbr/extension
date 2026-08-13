export interface CapturePageMessage {
  action: "capture_page";
  silent?: boolean;
}

export interface PrepareContextRequestMessage {
  action: "prepare_context_request";
  pageURL?: string;
  pageContent?: string;
  pageMetadata?: string;
  pageForms?: string;
  pageScreenshot?: string;
}

export interface AutocompleteRequestMessage {
  action: "autocomplete_request";
  text: string;
}

export interface AutocompleteAcceptMessage {
  action: "autocomplete_accept";
  toolUsageId: string;
}

export interface SetAuthTokenMessage {
  action: "set_auth_token";
  token: string;
  refreshToken?: string;
  customToken?: string;
}

export interface ClearAuthTokenMessage {
  action: "clear_auth_token";
}

export interface SetSessionMessage {
  action: "set_session";
  sessionId: string;
  expiresAt: string;
}

export interface AuthCheckMessage {
  action: "auth_check";
}

export interface ReloadActiveTabMessage {
  action: "reload_active_tab";
}

export interface TransformsRequestMessage {
  action: "transforms_request";
  text: string;
  transformAction: string;
}

export interface AnswersRequestMessage {
  action: "answers_request";
  text?: string;
  apiPath?: string;
}

export interface TriggerToolMessage {
  action: "trigger_tool";
  toolId: string;
}

export interface SidepanelTransformsRequestMessage {
  action: "sidepanel_transforms_request";
  transformAction: string;
}

export interface CheckSelectionStateMessage {
  action: "check_selection_state";
}

export interface SetFeatureFlagsMessage {
  action: "set_feature_flags";
  featureFlags: string[];
}

export interface UserToolPreferences {
  toolsEnabled: Record<string, boolean>;
  transformsEnabled: Record<string, boolean>;
  indicatorsEnabled: { topBorder: boolean; bottomBorder: boolean };
  menuTools: Record<string, boolean>;
}

export interface SetToolPreferencesMessage {
  action: "set_tool_preferences";
  preferences: UserToolPreferences;
}

export interface SetAiButtonEnabledMessage {
  action: "set_ai_button_enabled";
  enabled: boolean;
}

export type IndicatorType = "top-border" | "bottom-border";

export interface ThemeColorSet {
  buttonColor1: string;
  buttonColor2: string;
  overlayColor: string;
  overlayBadgeBackground: string;
  buttonShadow: string;
  menuBackground: string;
  menuBorderColor: string;
  itemSecondaryHoverBackground: string;
  toggleEnabledBackground: string;
  toggleEnabledBorder: string;
  toggleEnabledColor: string;
  toggleDisabledBackground: string;
  toggleDisabledBorder: string;
  toggleDisabledColor: string;
  loadingColors: [string, string, string];
  cssVars: Record<string, string>;
  containerShadow: string;
  closeButtonColor: string;
  dividerColor: string;
  textColor: string;
  iconVariant: "white" | "colored";
  accentActiveBackground: string;
}

export interface ThemeConfig {
  dark: ThemeColorSet;
}

export interface IndicatorEventMessage {
  action: "indicator_event";
  indicator: IndicatorType;
  show: boolean;
}

export interface ApiRequestMessage {
  action: "api_request";
  payload: {
    method: "get" | "post" | "put" | "patch" | "delete";
    path: string;
    body?: unknown;
    headers?: Record<string, string>;
  };
}

export interface SeriousErrorPayload {
  status: number;
  isAuthError: boolean;
}

export interface SeriousErrorBroadcastMessage {
  action: "serious_error_broadcast";
  payload: SeriousErrorPayload;
}

export interface SeriousErrorToastMessage {
  action: "serious_error_toast";
  payload: SeriousErrorPayload;
}

export type DebugLogLevel = "info" | "debug" | "warn" | "error";
export type DebugLogSource = "background" | "sidepanel" | "content";

export interface DebugLogEntry {
  id: string;
  source: DebugLogSource;
  level: DebugLogLevel;
  prefix: string;
  data?: string;
  timestamp: number;
}

export interface DebugLogBroadcastMessage {
  action: "debug_log_broadcast";
  entry: DebugLogEntry;
}

export type ExtensionMessage =
  | CapturePageMessage
  | PrepareContextRequestMessage
  | AutocompleteRequestMessage
  | AutocompleteAcceptMessage
  | SetAuthTokenMessage
  | ClearAuthTokenMessage
  | SetSessionMessage
  | AuthCheckMessage
  | ReloadActiveTabMessage
  | TransformsRequestMessage
  | AnswersRequestMessage
  | TriggerToolMessage
  | SidepanelTransformsRequestMessage
  | IndicatorEventMessage
  | CheckSelectionStateMessage
  | SetFeatureFlagsMessage
  | SetToolPreferencesMessage
  | SetAiButtonEnabledMessage
  | ChatCreateMessage
  | ChatSendMessage
  | FilesFetchMessage
  | FilesUploadMessage
  | FilesRenameMessage
  | FilesDeleteMessage
  | FilesFetchBlobMessage
  | FilesDownloadMessage
  | ApiRequestMessage
  | SeriousErrorBroadcastMessage
  | SeriousErrorToastMessage
  | DebugLogBroadcastMessage;

export interface ChatCreateMessage {
  action: "chat_create";
}

export interface ChatSendMessage {
  action: "chat_send";
  chatId: string;
  message: string;
}

export interface FilesFetchMessage {
  action: "files_fetch";
}

export interface FilesUploadMessage {
  action: "files_upload";
  name: string;
  mimeType: string;
  base64: string;
}

export interface FilesRenameMessage {
  action: "files_rename";
  fileId: string;
  name: string;
}

export interface FilesDeleteMessage {
  action: "files_delete";
  fileId: string;
}

export interface FilesFetchBlobMessage {
  action: "files_fetch_blob";
  fileId: string;
  downloadUrl: string;
}

export interface FilesFetchBlobResponse {
  success: boolean;
  base64?: string;
  mimeType?: string;
  error?: string;
  noToken?: boolean;
}

export interface FilesDownloadMessage {
  action: "files_download";
  downloadUrl: string;
}

export interface FilesDownloadResponse {
  success: boolean;
  error?: string;
  noToken?: boolean;
}

export interface FilesRenameResponse {
  success: boolean;
  file?: FileItem;
  noToken?: boolean;
  errorCode?: string;
  error?: string;
}

export interface FilesDeleteResponse {
  success: boolean;
  noToken?: boolean;
  errorCode?: string;
  error?: string;
}

export interface FileItem {
  id: string;
  name: string;
  originalFilename: string;
  category: string;
  source: string;
  mimeType: string;
  sizeBytes: number;
  ingestionStatus: string | null;
  disabledForAI?: boolean;
  createdAt: string;
  updatedAt: string;
  downloadUrl: string;
}

export interface FilesFetchResponse {
  success: boolean;
  files?: FileItem[];
  noToken?: boolean;
  errorCode?: string;
  error?: string;
}

export interface FilesUploadResponse {
  success: boolean;
  file?: FileItem;
  pending?: boolean;
  noToken?: boolean;
  errorCode?: string;
  error?: string;
}

export interface ChatCreateResponse {
  success: boolean;
  chatId?: string;
  noToken?: boolean;
  errorCode?: string;
  error?: string;
}

export interface ChatSendResponse {
  success: boolean;
  response?: string;
  toolUsageId?: string;
  errorCode?: string;
  noToken?: boolean;
  error?: string;
}

export interface ToolResponse {
  success: boolean;
  suggestions?: string[];
  toolUsageId?: string;
  error?: string;
  errorCode?: string;
  noToken?: boolean;
}

export interface AutocompleteResponse {
  success: boolean;
  completion?: string;
  toolUsageId?: string;
  error?: string;
  errorCode?: string;
  reason?: "unauthenticated" | "api_error";
}

export interface ContextPrepareResponse {
  accepted: boolean;
  pageId: string;
  expiresAt: string;
}

export interface IframeReadyMessage {
  type: "VIGOGH_IFRAME_READY";
}

export interface CloseSidepanelPostMessage {
  type: "VIGOGH_CLOSE_SIDEPANEL";
}

export interface PageDataPostMessage {
  type: "VIGOGH_PAGE_DATA";
  data: PageSessionData & {
    applyConfig: { editorSelector: string; editorType: string } | null;
  };
}

export interface CapturePagePostMessage {
  type: "VIGOGH_CAPTURE_PAGE";
}

export interface SetAuthTokenPostMessage {
  type: "VIGOGH_SET_AUTH_TOKEN";
  token: string;
  refreshToken?: string;
  customToken?: string;
}

export interface ClearAuthTokenPostMessage {
  type: "VIGOGH_CLEAR_AUTH_TOKEN";
}

export interface SetSessionTokenPostMessage {
  type: "VIGOGH_SET_SESSION_TOKEN";
  sessionId: string;
  expiresAt: string;
}

export interface SidepanelTextTransformPostMessage {
  type: "VIGOGH_TEXT_TRANSFORM";
  action: string;
}

export interface SetFeatureFlagsPostMessage {
  type: "VIGOGH_SET_FEATURE_FLAGS";
  featureFlags: string[];
}

export interface CheckSelectionPostMessage {
  type: "VIGOGH_CHECK_SELECTION";
}

export interface IframeIndicatorEventPostMessage {
  type: "VIGOGH_INDICATOR_EVENT";
  indicator: IndicatorType;
  show: boolean;
}

export interface SetToolPreferencesPostMessage {
  type: "VIGOGH_SET_TOOL_PREFERENCES";
  preferences: UserToolPreferences;
}

export interface GetToolPreferencesPostMessage {
  type: "VIGOGH_GET_TOOL_PREFERENCES";
}

export interface DebugLogPostMessage {
  type: "VIGOGH_DEBUG_LOG";
  level: DebugLogLevel;
  prefix: string;
  data?: Record<string, unknown>;
}

export type LocaleString = string | { us?: string; br?: string };

export interface ThemeDefinition {
  name: string;
  labels?: { us: string; br: string };
  colors: ThemeColorSet;
}

export interface ExtensionStylesWidget {
  pillPadding: number;
  pillGap: number;
  popoverGap: number;
  menuWidth: number;
  circleSize: number;
  bottom: string;
  right: string;
  height: number;
  iconSize: number;
  shineDuration: string;
  sweepDuration: string;
  loadingDuration: string;
  menuBorderRadius: string;
  menuMinWidth: string;
  menuMaxWidth: string;
  transformsTooltipDelayMs: number;
  baseCircleSize: number;
  baseFontSize: number;
  baseIconSize: number;
  basePaddingV: number;
  basePaddingH: number;
  logoHeight: number;
  menuWidthMin: number;
  pillBorderRadius: string;
  circleIconSize: number;
  circleOverlay: string;
  circleClosedScale: number;
  menuClosedScale: number;
  circleTransitionMs: number;
  menuTransitionMs: number;
  logoButtonPadding: string;
  dragThresholdPx: number;
  dragMarginPx: number;
  pillHoverTransitionMs: number;
  pillActiveBorderColor: string;
  panelOrbs: {
    opacityA: number;
    blurA: string;
    durationA: string;
    opacityB: number;
    blurB: string;
    durationB: string;
  };
}

export interface ExtensionStylesIndicators {
  topBorderHeight: string;
  topBorderDuration: string;
  bottomBorderHeight: string;
  bottomBorderDuration: string;
  bottomBorderLoadingDuration: string;
  zIndex: number;
}

export interface ExtensionStylesZLayers {
  default: number;
  focused: number;
  hovered: number;
}

export interface ExtensionStylesWindow {
  handleSize: number;
  borderRadius: string;
  transitionMs: number;
}

export interface ExtensionStylesWindowDims {
  minWidth: number;
  minHeight: number;
  maxWidth?: number;
  maxHeight?: number;
  initialWidth: number;
  initialHeight?: number;
}

export interface ExtensionStylesWindows {
  chat: ExtensionStylesWindowDims;
  aiResultsFull: ExtensionStylesWindowDims;
  aiResultsCompact: ExtensionStylesWindowDims;
  aiDirection: ExtensionStylesWindowDims;
  files: ExtensionStylesWindowDims;
  notes: ExtensionStylesWindowDims;
  messages: ExtensionStylesWindowDims;
  stickyNote: ExtensionStylesWindowDims;
}

export interface ExtensionStylesStickyNote {
  borderRadius: number;
  editorPadding: string;
  editorFontSize: string;
  stackOffsetBottom: number;
  stackOffsetRight: number;
  baseBottom: number;
  baseRight: number;
  handleSize: number;
  headerPadding: string;
  headerGap: number;
  buttonSize: number;
  saveIconSize: number;
  closeIconSize: number;
  boxShadow: string;
  boxShadowUnfocused: string;
  unfocusedOpacity: number;
  placeholderColor: string;
  transitionMs: number;
}

export interface ExtensionStylesFilesPopover {
  badgeBackground: string;
  badgeColor: string;
}

export interface ExtensionStylesNotesPopover {
  activePinBorderColor: string;
}

export interface ExtensionStylesMessagesPopover {
  inputBackground: string;
  cancelButtonBackground: string;
}

export interface ExtensionStylesChatPanel {
  emptyIconSize: number;
  examplesMaxWidth: string;
  messageMaxWidth: string;
  copyIconSize: number;
}

export interface ExtensionStylesShineButton {
  background: string;
  sweepColor: string;
}

export interface ExtensionStyles {
  defaultTheme: string;
  themes: Array<{ name: string; colors: ThemeColorSet }>;
  widget: ExtensionStylesWidget;
  indicators: ExtensionStylesIndicators;
  zLayers: ExtensionStylesZLayers;
  window: ExtensionStylesWindow;
  windows: ExtensionStylesWindows;
  stickyNote: ExtensionStylesStickyNote;
  chatPanel: ExtensionStylesChatPanel;
  shineButton: ExtensionStylesShineButton;
  filesPopover: ExtensionStylesFilesPopover;
  notesPopover: ExtensionStylesNotesPopover;
  messagesPopover: ExtensionStylesMessagesPopover;
}

export interface ExtensionLocales {
  messages: {
    errors?: Record<string, LocaleString>;
    success?: Record<string, LocaleString>;
    info?: Record<string, LocaleString>;
  };
  overlay: {
    acceptLabel?: LocaleString;
    cancelLabel?: LocaleString;
    autocompletePageTitle?: LocaleString;
    acceptHint?: LocaleString;
  };
  widget: {
    transformsNoSelectionTooltip?: LocaleString;
    tools: Record<
      string,
      {
        label?: LocaleString;
        backLabel?: LocaleString;
        placeholder?: LocaleString;
        actionLabel?: LocaleString;
        actionLabelInitial?: LocaleString;
        loadingMessage?: LocaleString;
      }
    >;
    transforms: Record<string, { label?: LocaleString }>;
    links: Record<string, { label?: LocaleString }>;
    menu?: {
      filesLabel?: LocaleString;
      filesSendLabel?: LocaleString;
      filesEditLabel?: LocaleString;
      filesAIEnableLabel?: LocaleString;
      filesAIDisableLabel?: LocaleString;
      filesDeleteLabel?: LocaleString;
      filesDeleteConfirmLabel?: LocaleString;
      filesAttachHint?: LocaleString;
      filesUploadSuccess?: LocaleString;
      filesDeleteSuccess?: LocaleString;
      filesRenameSuccess?: LocaleString;
      filesPasteHint?: LocaleString;
      messagesLabel?: LocaleString;
      messagesAttachHint?: LocaleString;
      notesLabel?: LocaleString;
      notesPinHint?: LocaleString;
      notesAIEnableLabel?: LocaleString;
      notesAIDisableLabel?: LocaleString;
      aiLabel?: LocaleString;
      panelLabel?: LocaleString;
      disclaimerText?: LocaleString;
      chatDisclaimerText?: LocaleString;
      chatEmptyHelp?: LocaleString;
      chatEmptyExamples?: { us?: string[]; br?: string[] } | string[];
      chatPlaceholder?: LocaleString;
      chatSend?: LocaleString;
      chatBack?: LocaleString;
      chatNewConversation?: LocaleString;
      chatNewConversationStarted?: LocaleString;
      chatCopyTooltip?: LocaleString;
      chatCopied?: LocaleString;
      editTooltip?: LocaleString;
      deleteTooltip?: LocaleString;
      cancelLabel?: LocaleString;
      saveLabel?: LocaleString;
      savingLabel?: LocaleString;
      messagesNewTooltip?: LocaleString;
      messagesEmpty?: LocaleString;
      messagesPlaceholder?: LocaleString;
      notesEmpty?: LocaleString;
      noteEmptyLabel?: LocaleString;
    };
  };
  themes: Record<string, { label?: LocaleString }>;
}

export interface AiButtonAppearance {
  theme: string;
  opacityFocused: number;
  opacityUnfocused: number;
}

export interface AiButtonAppearanceGetPostMessage {
  type: "VIGOGH_GET_AI_BUTTON_APPEARANCE";
}

export interface AiButtonAppearanceSetPostMessage {
  type: "VIGOGH_SET_AI_BUTTON_APPEARANCE";
  appearance: AiButtonAppearance | null;
}

export interface SetRegionPostMessage {
  type: "VIGOGH_SET_REGION";
  region: "us" | "br";
}

export interface AiButtonAppearancePostMessage {
  type: "VIGOGH_AI_BUTTON_APPEARANCE";
  appearance: AiButtonAppearance | null;
  themes: ThemeDefinition[];
}

export interface AiButtonEnabledGetPostMessage {
  type: "VIGOGH_GET_AI_BUTTON_ENABLED";
}

export interface AiButtonEnabledSetPostMessage {
  type: "VIGOGH_SET_AI_BUTTON_ENABLED";
  enabled: boolean;
}

export interface AiButtonEnabledPostMessage {
  type: "VIGOGH_AI_BUTTON_ENABLED";
  enabled: boolean;
}

export type IframeToSidepanelPostMessage =
  | IframeReadyMessage
  | CloseSidepanelPostMessage
  | CapturePagePostMessage
  | SetAuthTokenPostMessage
  | ClearAuthTokenPostMessage
  | SetSessionTokenPostMessage
  | SidepanelTextTransformPostMessage
  | IframeIndicatorEventPostMessage
  | CheckSelectionPostMessage
  | SetFeatureFlagsPostMessage
  | SetToolPreferencesPostMessage
  | GetToolPreferencesPostMessage
  | AiButtonAppearanceGetPostMessage
  | AiButtonAppearanceSetPostMessage
  | AiButtonEnabledGetPostMessage
  | AiButtonEnabledSetPostMessage
  | SetRegionPostMessage
  | DebugLogPostMessage;

export interface ExtensionPinnedStatusPostMessage {
  type: "VIGOGH_EXTENSION_PINNED_STATUS";
  isPinned: boolean;
}

export interface SidepanelTextTransformResultPostMessage {
  type: "VIGOGH_TEXT_TRANSFORM_RESULT";
  success: boolean;
  error?: string;
}

export interface SelectionStatePostMessage {
  type: "VIGOGH_SELECTION_STATE";
  hasText: boolean;
}

export interface ToolPreferencesPostMessage {
  type: "VIGOGH_TOOL_PREFERENCES";
  preferences: UserToolPreferences;
}

export interface ExtensionIdPostMessage {
  type: "VIGOGH_EXTENSION_ID";
  id: string;
}

export interface SeriousErrorPostMessage {
  type: "VIGOGH_SERIOUS_ERROR";
  payload: SeriousErrorPayload;
}

export interface NavigatePostMessage {
  type: "VIGOGH_NAVIGATE";
  path: string;
}

export interface CustomTokenPostMessage {
  type: "VIGOGH_CUSTOM_TOKEN";
  token: string;
}

export type SidepanelToIframePostMessage =
  | PageDataPostMessage
  | ExtensionPinnedStatusPostMessage
  | SidepanelTextTransformResultPostMessage
  | SelectionStatePostMessage
  | ToolPreferencesPostMessage
  | ExtensionIdPostMessage
  | AiButtonAppearancePostMessage
  | AiButtonEnabledPostMessage
  | SeriousErrorPostMessage
  | NavigatePostMessage
  | CustomTokenPostMessage;

export interface QuickMessage {
  id: string;
  text: string;
}

export interface Note {
  id: string;
  content: string;
  disabledForAI?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PageSessionData {
  pageURL: string;
  pageContent: string;
  pageMetadata: string;
  pageForms: string;
  pageScreenshot: string;
}

export interface SiteConfig {
  key: string;
  name: string;
  match: string | string[];
  contains: string;
  hostnamePatterns?: string[];
  editorSelector: string;
  editorType: "contenteditable" | "textarea" | "mixed";
  fileAttach?: SiteFileAttachConfig;
}

export type SiteFileAttachStrategy =
  | {
      type: "fileInput";
      imageSelector?: string;
      videoSelector?: string;
      anySelector?: string;
    }
  | { type: "paste" }
  | { type: "clipboard" }
  | { type: "dragDrop"; dropZoneSelector?: string };

export interface SiteFileAttachConfig {
  strategies: SiteFileAttachStrategy[];
}

export interface LinkToolConfig {
  type: "link";
  id: string;
  enabled?: boolean;
  icon?: string;
  label?: LocaleString;
  linkAction: "open_side_panel" | "open_app" | "open_chat";
  href?: string;
}

export type ToolItemConfig =
  | AnswerToolConfig
  | ToggleToolConfig
  | LinkToolConfig;

export type AnswerToolPageType = "options" | "direction";

export interface AnswerToolPageConfig {
  type: AnswerToolPageType;
  backLabel?: LocaleString;
  additionalInput?: {
    enabled?: boolean;
    maxLength?: number;
    placeholder?: LocaleString;
  };
  action?: {
    label?: LocaleString;
    icon?: string;
  };
  loadingMessage?: LocaleString;
}

export interface AnswerToolConfig {
  type: "answer";
  id: string;
  enabled?: boolean;
  icon?: string;
  label?: LocaleString;
  style?: "primary";
  apiPath?: string;
  pages?: AnswerToolPageConfig[];
}

export interface ToggleToolConfig {
  type: "toggle";
  id: string;
  enabled?: boolean;
  icon?: string;
  label?: LocaleString;
  toggleTarget: "autocomplete";
}

export interface TransformItemConfig {
  id: string;
  enabled?: boolean;
  icon?: string;
  label?: LocaleString;
  transformAction: string;
  autoApply?: boolean;
}

export interface LinkItemConfig {
  id: string;
  enabled?: boolean;
  icon?: string;
  label?: LocaleString;
  linkAction?: "open_side_panel" | "open_app";
  href?: string;
}

export interface WidgetConfig {
  enabled?: boolean;
  bottom?: string;
  right?: string;
  width?: number;
  height?: number;
  iconSize?: number;
  iconUrl?: string;
  shineDuration?: string;
  sweepDuration?: string;
  loadingAnimation?: {
    enabled?: boolean;
    duration?: string;
  };
  borderRadius?: string;
  menuBorderRadius?: string;
  menuMinWidth?: string;
  menuMaxWidth?: string;
  appUrl?: string;
  transformsTooltipDelayMs?: number;
  defaultAdditionalInputMaxLength?: number;
  transformsNoSelectionTooltip?: LocaleString;
  chat?: { maxLength: number };
  quickMessages?: { maxLength: number };
  tools?: ToolItemConfig[];
  transforms?: TransformItemConfig[];
  links?: LinkItemConfig[];
  menu?: {
    filesLabel?: LocaleString;
    filesSendLabel?: LocaleString;
    filesEditLabel?: LocaleString;
    filesAIEnableLabel?: LocaleString;
    filesAIDisableLabel?: LocaleString;
    filesDeleteLabel?: LocaleString;
    filesDeleteConfirmLabel?: LocaleString;
    filesAttachHint?: LocaleString;
    filesUploadSuccess?: LocaleString;
    filesDeleteSuccess?: LocaleString;
    filesRenameSuccess?: LocaleString;
    filesPasteHint?: LocaleString;
    messagesLabel?: LocaleString;
    messagesAttachHint?: LocaleString;
    notesLabel?: LocaleString;
    notesPinHint?: LocaleString;
    notesAIEnableLabel?: LocaleString;
    notesAIDisableLabel?: LocaleString;
    aiLabel?: LocaleString;
    panelLabel?: LocaleString;
    disclaimerText?: LocaleString;
    chatDisclaimerText?: LocaleString;
    chatEmptyHelp?: LocaleString;
    chatEmptyExamples?: { us?: string[]; br?: string[] } | string[];
    chatPlaceholder?: LocaleString;
    chatSend?: LocaleString;
    chatBack?: LocaleString;
    chatNewConversation?: LocaleString;
    chatNewConversationStarted?: LocaleString;
    chatCopyTooltip?: LocaleString;
    chatCopied?: LocaleString;
    editTooltip?: LocaleString;
    deleteTooltip?: LocaleString;
    cancelLabel?: LocaleString;
    saveLabel?: LocaleString;
    savingLabel?: LocaleString;
    messagesNewTooltip?: LocaleString;
    messagesEmpty?: LocaleString;
    messagesPlaceholder?: LocaleString;
    notesEmpty?: LocaleString;
    noteEmptyLabel?: LocaleString;
  };
}

export interface CaretCoordinates {
  top: number;
  left: number;
  height: number;
}

export interface SiteStrategy {
  readonly siteKey: string;
  getCurrentText(editor: HTMLElement): string;
  getCaretCoordinates(editor: HTMLElement): CaretCoordinates | null;
  insertText(editor: HTMLElement, text: string): void;
  replaceSelectedText(
    editor: HTMLElement,
    newText: string,
    savedRange: Range,
  ): void;
  replaceAllText(editor: HTMLElement, text: string): void;
  pasteText(
    editor: HTMLElement,
    text: string,
    mode: "insert" | "replaceAll" | "replaceSelected",
    savedRange?: Range,
  ): void;
  pasteFile?(editor: HTMLElement, file: File): boolean;
}

export interface SitesFallbackConfig {
  fileAttach?: SiteFileAttachConfig;
}

export interface ExtensionSettings {
  version: number;
  theme?: {
    dark?: Partial<ThemeColorSet>;
  };
  messages?: {
    errors?: Record<string, LocaleString>;
    success?: Record<string, LocaleString>;
    info?: Record<string, LocaleString>;
  };
  behavior: {
    enabled?: boolean;
    debounceMs: number;
    minTextLength: number;
    captureQuality?: number;
    configRefreshMs?: number;
    captureCooldownMs?: number;
    acceptKey?: string;
    dismissKey?: string;
    minSelectionLength?: number;
    captureDelayMs?: number;
    filesAttachDragSuppressMs?: number;
    filesAttachSuccessSuppressMs?: number;
    filesPasteHintDismissMs?: number;
    filesUploadPollAttempts?: number;
    filesUploadPollIntervalMs?: number;
    windowDragMarginPx?: number;
    pageContentMaxSizeKB?: number;
    pageScreenshotMaxSizeKB?: number;
    pageIndicatorMaxDurationMs?: number;
    toastMaxDurationMs?: number;
  };
  overlay: {
    color: string;
    opacity: string;
    badgeBackground: string;
    badgeFontSize: string;
    maxDisplayLength?: number;
    badgeText?: LocaleString;
    acceptLabel?: LocaleString;
    cancelLabel?: LocaleString;
    autocompletePageTitle?: LocaleString;
    acceptHint?: LocaleString;
    badgePaddingX?: number;
    badgeGap?: number;
    badgeSafetyPad?: number;
  };
  widget?: WidgetConfig;
  endpoints?: Partial<Record<EndpointKey, string>>;
  indicators?: {
    topBorder?: {
      enabled?: boolean;
      duration?: string;
      height?: string;
    };
    bottomBorder?: {
      enabled?: boolean;
      duration?: string;
      height?: string;
      loadingDuration?: string;
    };
  };
  themes?: ThemeDefinition[];
  sitesFallback?: SitesFallbackConfig;
  sites: SiteConfig[];
}

export interface ResolvedBehaviorConfig {
  enabled?: boolean;
  debounceMs: number;
  minTextLength: number;
  captureQuality?: number;
  configRefreshMs?: number;
  captureCooldownMs?: number;
  acceptKey?: string;
  dismissKey?: string;
  minSelectionLength?: number;
  captureDelayMs?: number;
  filesAttachDragSuppressMs?: number;
  filesAttachSuccessSuppressMs?: number;
  filesPasteHintDismissMs?: number;
  filesUploadPollAttempts?: number;
  filesUploadPollIntervalMs?: number;
  windowDragMarginPx?: number;
  pageContentMaxSizeKB?: number;
  pageScreenshotMaxSizeKB?: number;
  pageIndicatorMaxDurationMs?: number;
  toastMaxDurationMs?: number;
}

export interface ResolvedOverlayConfig {
  color: string;
  opacity: string;
  badgeBackground: string;
  badgeFontSize: string;
  maxDisplayLength?: number;
  badgeText: string;
  acceptLabel: string;
  cancelLabel: string;
  autocompletePageTitle: string;
  acceptHint: string;
  badgePaddingX: number;
  badgeGap: number;
  badgeSafetyPad: number;
}

export type EndpointKey =
  | "context"
  | "autocomplete"
  | "autocompleteAccept"
  | "chats"
  | "chatMessages"
  | "files"
  | "filesById"
  | "transforms"
  | "answers"
  | "notes"
  | "notesById"
  | "quickMessages"
  | "quickMessagesById";

export interface ResolvedLoadingAnimationConfig {
  enabled?: boolean;
  duration: string;
}

export interface ResolvedAnswerToolPageConfig {
  type: AnswerToolPageType;
  backLabel?: string;
  additionalInput?: {
    enabled?: boolean;
    maxLength?: number;
    placeholder?: string;
  };
  action?: {
    label?: string;
    icon?: string;
  };
  loadingMessage?: string;
}

export interface ResolvedAnswerToolConfig {
  type: "answer";
  id: string;
  enabled?: boolean;
  icon?: string;
  label?: string;
  style?: "primary";
  apiPath?: string;
  pages?: ResolvedAnswerToolPageConfig[];
}

export interface ResolvedToggleToolConfig {
  type: "toggle";
  id: string;
  enabled?: boolean;
  icon?: string;
  label?: string;
  toggleTarget: "autocomplete";
}

export interface ResolvedLinkToolConfig {
  type: "link";
  id: string;
  enabled?: boolean;
  icon?: string;
  label?: string;
  linkAction: "open_side_panel" | "open_app" | "open_chat";
  href?: string;
}

export type ResolvedToolItemConfig =
  | ResolvedAnswerToolConfig
  | ResolvedToggleToolConfig
  | ResolvedLinkToolConfig;

export interface ResolvedTransformItemConfig {
  id: string;
  enabled?: boolean;
  icon?: string;
  label?: string;
  transformAction: string;
  autoApply?: boolean;
}

export interface ResolvedLinkItemConfig {
  id: string;
  enabled?: boolean;
  icon?: string;
  label?: string;
  linkAction?: "open_side_panel" | "open_app";
  href?: string;
}

export interface ResolvedWidgetConfig {
  enabled?: boolean;
  bottom: string;
  right: string;
  width?: number;
  height: number;
  iconSize: number;
  iconUrl: string;
  shineDuration: string;
  sweepDuration: string;
  loadingAnimation: ResolvedLoadingAnimationConfig;
  borderRadius?: string;
  menuBorderRadius: string;
  menuMinWidth: string;
  menuMaxWidth: string;
  appUrl: string;
  transformsTooltipDelayMs: number;
  defaultAdditionalInputMaxLength: number;
  transformsNoSelectionTooltip: string;
  chat: { maxLength: number };
  quickMessages: { maxLength: number };
  tools: ResolvedToolItemConfig[];
  transforms: ResolvedTransformItemConfig[];
  links: ResolvedLinkItemConfig[];
  menu?: {
    filesLabel: string;
    filesSendLabel: string;
    filesEditLabel: string;
    filesAIEnableLabel: string;
    filesAIDisableLabel: string;
    filesDeleteLabel: string;
    filesDeleteConfirmLabel: string;
    filesAttachHint: string;
    filesUploadSuccess: string;
    filesDeleteSuccess: string;
    filesRenameSuccess: string;
    filesPasteHint: string;
    messagesLabel: string;
    messagesAttachHint: string;
    notesLabel: string;
    notesPinHint: string;
    notesAIEnableLabel: string;
    notesAIDisableLabel: string;
    aiLabel: string;
    panelLabel: string;
    disclaimerText: string;
    chatDisclaimerText: string;
    chatEmptyHelp: string;
    chatEmptyExamples: string[];
    chatPlaceholder: string;
    chatSend: string;
    chatBack: string;
    chatNewConversation: string;
    chatNewConversationStarted: string;
    chatCopyTooltip: string;
    chatCopied: string;
    editTooltip: string;
    deleteTooltip: string;
    cancelLabel: string;
    saveLabel: string;
    savingLabel: string;
    messagesNewTooltip: string;
    messagesEmpty: string;
    messagesPlaceholder: string;
    notesEmpty: string;
    noteEmptyLabel: string;
  };
}

export interface ResolvedTopBorderConfig {
  enabled?: boolean;
  height: string;
  duration: string;
}

export interface ResolvedBottomBorderConfig {
  enabled?: boolean;
  height: string;
  duration: string;
  loadingDuration: string;
}

export interface ResolvedIndicatorsConfig {
  color1: string;
  color2: string;
  topBorder: ResolvedTopBorderConfig;
  bottomBorder: ResolvedBottomBorderConfig;
}

export interface ResolvedSitesFallbackConfig {
  editorSelector: string;
  editorType?: "contenteditable" | "textarea" | "mixed";
  fileAttach?: SiteFileAttachConfig;
}

export interface ResolvedMessagesConfig {
  errors: Record<string, string>;
  success: Record<string, string>;
  info: Record<string, string>;
}

export interface ResolvedExtensionSettings {
  version: number;
  theme: ThemeConfig;
  messages: ResolvedMessagesConfig;
  behavior: ResolvedBehaviorConfig;
  overlay: ResolvedOverlayConfig;
  widget: ResolvedWidgetConfig;
  indicators: ResolvedIndicatorsConfig;
  themes: ThemeDefinition[];
  sitesFallback: ResolvedSitesFallbackConfig;
  sites: SiteConfig[];
}
