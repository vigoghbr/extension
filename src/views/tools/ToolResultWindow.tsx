import { Copy } from "lucide-react";
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
  const windowDims = useStore(stylesStore, (s) => s.styles?.windows.toolResult);

  if (!result) return null;

  const tool = config.tools.find((item) => item.id === result.toolId);
  const Icon = resolveIcon(tool?.icon);

  const actions: WindowAction[] = [
    {
      icon: <Copy size={14} />,
      tooltip: copyLabel,
      onClick: () => {
        void copyText(result.text).then(() => toastr.success("TEXT_COPIED"));
      },
    },
  ];

  return (
    <Window
      colors={colors}
      icon={<Icon size={14} className="shrink-0 text-white/60" />}
      title={tool?.label ?? ""}
      bottom={bottom}
      right={right}
      minWidth={windowDims?.minWidth ?? 300}
      minHeight={windowDims?.minHeight ?? 200}
      initialWidth={windowDims?.initialWidth ?? 420}
      initialHeight={windowDims?.initialHeight ?? 300}
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
    </Window>
  );
}
