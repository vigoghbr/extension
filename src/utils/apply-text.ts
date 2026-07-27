import { extensionStore, getActiveStrategy } from "@/stores/extensionStore";

export function applyTextToEditor(text: string): boolean {
  const { currentEditor } = extensionStore.getState();
  if (!currentEditor) return false;
  const editor = currentEditor as HTMLElement;
  const strategy = getActiveStrategy();
  if (strategy) {
    strategy.replaceAllText(editor, text);
    return true;
  }
  editor.focus();
  document.execCommand("selectAll", false);
  document.execCommand("insertText", false, text);
  return true;
}
