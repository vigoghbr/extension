import {
  resolveInitialTargetField,
  resolveStrategyForElement,
} from "@/stores/extensionStore";

export function applyTextWithIdentify(
  text: string,
  toastCode: string,
): Promise<void> {
  return resolveInitialTargetField(toastCode).promise.then((editor) => {
    const strategy = resolveStrategyForElement(editor);
    if (strategy) {
      strategy.replaceAllText(editor, text);
      return;
    }
    editor.focus();
    document.execCommand("selectAll", false);
    document.execCommand("insertText", false, text);
  });
}
