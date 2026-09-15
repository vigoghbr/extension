import { Copy } from "lucide-react";
import { useState } from "react";
import { useStore } from "zustand";
import { copyText } from "@/libs/clipboard";
import { resolveIcon } from "@/libs/icons";
import { toastr } from "@/libs/toastr";
import { extensionStore } from "@/stores/extensionStore";
import { stylesStore } from "@/stores/stylesStore";
import {
  clearToolResult,
  toolResultStore,
} from "@/stores/tools/toolResultStore";
import { requestAnswersFromText, toolsStore } from "@/stores/tools/toolsStore";
import { TRANSCRIPTION_TOOL_ID } from "@/stores/tools/transcriptionStore";
import {
  openMenu,
  setActiveInputItem,
  setDirection,
} from "@/stores/widgetStore";
import type { ResolvedWidgetConfig, ThemeColorSet } from "@/types";
import { Window, type WindowAction } from "@/views/Window";

interface ToolResultWindowProps {
  colors: ThemeColorSet;
  config: ResolvedWidgetConfig;
  bottom: number;
  right: number;
}

export function ToolResultWindow({
  colors,
  config,
  bottom,
  right,
}: ToolResultWindowProps) {
  const result = useStore(toolResultStore, (s) => s.result);
  const copyLabel = useStore(
    extensionStore,
    (s) => s.config?.messages.info.COPY_LABEL ?? "",
  );
  const toolsStatus = useStore(toolsStore, (s) => s.status);
  const windowDims = useStore(stylesStore, (s) => s.styles?.windows.toolResult);
  const [answerDirection, setAnswerDirection] = useState("");

  if (!result) return null;

  const tool = config.tools.find((item) => item.id === result.toolId);
  const Icon = resolveIcon(tool?.icon);

  const answerTool = config.tools.find((item) => item.type === "answer");
  const AnswerIcon = resolveIcon(answerTool?.icon);
  const directionPage = answerTool?.pages?.find((p) => p.type === "direction");
  const maxLength =
    directionPage?.additionalInput?.maxLength ??
    config.defaultAdditionalInputMaxLength;
  const isAnswering = toolsStatus === "loading";
  const canAnswer =
    !!answerTool &&
    result.toolId === TRANSCRIPTION_TOOL_ID &&
    result.text.trim().length > 0;

  const actions: WindowAction[] = [
    {
      icon: <Copy size={14} />,
      tooltip: copyLabel,
      onClick: () => {
        void copyText(result.text).then(() => toastr.success("TEXT_COPIED"));
      },
    },
  ];

  const handleAnswer = () => {
    if (!answerTool || isAnswering) return;
    setDirection("");
    setActiveInputItem(null);
    openMenu();
    requestAnswersFromText(answerTool.id, result.text, answerDirection);
    setAnswerDirection("");
    clearToolResult();
  };

  return (
    <Window
      colors={colors}
      icon={<Icon size={14} className="shrink-0 text-white/60" />}
      title={tool?.label ?? ""}
      bottom={bottom}
      right={right}
      minWidth={windowDims?.minWidth ?? 300}
      minHeight={windowDims?.minHeight ?? 260}
      initialWidth={windowDims?.initialWidth ?? 420}
      initialHeight={windowDims?.initialHeight ?? 380}
      actions={actions}
      onClose={clearToolResult}
    >
      <div
        className="flex-1 min-h-0 overflow-y-auto px-3 py-2 text-sm text-white break-words whitespace-pre-wrap select-text cursor-text leading-snug"
        style={{ userSelect: "text", WebkitUserSelect: "text" }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {result.text}
      </div>

      {canAnswer && (
        <div className="border-t border-white/10 px-3.5 pt-2.5 pb-3 flex flex-col gap-2">
          <span className="block text-right text-[10px] text-white/60">
            {answerDirection.length}/{maxLength}
          </span>
          <textarea
            rows={2}
            className="w-full text-sm bg-white/5 border border-white/10 rounded-md px-2.5 py-2 text-white placeholder:text-white/70 resize-none outline-none focus:border-white/20"
            maxLength={maxLength}
            placeholder={directionPage?.additionalInput?.placeholder ?? ""}
            value={answerDirection}
            disabled={isAnswering}
            onMouseDown={(e) => e.stopPropagation()}
            onChange={(e) => setAnswerDirection(e.target.value)}
          />
          <button
            className="vigogh-shine-btn flex items-center justify-center gap-1.5 py-2 px-3.5 text-white text-sm font-medium rounded-md w-full cursor-pointer border-none disabled:opacity-50"
            disabled={isAnswering}
            onMouseDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              handleAnswer();
            }}
          >
            <AnswerIcon size={14} className="shrink-0" />
            {answerTool?.label ?? ""}
          </button>
        </div>
      )}
    </Window>
  );
}
