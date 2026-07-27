import {
  Bot,
  BotOff,
  NotebookPen,
  Pin,
  PinOff,
  Plus,
  Trash2,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useStore } from "zustand";
import { extensionStore } from "@/stores/extensionStore";
import {
  hideStickyNote,
  showStickyNote,
  stickyNotesStore,
} from "@/stores/stickyNotesStore";
import { stylesStore } from "@/stores/stylesStore";
import {
  createEmptyNote,
  deleteNote,
  fetchNotes,
  notesStore,
  toggleNoteAI,
} from "@/stores/tools/notesStore";
import type { Note } from "@/types";
import { getNotePreview } from "@/utils/notes-html";
import type { PopoverProps } from "@/views/tools/types";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/views/ui/tooltip";
import { Window, type WindowAction } from "@/views/Window";

export function NotesPopover({
  colors,
  label,
  bottom,
  right,
  onClose,
}: PopoverProps) {
  const items = useStore(notesStore, (s) => s.items);
  const status = useStore(notesStore, (s) => s.status);
  const visibleIds = useStore(stickyNotesStore, (s) => s.visibleIds);
  const messages = useStore(extensionStore, (s) => s.config?.messages);
  const pinHint = useStore(
    extensionStore,
    (s) => s.config?.aiMenu.vigoghMenu?.notesPinHint ?? "",
  );
  const aiEnableLabel = useStore(
    extensionStore,
    (s) => s.config?.aiMenu.vigoghMenu?.notesAIEnableLabel ?? "",
  );
  const aiDisableLabel = useStore(
    extensionStore,
    (s) => s.config?.aiMenu.vigoghMenu?.notesAIDisableLabel ?? "",
  );
  const emptyLabel = useStore(
    extensionStore,
    (s) => s.config?.aiMenu.vigoghMenu?.notesEmpty ?? "",
  );
  const noteEmptyLabel = useStore(
    extensionStore,
    (s) => s.config?.aiMenu.vigoghMenu?.noteEmptyLabel ?? "",
  );
  const deleteLabel = useStore(
    extensionStore,
    (s) => s.config?.aiMenu.vigoghMenu?.deleteTooltip ?? "",
  );
  const activePinBorderColor = useStore(
    stylesStore,
    (s) => s.styles?.notesPopover.activePinBorderColor ?? "transparent",
  );
  const windowDims = useStore(stylesStore, (s) => s.styles?.windows.notes);

  useEffect(() => {
    fetchNotes();
  }, []);

  function handleCreate() {
    createEmptyNote().then((note) => {
      if (note) showStickyNote(note.id);
    });
  }

  function handleToggleVisibility(id: string) {
    if (visibleIds.includes(id)) {
      hideStickyNote(id);
    } else {
      showStickyNote(id);
    }
  }

  const actions: WindowAction[] = [
    {
      icon: <Plus size={14} />,
      tooltip: messages?.info.NOTE_NEW_TOOLTIP ?? "",
      onClick: handleCreate,
    },
  ];

  if (!windowDims) return null;

  return (
    <Window
      colors={colors}
      icon={<NotebookPen size={14} className="shrink-0 text-white/60" />}
      title={label}
      bottom={bottom}
      right={right}
      {...windowDims}
      actions={actions}
      onClose={onClose}
      disclaimer={pinHint}
    >
      <ListView
        items={items}
        status={status}
        visibleIds={visibleIds}
        hoverBg={colors.itemSecondaryHoverBackground}
        aiEnableLabel={aiEnableLabel}
        aiDisableLabel={aiDisableLabel}
        emptyLabel={emptyLabel}
        noteEmptyLabel={noteEmptyLabel}
        deleteLabel={deleteLabel}
        activePinBorderColor={activePinBorderColor}
        onToggle={handleToggleVisibility}
        onToggleAI={(id) => toggleNoteAI(id)}
        onDelete={(id) => deleteNote(id)}
      />
    </Window>
  );
}

interface ListViewProps {
  items: Note[];
  status: string;
  visibleIds: string[];
  hoverBg: string;
  aiEnableLabel: string;
  aiDisableLabel: string;
  emptyLabel: string;
  noteEmptyLabel: string;
  deleteLabel: string;
  activePinBorderColor: string;
  onToggle: (id: string) => void;
  onToggleAI: (id: string) => void;
  onDelete: (id: string) => void;
}

function ListView({
  items,
  status,
  visibleIds,
  hoverBg,
  aiEnableLabel,
  aiDisableLabel,
  emptyLabel,
  noteEmptyLabel,
  deleteLabel,
  activePinBorderColor,
  onToggle,
  onToggleAI,
  onDelete,
}: ListViewProps) {
  if (status === "loading") {
    return (
      <div className="py-4 px-3 flex flex-col gap-2">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-10 rounded-md bg-white/5 animate-pulse" />
        ))}
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="py-6 px-3 text-center text-white text-sm">
        {emptyLabel}
      </div>
    );
  }

  return (
    <div className="py-1 flex-1 overflow-y-auto">
      {items.map((note) => (
        <NoteItem
          key={note.id}
          note={note}
          active={visibleIds.includes(note.id)}
          hoverBg={hoverBg}
          aiEnableLabel={aiEnableLabel}
          aiDisableLabel={aiDisableLabel}
          noteEmptyLabel={noteEmptyLabel}
          deleteLabel={deleteLabel}
          activePinBorderColor={activePinBorderColor}
          onToggle={() => onToggle(note.id)}
          onToggleAI={() => onToggleAI(note.id)}
          onDelete={() => onDelete(note.id)}
        />
      ))}
    </div>
  );
}

interface NoteItemProps {
  note: Note;
  active: boolean;
  hoverBg: string;
  aiEnableLabel: string;
  aiDisableLabel: string;
  noteEmptyLabel: string;
  deleteLabel: string;
  activePinBorderColor: string;
  onToggle: () => void;
  onToggleAI: () => void;
  onDelete: () => void;
}

function NoteItem({
  note,
  active,
  hoverBg,
  aiEnableLabel,
  aiDisableLabel,
  noteEmptyLabel,
  deleteLabel,
  activePinBorderColor,
  onToggle,
  onToggleAI,
  onDelete,
}: NoteItemProps) {
  const [hovered, setHovered] = useState(false);
  const text = getNotePreview(note.content) || noteEmptyLabel;
  const disabledForAI = note.disabledForAI ?? false;
  const aiToggleLabel = disabledForAI ? aiEnableLabel : aiDisableLabel;

  return (
    <div
      className="flex items-start gap-2.5 px-3 py-2 mx-1 rounded-md cursor-pointer transition-colors"
      style={{
        background: hovered ? hoverBg : "transparent",
        width: "calc(100% - 8px)",
        borderLeft: active
          ? `2px solid ${activePinBorderColor}`
          : "2px solid transparent",
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
        onToggle();
      }}
    >
      <div className="shrink-0 mt-0.5 text-white/50">
        {active ? <Pin size={14} /> : <PinOff size={14} />}
      </div>
      <div className="flex flex-col gap-0.5 flex-1 min-w-0">
        <span className="text-sm text-white/85 leading-snug line-clamp-2 whitespace-pre-line">
          {text}
        </span>
      </div>
      {hovered && (
        <>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-label={aiToggleLabel}
                className="shrink-0 text-white/60 hover:text-white transition-colors p-1 rounded cursor-pointer mt-0.5"
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onToggleAI();
                }}
              >
                {disabledForAI ? <BotOff size={14} /> : <Bot size={14} />}
              </button>
            </TooltipTrigger>
            <TooltipContent>{aiToggleLabel}</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-label={deleteLabel}
                className="shrink-0 text-white/60 hover:text-white transition-colors p-1 rounded cursor-pointer mt-0.5"
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onDelete();
                }}
              >
                <Trash2 size={14} />
              </button>
            </TooltipTrigger>
            <TooltipContent>{deleteLabel}</TooltipContent>
          </Tooltip>
        </>
      )}
    </div>
  );
}
