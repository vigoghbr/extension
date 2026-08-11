import { Bot, Plus } from "lucide-react";
import { useState } from "react";
import { useStore } from "zustand";
import { resolveIcon } from "@/libs/icons";
import { toastr } from "@/libs/toastr";
import { extensionStore } from "@/stores/extensionStore";
import { stylesStore } from "@/stores/stylesStore";
import { resetChat } from "@/stores/tools/chatStore";
import {
  acceptAnswer,
  acceptTransform,
  clearToolResults,
  requestAnswers,
  toolsStore,
} from "@/stores/tools/toolsStore";
import {
  closeChat,
  closePopover,
  setActiveInputItem,
  setDirection,
  widgetStore,
} from "@/stores/widgetStore";
import type {
  ResolvedAnswerToolConfig,
  ResolvedAnswerToolPageConfig,
  ResolvedTransformItemConfig,
  ResolvedWidgetConfig,
  ThemeColorSet,
} from "@/types";
import { ChatPanel } from "@/views/tools/ChatPanel";
import { Window } from "@/views/Window";

interface ToolsPopoverProps {
  colors: ThemeColorSet;
  config: ResolvedWidgetConfig;
  label: string;
  bottom: number;
  right: number;
  onClose: () => void;
}

export function ToolsPopover({
  colors,
  config,
  bottom,
  right,
}: ToolsPopoverProps) {
  const extensionConfig = useStore(extensionStore, (s) => s.config);
  const windows = useStore(stylesStore, (s) => s.styles?.windows);
  const toolsStatus = useStore(toolsStore, (s) => s.status);
  const toolsErrorCode = useStore(toolsStore, (s) => s.errorCode);
  const toolsSuggestions = useStore(toolsStore, (s) => s.suggestions);
  const activeItemId = useStore(toolsStore, (s) => s.activeItemId);
  const activeInputItem = useStore(widgetStore, (s) => s.activeInputItem);
  const direction = useStore(widgetStore, (s) => s.direction);
  const chatOpen = useStore(widgetStore, (s) => s.chatOpen);

  const toolItems = config.tools;
  const transformItems = config.transforms;

  const showToolResultsPanel = toolsStatus !== "idle";

  const activeItem = activeItemId
    ? [...toolItems, ...transformItems].find(
        (
          item,
        ): item is ResolvedAnswerToolConfig | ResolvedTransformItemConfig =>
          "id" in item && item.id === activeItemId,
      )
    : null;

  const activeAnswerItem =
    activeItem && "type" in activeItem && activeItem.type === "answer"
      ? activeItem
      : null;

  const optionsPageConfig: ResolvedAnswerToolPageConfig | null =
    activeAnswerItem?.pages?.find((p) => p.type === "options") ?? null;

  const directionPageCfg: ResolvedAnswerToolPageConfig | null =
    activeInputItem?.pages?.find(
      (p: ResolvedAnswerToolPageConfig) => p.type === "direction",
    ) ?? null;

  const OptionsActionIcon = resolveIcon(optionsPageConfig?.action?.icon);
  const DirectionActionIcon = resolveIcon(directionPageCfg?.action?.icon);

  const hasContent = chatOpen || showToolResultsPanel || !!activeInputItem;
  if (!hasContent || !windows) return null;

  const disclaimerText = config.menu?.disclaimerText;

  if (chatOpen) {
    const chatLabel = config.tools.find((t) => t.id === "chats")?.label ?? "";
    const newConversationLabel = config.menu?.chatNewConversation ?? "";
    return (
      <Window
        colors={colors}
        icon={<Bot size={14} className="shrink-0 text-white/60" />}
        title={chatLabel}
        bottom={bottom}
        right={right}
        {...windows.chat}
        actions={[
          {
            icon: <Plus size={14} />,
            tooltip: newConversationLabel,
            onClick: () => {
              resetChat();
              toastr.success("CHAT_NEW_CONVERSATION_STARTED", {
                id: "vigogh-chat-new",
              });
            },
          },
        ]}
        onClose={() => {
          closeChat();
          closePopover("ai");
        }}
      >
        <ChatPanel colors={colors} />
      </Window>
    );
  }

  if (showToolResultsPanel) {
    const ActiveItemIcon = resolveIcon(
      activeAnswerItem?.icon ?? activeItem?.icon,
    );
    const title =
      activeAnswerItem?.label ??
      activeInputItem?.label ??
      activeItem?.label ??
      "";
    const hasSuggestions =
      toolsStatus === "success" && toolsSuggestions.length > 0;
    const isLoading = toolsStatus === "loading";
    const resultsDims =
      hasSuggestions || isLoading
        ? windows.aiResultsFull
        : windows.aiResultsCompact;
    return (
      <Window
        colors={colors}
        icon={<ActiveItemIcon size={14} className="shrink-0 text-white/60" />}
        title={title}
        bottom={bottom}
        right={right}
        {...resultsDims}
        onClose={() => {
          const firstPageType = activeAnswerItem?.pages?.[0]?.type ?? "options";
          clearToolResults();
          if (firstPageType !== "direction") setActiveInputItem(null);
          closePopover("ai");
        }}
        disclaimer={disclaimerText}
      >
        <div className="flex-1 min-h-0 overflow-y-auto py-1.5">
          {isLoading && (
            <div className="py-2 px-3 flex flex-col gap-2">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="h-5 rounded-md bg-white/5 animate-pulse"
                />
              ))}
            </div>
          )}

          {toolsStatus === "error" &&
            toolsErrorCode === "USAGE_LIMIT_EXCEEDED" &&
            extensionConfig && (
              <div className="flex items-center justify-center px-4 py-5">
                <p className="m-0 text-sm text-center text-white/50">
                  {extensionConfig.messages.errors.USAGE_LIMIT_EXCEEDED ||
                    extensionConfig.messages.errors.DEFAULT}
                </p>
              </div>
            )}

          {toolsStatus === "success" &&
            toolsSuggestions.map((suggestion, i) => (
              <SuggestionItem
                key={i}
                text={suggestion}
                hoverBg={colors.itemSecondaryHoverBackground}
                onClick={() => {
                  const isAnswer = activeAnswerItem !== null;
                  if (isAnswer) {
                    acceptAnswer(suggestion);
                  } else {
                    acceptTransform(suggestion);
                  }
                  clearToolResults();
                  closePopover("ai");
                }}
              />
            ))}
        </div>

        {activeAnswerItem &&
          (toolsStatus === "success" || isLoading) &&
          optionsPageConfig?.additionalInput?.enabled !== false && (
            <div className="border-t border-white/10 px-3.5 pt-2.5 pb-3 flex flex-col gap-2">
              <span className="block text-right text-[10px] text-white/60">
                {direction.length}/
                {optionsPageConfig?.additionalInput?.maxLength ??
                  config.defaultAdditionalInputMaxLength}
              </span>
              <textarea
                rows={2}
                className="w-full text-sm bg-white/5 border border-white/10 rounded-md px-2.5 py-2 text-white placeholder:text-white/70 resize-none outline-none focus:border-white/20"
                maxLength={
                  optionsPageConfig?.additionalInput?.maxLength ??
                  config.defaultAdditionalInputMaxLength
                }
                placeholder={
                  optionsPageConfig?.additionalInput?.placeholder ?? ""
                }
                value={direction}
                disabled={isLoading}
                onMouseDown={(e) => e.stopPropagation()}
                onChange={(e) => setDirection(e.target.value)}
              />
              <button
                className="vigogh-shine-btn flex items-center justify-center gap-1.5 py-2 px-3.5 text-white text-sm font-medium rounded-md w-full cursor-pointer border-none disabled:opacity-50"
                disabled={isLoading}
                onMouseDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                }}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  if (activeItemId) {
                    requestAnswers(activeItemId, direction);
                    setDirection("");
                  }
                }}
              >
                <OptionsActionIcon size={14} className="shrink-0" />
                {optionsPageConfig?.action?.label}
              </button>
            </div>
          )}
      </Window>
    );
  }

  if (activeInputItem) {
    const InputItemIcon = resolveIcon(activeInputItem.icon);
    return (
      <Window
        colors={colors}
        icon={<InputItemIcon size={14} className="shrink-0 text-white/60" />}
        title={activeInputItem.label ?? ""}
        bottom={bottom}
        right={right}
        {...windows.aiDirection}
        onClose={() => {
          setDirection("");
          setActiveInputItem(null);
          closePopover("ai");
        }}
        disclaimer={disclaimerText}
      >
        <div className="px-3.5 pt-2 pb-3 flex flex-col gap-2.5">
          <span className="block text-right text-[10px] text-white/60">
            {direction.length}/
            {directionPageCfg?.additionalInput?.maxLength ??
              config.defaultAdditionalInputMaxLength}
          </span>
          <textarea
            rows={3}
            className="w-full text-sm bg-white/5 border border-white/10 rounded-md px-2.5 py-2 text-white placeholder:text-white/70 resize-none outline-none focus:border-white/20"
            maxLength={
              directionPageCfg?.additionalInput?.maxLength ??
              config.defaultAdditionalInputMaxLength
            }
            placeholder={directionPageCfg?.additionalInput?.placeholder ?? ""}
            value={direction}
            onMouseDown={(e) => e.stopPropagation()}
            onChange={(e) => setDirection(e.target.value)}
          />
          <button
            className="vigogh-shine-btn flex items-center justify-center gap-1.5 py-2 px-3.5 text-white text-sm font-medium rounded-md w-full cursor-pointer border-none"
            onMouseDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              requestAnswers(activeInputItem.id, direction);
              setDirection("");
            }}
          >
            <DirectionActionIcon size={14} className="shrink-0" />
            {directionPageCfg?.action?.label}
          </button>
        </div>
      </Window>
    );
  }

  return null;
}

interface SuggestionItemProps {
  text: string;
  hoverBg: string;
  onClick: () => void;
}

function SuggestionItem({ text, hoverBg, onClick }: SuggestionItemProps) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      className="block py-2 px-3.5 border-none text-white text-sm text-left cursor-pointer rounded-md mx-1 transition-colors leading-snug whitespace-pre-wrap break-words"
      style={{
        background: hovered ? hoverBg : "transparent",
        width: "calc(100% - 8px)",
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onMouseDown={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onClick();
      }}
    >
      {text}
    </button>
  );
}
