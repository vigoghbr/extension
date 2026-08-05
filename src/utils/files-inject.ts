import { logger } from "@/libs/logger";
import { extensionStore, getActiveStrategy } from "@/stores/extensionStore";
import type { SiteFileAttachStrategy } from "@/types";

const DEFAULT_STRATEGIES: SiteFileAttachStrategy[] = [
  { type: "dragDrop" },
  {
    type: "fileInput",
    imageSelector: 'input[type="file"][accept*="image"]',
    videoSelector: 'input[type="file"][accept*="video"]',
    anySelector: 'input[type="file"]',
  },
  { type: "clipboard" },
];

function resolveStrategies(): SiteFileAttachStrategy[] {
  const { siteConfig, config } = extensionStore.getState();
  return (
    siteConfig?.fileAttach?.strategies ??
    config?.sitesFallback.fileAttach?.strategies ??
    DEFAULT_STRATEGIES
  );
}

function showPasteHint(
  target: HTMLElement,
  message: string,
  dismissMs: number,
): void {
  if (!message) return;
  const rect = target.getBoundingClientRect();
  const hint = document.createElement("div");
  hint.textContent = message;
  hint.style.cssText = `
    position: fixed;
    top: ${Math.max(rect.top - 36, 8)}px;
    left: ${rect.left}px;
    background: rgba(0,0,0,0.8);
    color: #fff;
    font: 13px/1 system-ui, sans-serif;
    padding: 6px 10px;
    border-radius: 6px;
    z-index: 2147483647;
    pointer-events: none;
  `;
  document.body.appendChild(hint);
  setTimeout(() => hint.remove(), dismissMs);
}

function isWildcardAccept(token: string): boolean {
  return token === "" || token === "*" || token === "*/*";
}

function acceptMatchesMime(
  accept: string,
  mimeType: string,
): "specific" | "wildcard" | "none" {
  if (!accept) return "wildcard";
  const tokens = accept
    .split(",")
    .map((a) => a.trim())
    .filter(Boolean);
  if (tokens.length === 0) return "wildcard";
  let hasWildcard = false;
  for (const t of tokens) {
    if (isWildcardAccept(t)) {
      hasWildcard = true;
      continue;
    }
    if (t === mimeType) return "specific";
    if (t.endsWith("/*") && mimeType.startsWith(t.slice(0, -1)))
      return "specific";
    if (t.startsWith(".")) continue;
  }
  return hasWildcard ? "wildcard" : "none";
}

function findFileInput(
  selector: string,
  mimeType: string,
): HTMLInputElement | null {
  const inputs = Array.from(
    document.querySelectorAll<HTMLInputElement>(selector),
  );
  if (inputs.length === 0) return null;
  let wildcardMatch: HTMLInputElement | null = null;
  for (const el of inputs) {
    const match = acceptMatchesMime(el.accept, mimeType);
    if (match === "specific") return el;
    if (match === "wildcard" && !wildcardMatch) wildcardMatch = el;
  }
  return wildcardMatch ?? inputs[0];
}

function setFileInput(input: HTMLInputElement, file: File): void {
  const dt = new DataTransfer();
  dt.items.add(file);
  input.files = dt.files;
  input.dispatchEvent(new Event("change", { bubbles: true }));
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

function pickSelector(
  strategy: Extract<SiteFileAttachStrategy, { type: "fileInput" }>,
  mimeType: string,
): string | null {
  if (mimeType.startsWith("image/") && strategy.imageSelector)
    return strategy.imageSelector;
  if (mimeType.startsWith("video/") && strategy.videoSelector)
    return strategy.videoSelector;
  return strategy.anySelector ?? null;
}

function tryFileInput(
  strategy: Extract<SiteFileAttachStrategy, { type: "fileInput" }>,
  file: File,
): boolean {
  const selector = pickSelector(strategy, file.type);
  if (!selector) return false;
  const input = findFileInput(selector, file.type);
  if (!input) return false;
  setFileInput(input, file);
  if (__DEV__) logger.debug("files:inject", { path: "file_input", selector });
  return true;
}

function tryPaste(file: File): boolean {
  const { currentEditor } = extensionStore.getState();
  if (!currentEditor) return false;
  const strategy = getActiveStrategy();
  if (!strategy?.pasteFile) return false;
  try {
    const ok = strategy.pasteFile(currentEditor as HTMLElement, file);
    if (ok) {
      if (__DEV__) logger.debug("files:inject", { path: "paste" });
      return true;
    }
  } catch (error) {
    logger.error("files:inject:paste-error", { error });
  }
  return false;
}

function buildDragEvent(type: string, dt: DataTransfer): DragEvent {
  const evt = new DragEvent(type, {
    bubbles: true,
    cancelable: true,
    composed: true,
    dataTransfer: dt,
  });
  try {
    Object.defineProperty(evt, "dataTransfer", { value: dt });
  } catch {}
  return evt;
}

function tryDragDrop(
  strategy: Extract<SiteFileAttachStrategy, { type: "dragDrop" }>,
  file: File,
): boolean {
  const { currentEditor } = extensionStore.getState();
  const target: HTMLElement | null = strategy.dropZoneSelector
    ? document.querySelector<HTMLElement>(strategy.dropZoneSelector)
    : ((currentEditor as HTMLElement | null) ?? document.body);
  if (!target) return false;

  const dt = new DataTransfer();
  dt.items.add(file);

  target.dispatchEvent(buildDragEvent("dragenter", dt));
  target.dispatchEvent(buildDragEvent("dragover", dt));
  const dropEvent = buildDragEvent("drop", dt);
  const consumed = !target.dispatchEvent(dropEvent);
  target.dispatchEvent(buildDragEvent("dragend", dt));

  if (__DEV__) logger.debug("files:inject", { path: "drag_drop", consumed });
  return consumed;
}

async function tryClipboard(blob: Blob, mimeType: string): Promise<boolean> {
  if (!navigator.clipboard?.write) return false;
  try {
    await navigator.clipboard.write([new ClipboardItem({ [mimeType]: blob })]);
    const { currentEditor, config } = extensionStore.getState();
    const target = (currentEditor as HTMLElement | null) ?? document.body;
    if (currentEditor) (currentEditor as HTMLElement).focus();
    const hintMessage = config?.aiMenu.vigoghMenu?.filesPasteHint ?? "";
    const dismissMs = config?.behavior.filesPasteHintDismissMs ?? 3000;
    showPasteHint(target, hintMessage, dismissMs);
    if (__DEV__) logger.debug("files:inject", { path: "clipboard" });
    return true;
  } catch (error) {
    logger.error("files:inject:clipboard-error", { error });
    return false;
  }
}

export async function attachFileToPage(
  blob: Blob,
  name: string,
  mimeType: string,
): Promise<boolean> {
  const file = new File([blob], name, { type: mimeType });
  const strategies = resolveStrategies();

  for (const strategy of strategies) {
    if (strategy.type === "fileInput") {
      if (tryFileInput(strategy, file)) return true;
    } else if (strategy.type === "paste") {
      if (tryPaste(file)) return true;
    } else if (strategy.type === "dragDrop") {
      if (tryDragDrop(strategy, file)) return true;
    } else if (strategy.type === "clipboard") {
      if (await tryClipboard(blob, mimeType)) return true;
    }
  }

  if (__DEV__) logger.debug("files:inject", { path: "noop" });
  return false;
}
