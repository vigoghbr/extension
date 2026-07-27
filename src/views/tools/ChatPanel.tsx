import { useEffect, useRef, useState } from "react";
import { useStore } from "zustand";
import { Bot, Copy, Send } from "lucide-react";
import { chatStore, sendChatMessage } from "@/stores/tools/chatStore";
import { extensionStore } from "@/stores/extensionStore";
import { stylesStore } from "@/stores/stylesStore";
import { emitSuccessToastr } from "@/libs/toast";
import cn from "@/libs/cn";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/views/ui/tooltip";
import type { ThemeColorSet } from "@/types";

interface ChatPanelProps {
  colors: ThemeColorSet;
}

export function ChatPanel({ colors }: ChatPanelProps) {
  const messages = useStore(chatStore, (s) => s.messages);
  const status = useStore(chatStore, (s) => s.status);
  const errorCode = useStore(chatStore, (s) => s.errorCode);
  const fullConfig = extensionStore.getState();
  const vigoghMenu = useStore(extensionStore, (s) => s.config?.aiMenu.vigoghMenu);
  const chatDisclaimer = vigoghMenu?.chatDisclaimerText ?? "";
  const emptyHelpLabel = vigoghMenu?.chatEmptyHelp ?? "";
  const emptyExamples = vigoghMenu?.chatEmptyExamples ?? [];
  const placeholderLabel = vigoghMenu?.chatPlaceholder ?? "";
  const sendLabel = vigoghMenu?.chatSend ?? "";
  const copyLabel = vigoghMenu?.chatCopyTooltip ?? "";
  const maxLength = useStore(
    extensionStore,
    (s) => s.config!.aiMenu.chat.maxLength,
  );
  const chatStyles = useStore(stylesStore, (s) => s.styles?.chatPanel);
  const emptyIconSize = chatStyles?.emptyIconSize ?? 28;
  const examplesMaxWidth = chatStyles?.examplesMaxWidth ?? "260px";
  const messageMaxWidth = chatStyles?.messageMaxWidth ?? "85%";
  const copyIconSize = chatStyles?.copyIconSize ?? 12;
  const [input, setInput] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const loaderRef = useRef<HTMLDivElement>(null);
  const lastAssistantRef = useRef<HTMLDivElement>(null);
  const lastAssistantIdRef = useRef<string | null>(null);

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  useEffect(() => {
    if (status === "loading") {
      loaderRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === "bot") {
        if (messages[i].id !== lastAssistantIdRef.current) {
          lastAssistantIdRef.current = messages[i].id;
          lastAssistantRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
        }
        break;
      }
    }
  }, [status, messages]);

  let lastAssistantIndex = -1;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === "bot") {
      lastAssistantIndex = i;
      break;
    }
  }

  const handleSubmit = () => {
    if (!input.trim() || status === "loading") return;
    const text = input;
    setInput("");
    sendChatMessage(text);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleCopy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch (_) {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand("copy"); } catch (_) {}
      document.body.removeChild(ta);
    }
    emitSuccessToastr("CHAT_COPIED");
  };

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="flex-1 overflow-y-auto px-3 py-2 flex flex-col gap-2 min-h-0">
        {messages.length === 0 && status !== "loading" && (
          <div className="flex flex-col items-center justify-center h-full px-2 text-center">
            <Bot size={emptyIconSize} className="text-white/40 mb-3" />
            <span className="text-xs italic text-white/80">{emptyHelpLabel}</span>
            {emptyExamples.length > 0 && (
              <div className="flex flex-col gap-1.5 w-full mt-6" style={{ maxWidth: examplesMaxWidth }}>
                {emptyExamples.map((example) => (
                  <button
                    key={example}
                    type="button"
                    className="text-left text-xs text-white/80 hover:text-white bg-white/5 hover:bg-white/10 border border-white/10 rounded-md px-2.5 py-1.5 cursor-pointer transition-colors"
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      sendChatMessage(example);
                    }}
                  >
                    {example}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {messages.map((msg, index) => (
          <div
            key={msg.id}
            ref={index === lastAssistantIndex ? lastAssistantRef : undefined}
            className={cn("flex flex-col", msg.role === "user" ? "self-end items-end" : "self-start items-start")}
            style={{ maxWidth: messageMaxWidth }}
          >
            <div
              className={cn(
                "px-3 py-2 text-sm text-white break-words whitespace-pre-wrap select-text cursor-text",
                msg.role === "user"
                  ? "rounded-xl rounded-br-sm"
                  : "rounded-xl rounded-bl-sm",
              )}
              style={{
                userSelect: "text",
                WebkitUserSelect: "text",
                ...(msg.role === "user"
                  ? {
                      background: `linear-gradient(135deg, ${colors.buttonColor1} 0%, ${colors.buttonColor2} 100%)`,
                    }
                  : {
                      background: colors.itemSecondaryHoverBackground,
                    }),
              }}
              onMouseDown={(e) => e.stopPropagation()}
            >
              {msg.text}
            </div>
            {msg.text && (
              <div className="w-full flex justify-end mt-1">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      className="flex items-center gap-1 px-1.5 h-6 rounded bg-transparent text-white/60 hover:text-white cursor-pointer border-none text-[11px]"
                      onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleCopy(msg.text); }}
                    >
                      <span>{copyLabel}</span>
                      <Copy size={copyIconSize} />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>{copyLabel}</TooltipContent>
                </Tooltip>
              </div>
            )}
          </div>
        ))}

        {status === "loading" && (
          <div
            ref={loaderRef}
            className="flex flex-col self-start items-start"
            style={{ maxWidth: messageMaxWidth }}
          >
            <div
              className="h-8 w-[180px] rounded-xl rounded-bl-sm animate-pulse"
              style={{ background: colors.itemSecondaryHoverBackground }}
            />
          </div>
        )}

        {status === "error" && (
          <p className="text-xs text-white/50 text-center px-2 mt-1">
            {(errorCode && fullConfig.config?.messages.errors[errorCode]) ||
              fullConfig.config?.messages.errors.DEFAULT ||
              ""}
          </p>
        )}
      </div>

      <div className="h-px bg-border mx-0 my-1 shrink-0" />

      <div
        className="px-3 pb-3 pt-1 shrink-0 flex flex-col gap-1.5"
        onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; }}
        onDrop={(e) => {
          e.preventDefault();
          const text = e.dataTransfer.getData("text/plain");
          if (text) setInput((prev) => prev + text);
        }}
      >
        <div className="flex gap-2 items-end">
        <textarea
          ref={textareaRef}
          rows={1}
          className="flex-1 text-sm bg-white/5 border border-white/10 rounded-md px-2.5 py-2 text-white placeholder:text-white/70 resize-none outline-none focus:border-white/20"
          style={{ maxHeight: "80px", overflowY: "auto" }}
          placeholder={placeholderLabel}
          value={input}
          maxLength={maxLength}
          disabled={status === "loading"}
          onMouseDown={(e) => e.stopPropagation()}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
        />
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              className="vigogh-shine-btn flex items-center justify-center w-8 h-8 rounded-md text-white cursor-pointer border-none shrink-0 disabled:opacity-40"
              disabled={!input.trim() || status === "loading"}
              onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleSubmit(); }}
            >
              <Send size={13} />
            </button>
          </TooltipTrigger>
          <TooltipContent>{sendLabel}</TooltipContent>
        </Tooltip>
        </div>
        <div className="w-full text-center">
          <span className="text-[10px] text-white/60">
            {input.length}/{maxLength}
          </span>
        </div>
        {chatDisclaimer && (
          <p className="m-0 mt-1 text-center text-white/50 text-[10px] leading-snug">
            {chatDisclaimer}
          </p>
        )}
      </div>
    </div>
  );
}
