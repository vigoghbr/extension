import {
  Bot,
  BotOff,
  FileSpreadsheet,
  FileText,
  FileType,
  FolderOpen,
  Pencil,
  Presentation,
  Trash2,
  Upload,
} from "lucide-react";
import type { DragEvent } from "react";
import { useEffect, useRef, useState } from "react";
import { useStore } from "zustand";
import { extensionStore } from "@/stores/extensionStore";
import { stylesStore } from "@/stores/stylesStore";
import {
  deleteFile,
  fetchFiles,
  filesStore,
  renameFile,
  toggleFileAI,
  uploadFile,
} from "@/stores/tools/filesStore";
import type { FileItem } from "@/types";
import { triggerAttach } from "@/utils/files-attach";
import type { PopoverProps } from "@/libs/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/views/ui/tooltip";
import { Window } from "@/views/Window";

function categoryIcon(category: string) {
  if (category === "spreadsheet")
    return <FileSpreadsheet size={16} className="shrink-0" />;
  if (category === "presentation")
    return <Presentation size={16} className="shrink-0" />;
  if (category === "document")
    return <FileType size={16} className="shrink-0" />;
  return <FileText size={16} className="shrink-0" />;
}

function fileExtension(item: FileItem): string {
  const ext = item.originalFilename.split(".").pop()?.toUpperCase();
  return ext ?? item.category.toUpperCase();
}

export function FilesPopover({
  colors,
  label,
  bottom,
  right,
  onClose,
}: PopoverProps) {
  const items = useStore(filesStore, (s) => s.items);
  const status = useStore(filesStore, (s) => s.status);
  const uploadStatus = useStore(filesStore, (s) => s.uploadStatus);
  const sendFileLabel = useStore(
    extensionStore,
    (s) => s.config?.widget.menu?.filesSendLabel ?? "",
  );
  const editLabel = useStore(
    extensionStore,
    (s) => s.config?.widget.menu?.filesEditLabel ?? "",
  );
  const aiEnableLabel = useStore(
    extensionStore,
    (s) => s.config?.widget.menu?.filesAIEnableLabel ?? "",
  );
  const aiDisableLabel = useStore(
    extensionStore,
    (s) => s.config?.widget.menu?.filesAIDisableLabel ?? "",
  );
  const deleteLabel = useStore(
    extensionStore,
    (s) => s.config?.widget.menu?.filesDeleteLabel ?? "",
  );
  const deleteConfirmLabel = useStore(
    extensionStore,
    (s) => s.config?.widget.menu?.filesDeleteConfirmLabel ?? "",
  );
  const attachHint = useStore(
    extensionStore,
    (s) => s.config?.widget.menu?.filesAttachHint ?? "",
  );
  const windowDims = useStore(stylesStore, (s) => s.styles?.windows.files);
  const [dragging, setDragging] = useState<string | null>(null);
  const [isFileOver, setIsFileOver] = useState(false);
  const dragDepthRef = useRef(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchFiles();
  }, []);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) uploadFile(file);
    e.target.value = "";
  }

  function isOSFileDrag(e: DragEvent<HTMLDivElement>): boolean {
    return e.dataTransfer.types.includes("Files");
  }

  function handleListDragEnter(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    if (!isOSFileDrag(e)) return;
    dragDepthRef.current += 1;
    setIsFileOver(true);
  }

  function handleListDragOver(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    if (!isOSFileDrag(e)) return;
    e.dataTransfer.dropEffect = "copy";
  }

  function handleListDragLeave(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    if (!isOSFileDrag(e)) return;
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) setIsFileOver(false);
  }

  function handleListDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    dragDepthRef.current = 0;
    setIsFileOver(false);
    if (!isOSFileDrag(e)) return;
    Array.from(e.dataTransfer.files).forEach(uploadFile);
  }

  if (!windowDims) return null;

  return (
    <Window
      colors={colors}
      icon={<FolderOpen size={14} className="shrink-0 text-white/60" />}
      title={label}
      bottom={bottom}
      right={right}
      {...windowDims}
      actions={[
        {
          icon: <Upload size={13} />,
          tooltip: sendFileLabel,
          loading: uploadStatus === "loading",
          onClick: () => inputRef.current?.click(),
        },
      ]}
      onClose={onClose}
      disclaimer={attachHint}
    >
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        onChange={handleFileChange}
      />

      <div
        className="py-1 flex-1 overflow-y-auto rounded-md transition-colors"
        style={
          isFileOver
            ? {
                boxShadow: `inset 0 0 0 1px ${colors.itemSecondaryHoverBackground}`,
                background: colors.itemSecondaryHoverBackground,
              }
            : undefined
        }
        onDragEnter={handleListDragEnter}
        onDragOver={handleListDragOver}
        onDragLeave={handleListDragLeave}
        onDrop={handleListDrop}
      >
        {status === "loading" && items.length === 0 && (
          <div className="py-4 px-3 flex flex-col gap-2">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-10 rounded-md bg-white/5 animate-pulse"
              />
            ))}
          </div>
        )}
        {items.map((item) => (
          <FileRow
            key={item.id}
            item={item}
            isDragging={dragging === item.id}
            hoverBg={colors.itemSecondaryHoverBackground}
            editLabel={editLabel}
            aiEnableLabel={aiEnableLabel}
            aiDisableLabel={aiDisableLabel}
            deleteLabel={deleteLabel}
            deleteConfirmLabel={deleteConfirmLabel}
            onDragStart={() => setDragging(item.id)}
            onDragEnd={() => setDragging(null)}
            onAttach={() => {
              void triggerAttach(item);
            }}
          />
        ))}
      </div>
    </Window>
  );
}

interface FileRowProps {
  item: FileItem;
  isDragging: boolean;
  hoverBg: string;
  editLabel: string;
  aiEnableLabel: string;
  aiDisableLabel: string;
  deleteLabel: string;
  deleteConfirmLabel: string;
  onDragStart: () => void;
  onDragEnd: () => void;
  onAttach: () => void;
}

function FileRow({
  item,
  isDragging,
  hoverBg,
  editLabel,
  aiEnableLabel,
  aiDisableLabel,
  deleteLabel,
  deleteConfirmLabel,
  onDragStart,
  onDragEnd,
  onAttach,
}: FileRowProps) {
  const [hovered, setHovered] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draftName, setDraftName] = useState(item.name);
  const inputRef = useRef<HTMLInputElement>(null);
  const badgeBackground = useStore(
    stylesStore,
    (s) => s.styles?.filesPopover.badgeBackground ?? "transparent",
  );
  const badgeColor = useStore(
    stylesStore,
    (s) => s.styles?.filesPopover.badgeColor ?? "inherit",
  );

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  useEffect(() => {
    if (!editing) setDraftName(item.name);
  }, [item.name, editing]);

  function commitRename() {
    const next = draftName.trim();
    if (next && next !== item.name) {
      renameFile(item.id, next);
    } else {
      setDraftName(item.name);
    }
    setEditing(false);
  }

  function cancelRename() {
    setDraftName(item.name);
    setEditing(false);
  }

  function handleEditClick(e: React.MouseEvent) {
    e.stopPropagation();
    setEditing(true);
  }

  function handleDeleteClick(e: React.MouseEvent) {
    e.stopPropagation();
    if (window.confirm(deleteConfirmLabel)) {
      deleteFile(item.id);
    }
  }

  function handleToggleAIClick(e: React.MouseEvent) {
    e.stopPropagation();
    toggleFileAI(item.id);
  }

  const disabledForAI = item.disabledForAI ?? false;
  const aiToggleLabel = disabledForAI ? aiEnableLabel : aiDisableLabel;

  return (
    <div
      draggable={!editing}
      className="flex items-center gap-2.5 px-3 py-2 mx-1 rounded-md cursor-pointer transition-opacity"
      style={{
        background: hovered ? hoverBg : "transparent",
        opacity: isDragging ? 0.4 : 1,
        width: "calc(100% - 8px)",
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={() => {
        if (!editing) onAttach();
      }}
      onDragStart={(e) => {
        if (editing) {
          e.preventDefault();
          return;
        }
        e.dataTransfer.setData("text/plain", item.name);
        e.dataTransfer.setData("application/x-vigogh-text", item.name);
        e.dataTransfer.setData(
          "application/x-vigogh-file",
          JSON.stringify({
            id: item.id,
            originalFilename: item.originalFilename,
            mimeType: item.mimeType,
            downloadUrl: item.downloadUrl,
          }),
        );
        e.dataTransfer.effectAllowed = "copy";
        onDragStart();
      }}
      onDragEnd={onDragEnd}
    >
      <span className="text-white/50">{categoryIcon(item.category)}</span>
      {editing ? (
        <input
          ref={inputRef}
          value={draftName}
          onChange={(e) => setDraftName(e.target.value)}
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commitRename();
            } else if (e.key === "Escape") {
              e.preventDefault();
              cancelRename();
            }
          }}
          onBlur={commitRename}
          className="flex-1 text-sm text-white bg-transparent outline-none border-b border-white/30 min-w-0"
        />
      ) : (
        <span className="flex-1 text-sm text-white truncate">{item.name}</span>
      )}
      <span
        className="text-[10px] font-medium px-1.5 py-0.5 rounded shrink-0"
        style={{ background: badgeBackground, color: badgeColor }}
      >
        {fileExtension(item)}
      </span>
      {hovered && !editing && (
        <>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-label={editLabel}
                onClick={handleEditClick}
                className="shrink-0 text-white/60 hover:text-white transition-colors p-0.5 rounded cursor-pointer"
              >
                <Pencil size={12} />
              </button>
            </TooltipTrigger>
            <TooltipContent>{editLabel}</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-label={aiToggleLabel}
                onClick={handleToggleAIClick}
                className="shrink-0 text-white/60 hover:text-white transition-colors p-0.5 rounded cursor-pointer"
              >
                {disabledForAI ? <BotOff size={12} /> : <Bot size={12} />}
              </button>
            </TooltipTrigger>
            <TooltipContent>{aiToggleLabel}</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-label={deleteLabel}
                onClick={handleDeleteClick}
                className="shrink-0 text-white/60 hover:text-white transition-colors p-0.5 rounded cursor-pointer"
              >
                <Trash2 size={12} />
              </button>
            </TooltipTrigger>
            <TooltipContent>{deleteLabel}</TooltipContent>
          </Tooltip>
        </>
      )}
    </div>
  );
}
