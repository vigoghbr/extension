import { FolderOpen, MessageSquare, NotebookPen, Sparkles } from "lucide-react";
import React from "react";
import type { ResolvedWidgetConfig, ThemeColorSet } from "@/types";
import { FilesPopover } from "@/views/tools/FilesPopover";
import { MessagesPopover } from "@/views/tools/MessagesPopover";
import { NotesPopover } from "@/views/tools/NotesPopover";
import { ToolsPopover } from "@/views/tools/ToolsPopover";

export interface PopoverProps {
  colors: ThemeColorSet;
  config: ResolvedWidgetConfig;
  label: string;
  bottom: number;
  right: number;
  onClose: () => void;
}

export interface PopoverToolRegistration {
  id: string;
  popoverId: string;
  icon: React.ReactNode;
  getLabel: (labels: NonNullable<ResolvedWidgetConfig["menu"]>) => string;
  Popover: React.ComponentType<PopoverProps>;
}

type MenuLabels = NonNullable<ResolvedWidgetConfig["menu"]>;

export const popoverTools: PopoverToolRegistration[] = [
  {
    id: "files",
    popoverId: "files",
    icon: React.createElement(FolderOpen, { size: 16 }),
    getLabel: (labels: MenuLabels) => labels.filesLabel,
    Popover: FilesPopover,
  },
  {
    id: "notes",
    popoverId: "notes",
    icon: React.createElement(NotebookPen, { size: 16 }),
    getLabel: (labels: MenuLabels) => labels.notesLabel,
    Popover: NotesPopover,
  },
  {
    id: "quick-messages",
    popoverId: "messages",
    icon: React.createElement(MessageSquare, { size: 16 }),
    getLabel: (labels: MenuLabels) => labels.messagesLabel,
    Popover: MessagesPopover,
  },
  {
    id: "chat",
    popoverId: "ai",
    icon: React.createElement(Sparkles, { size: 16 }),
    getLabel: (labels: MenuLabels) => labels.aiLabel,
    Popover: ToolsPopover,
  },
];
