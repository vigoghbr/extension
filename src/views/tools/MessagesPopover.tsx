import { useEffect, useRef, useState } from "react";
import { MessageSquare, Pencil, Plus, Trash2 } from "lucide-react";
import { useStore } from "zustand";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/views/ui/tooltip";
import { Window, type WindowAction } from "@/views/Window";
import { extensionStore } from "@/stores/extensionStore";
import { stylesStore } from "@/stores/stylesStore";
import { applyQuickMessage } from "@/utils/quick-message-apply";
import {
  createQuickMessage,
  deleteQuickMessage,
  fetchQuickMessages,
  quickMessagesStore,
  updateQuickMessage,
} from "@/stores/tools/quickMessagesStore";
import type { QuickMessage, ThemeColorSet } from "@/types";
import type { PopoverProps } from "@/views/tools/types";

type View = "list" | "create" | "edit";

export function MessagesPopover({ colors, label, bottom, right, onClose }: PopoverProps) {
  const [dragging, setDragging] = useState<string | null>(null);
  const [view, setView] = useState<View>("list");
  const [editingMessage, setEditingMessage] = useState<QuickMessage | null>(null);

  const items = useStore(quickMessagesStore, (s) => s.items);
  const status = useStore(quickMessagesStore, (s) => s.status);
  const attachHint = useStore(extensionStore, (s) => s.config?.aiMenu.vigoghMenu?.messagesAttachHint ?? "");
  const newTooltip = useStore(extensionStore, (s) => s.config?.aiMenu.vigoghMenu?.messagesNewTooltip ?? "");
  const emptyLabel = useStore(extensionStore, (s) => s.config?.aiMenu.vigoghMenu?.messagesEmpty ?? "");
  const windowDims = useStore(stylesStore, (s) => s.styles?.windows.messages);

  useEffect(() => {
    fetchQuickMessages();
  }, []);

  function handleEditClick(msg: QuickMessage) {
    setEditingMessage(msg);
    setView("edit");
  }

  function handleSaved() {
    setEditingMessage(null);
    setView("list");
  }

  const actions: WindowAction[] = [];
  if (view === "list") {
    actions.push({
      icon: <Plus size={14} />,
      tooltip: newTooltip,
      onClick: () => setView("create"),
    });
  }

  if (!windowDims) return null;

  return (
    <Window
      colors={colors}
      icon={<MessageSquare size={14} className="shrink-0 text-white/60" />}
      title={label}
      bottom={bottom}
      right={right}
      {...windowDims}
      actions={actions}
      onClose={onClose}
      disclaimer={attachHint}
    >
      {view === "list" && (
        <ListView
          items={items}
          status={status}
          emptyLabel={emptyLabel}
          dragging={dragging}
          hoverBg={colors.itemSecondaryHoverBackground}
          onDragStart={(id) => setDragging(id)}
          onDragEnd={() => setDragging(null)}
          onInsert={(text) => applyQuickMessage(text)}
          onEdit={handleEditClick}
          onDelete={(id) => deleteQuickMessage(id)}
        />
      )}

      {view === "create" && (
        <MessageForm
          colors={colors}
          onCancel={() => setView("list")}
          onSave={handleSaved}
        />
      )}

      {view === "edit" && editingMessage && (
        <MessageForm
          colors={colors}
          initialText={editingMessage.text}
          editingId={editingMessage.id}
          onCancel={() => { setEditingMessage(null); setView("list"); }}
          onSave={handleSaved}
        />
      )}
    </Window>
  );
}

interface ListViewProps {
  items: QuickMessage[];
  status: string;
  emptyLabel: string;
  dragging: string | null;
  hoverBg: string;
  onDragStart: (id: string) => void;
  onDragEnd: () => void;
  onInsert: (text: string) => void;
  onEdit: (msg: QuickMessage) => void;
  onDelete: (id: string) => void;
}

function ListView({ items, status, emptyLabel, dragging, hoverBg, onDragStart, onDragEnd, onInsert, onEdit, onDelete }: ListViewProps) {
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
      {items.map((msg) => (
        <MessageItem
          key={msg.id}
          message={msg}
          isDragging={dragging === msg.id}
          hoverBg={hoverBg}
          onDragStart={() => onDragStart(msg.id)}
          onDragEnd={onDragEnd}
          onInsert={() => onInsert(msg.text)}
          onEdit={() => onEdit(msg)}
          onDelete={() => onDelete(msg.id)}
        />
      ))}
    </div>
  );
}

interface MessageItemProps {
  message: QuickMessage;
  isDragging: boolean;
  hoverBg: string;
  onDragStart: () => void;
  onDragEnd: () => void;
  onInsert: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

function MessageItem({ message, isDragging, hoverBg, onDragStart, onDragEnd, onInsert, onEdit, onDelete }: MessageItemProps) {
  const [hovered, setHovered] = useState(false);
  const editLabel = useStore(extensionStore, (s) => s.config?.aiMenu.vigoghMenu?.editTooltip ?? "");
  const deleteLabel = useStore(extensionStore, (s) => s.config?.aiMenu.vigoghMenu?.deleteTooltip ?? "");

  return (
    <div
      draggable
      className="flex items-start gap-1 px-2 py-2 mx-1 rounded-md cursor-grab transition-opacity"
      style={{
        background: hovered ? hoverBg : "transparent",
        opacity: isDragging ? 0.4 : 1,
        width: "calc(100% - 8px)",
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onDragStart={(e) => {
        e.dataTransfer.setData("text/plain", message.text);
        e.dataTransfer.setData("application/x-vigogh-quick-message", message.text);
        e.dataTransfer.effectAllowed = "copy";
        onDragStart();
      }}
      onDragEnd={onDragEnd}
      onMouseDown={(e) => { e.stopPropagation(); }}
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); onInsert(); }}
    >
      <div className="flex flex-col gap-0.5 flex-1 min-w-0">
        <span className="text-sm text-white/85 leading-snug line-clamp-2">{message.text}</span>
      </div>
      {hovered && (
        <div className="flex items-center gap-0.5 shrink-0 mt-0.5">
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                className="flex items-center justify-center w-5 h-5 rounded bg-transparent text-white hover:text-white cursor-pointer border-none"
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); onEdit(); }}
              >
                <Pencil size={11} />
              </button>
            </TooltipTrigger>
            <TooltipContent>{editLabel}</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                className="flex items-center justify-center w-5 h-5 rounded bg-transparent text-white hover:text-red-400 cursor-pointer border-none"
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); onDelete(); }}
              >
                <Trash2 size={11} />
              </button>
            </TooltipTrigger>
            <TooltipContent>{deleteLabel}</TooltipContent>
          </Tooltip>
        </div>
      )}
    </div>
  );
}

interface MessageFormProps {
  colors: ThemeColorSet;
  initialText?: string;
  editingId?: string;
  onCancel: () => void;
  onSave: () => void;
}

function MessageForm({ colors, initialText = "", editingId, onCancel, onSave }: MessageFormProps) {
  const [text, setText] = useState(initialText);
  const saveStatus = useStore(quickMessagesStore, (s) => s.saveStatus);
  const saving = saveStatus === "loading";
  const maxLength = useStore(
    extensionStore,
    (s) => s.config!.aiMenu.quickMessages.maxLength,
  );
  const placeholder = useStore(extensionStore, (s) => s.config?.aiMenu.vigoghMenu?.messagesPlaceholder ?? "");
  const cancelLabel = useStore(extensionStore, (s) => s.config?.aiMenu.vigoghMenu?.cancelLabel ?? "");
  const saveLabel = useStore(extensionStore, (s) => s.config?.aiMenu.vigoghMenu?.saveLabel ?? "");
  const savingLabel = useStore(extensionStore, (s) => s.config?.aiMenu.vigoghMenu?.savingLabel ?? "");
  const messagesPopoverStyles = useStore(stylesStore, (s) => s.styles?.messagesPopover);
  const textRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    textRef.current?.focus();
  }, []);

  function handleSave(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!text.trim() || saving) return;
    const op = editingId
      ? updateQuickMessage(editingId, text.trim())
      : createQuickMessage(text.trim());
    op.then(onSave).catch(() => {});
  }

  const inputStyle = {
    background: messagesPopoverStyles?.inputBackground ?? "transparent",
    border: `1px solid ${colors.menuBorderColor}`,
    borderRadius: "8px",
    color: colors.textColor,
    fontSize: "13px",
    padding: "6px 10px",
    width: "100%",
    outline: "none",
  };

  return (
    <div className="px-3 pb-3 flex flex-col gap-2">
      <textarea
        ref={textRef}
        placeholder={placeholder}
        value={text}
        maxLength={maxLength}
        rows={3}
        style={{ ...inputStyle, resize: "none" }}
        onMouseDown={(e) => e.stopPropagation()}
        onChange={(e) => setText(e.target.value)}
      />
      <div className="flex gap-2">
        <button
          className="flex-1 py-1.5 rounded-md text-xs font-medium text-white/60 cursor-pointer border-none"
          style={{ background: messagesPopoverStyles?.cancelButtonBackground ?? "transparent" }}
          onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); onCancel(); }}
        >
          {cancelLabel}
        </button>
        <button
          className="flex-1 py-1.5 rounded-md text-xs font-medium text-white cursor-pointer border-none disabled:opacity-50"
          style={{ background: "var(--shine-btn-sweep)" }}
          disabled={!text.trim() || saving}
          onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
          onClick={handleSave}
        >
          {saving ? savingLabel : saveLabel}
        </button>
      </div>
      <span className="block text-right text-[10px] text-white/60">
        {text.length}/{maxLength}
      </span>
    </div>
  );
}
