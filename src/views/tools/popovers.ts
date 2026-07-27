import { FolderOpen, MessageSquare, NotebookPen, Sparkles } from "lucide-react";
import React from "react";
import type { ResolvedAiMenuConfig } from "@/types";
import { AiPopover } from "@/views/AiPopover";
import { FilesPopover } from "@/views/tools/FilesPopover";
import { MessagesPopover } from "@/views/tools/MessagesPopover";
import { NotesPopover } from "@/views/tools/NotesPopover";
import type { PopoverToolRegistration } from "@/views/tools/types";

type VigoghMenuLabels = NonNullable<ResolvedAiMenuConfig["vigoghMenu"]>;

export const popoverTools: PopoverToolRegistration[] = [
  {
    id: "files",
    popoverId: "files",
    icon: React.createElement(FolderOpen, { size: 16 }),
    getLabel: (labels: VigoghMenuLabels) => labels.filesLabel,
    Popover: FilesPopover,
  },
  {
    id: "notes",
    popoverId: "notes",
    icon: React.createElement(NotebookPen, { size: 16 }),
    getLabel: (labels: VigoghMenuLabels) => labels.notesLabel,
    Popover: NotesPopover,
  },
  {
    id: "quick-messages",
    popoverId: "messages",
    icon: React.createElement(MessageSquare, { size: 16 }),
    getLabel: (labels: VigoghMenuLabels) => labels.messagesLabel,
    Popover: MessagesPopover,
  },
  {
    id: "chat",
    popoverId: "ai",
    icon: React.createElement(Sparkles, { size: 16 }),
    getLabel: (labels: VigoghMenuLabels) => labels.aiLabel,
    Popover: AiPopover,
  },
];
