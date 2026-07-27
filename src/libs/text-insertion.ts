export function insertTextIntoContentEditable(
  editor: HTMLElement,
  text: string,
): void {
  editor.focus();

  const selection = window.getSelection();
  if (selection && selection.rangeCount > 0) {
    const range = selection.getRangeAt(0);
    range.collapse(false);
  }

  const beforeInputEvent = new InputEvent("beforeinput", {
    inputType: "insertText",
    data: text,
    bubbles: true,
    cancelable: true,
    composed: true,
  });

  const cancelled = !editor.dispatchEvent(beforeInputEvent);

  if (!cancelled) {
    const inputEvent = new InputEvent("input", {
      inputType: "insertText",
      data: text,
      bubbles: true,
      cancelable: false,
      composed: true,
    });
    editor.dispatchEvent(inputEvent);
  }

  const textAfter = editor.textContent || "";
  if (!textAfter.endsWith(text)) {
    document.execCommand("insertText", false, text);
  }

  editor.dispatchEvent(new Event("input", { bubbles: true }));
  editor.dispatchEvent(new Event("change", { bubbles: true }));
}

export function replaceAllTextInContentEditable(
  editor: HTMLElement,
  text: string,
): void {
  editor.focus();

  const selection = window.getSelection();
  if (selection) {
    const range = document.createRange();
    range.selectNodeContents(editor);
    selection.removeAllRanges();
    selection.addRange(range);
  }

  const dataTransfer = new DataTransfer();
  dataTransfer.setData("text/plain", text);

  const pasteEvent = new InputEvent("beforeinput", {
    inputType: "insertFromPaste",
    dataTransfer,
    bubbles: true,
    cancelable: true,
    composed: true,
  });

  editor.dispatchEvent(pasteEvent);

  if ((editor.textContent || "").trim() !== text.trim()) {
    const sel = window.getSelection();
    if (sel) {
      const range = document.createRange();
      range.selectNodeContents(editor);
      sel.removeAllRanges();
      sel.addRange(range);
    }
    document.execCommand("delete", false);
    document.execCommand("insertText", false, text);
  }

  const finalSel = window.getSelection();
  if (finalSel) {
    const collapseRange = document.createRange();
    collapseRange.selectNodeContents(editor);
    collapseRange.collapse(false);
    finalSel.removeAllRanges();
    finalSel.addRange(collapseRange);
  }

  editor.dispatchEvent(new Event("input", { bubbles: true }));
  editor.dispatchEvent(new Event("change", { bubbles: true }));
}

export function replaceAllTextInTextarea(
  textarea: HTMLTextAreaElement,
  text: string,
): void {
  textarea.focus();
  textarea.select();

  const nativeSetter = Object.getOwnPropertyDescriptor(
    HTMLTextAreaElement.prototype,
    "value",
  )?.set;

  if (nativeSetter) {
    nativeSetter.call(textarea, text);
  } else {
    textarea.value = text;
  }

  textarea.selectionStart = text.length;
  textarea.selectionEnd = text.length;

  textarea.dispatchEvent(new Event("input", { bubbles: true }));
  textarea.dispatchEvent(new Event("change", { bubbles: true }));
}

export function insertTextIntoTextarea(
  textarea: HTMLTextAreaElement,
  text: string,
): void {
  textarea.focus();

  const start = textarea.selectionStart ?? textarea.value.length;
  const newValue =
    textarea.value.slice(0, start) + text + textarea.value.slice(start);

  const nativeSetter = Object.getOwnPropertyDescriptor(
    HTMLTextAreaElement.prototype,
    "value",
  )?.set;

  if (nativeSetter) {
    nativeSetter.call(textarea, newValue);
  } else {
    textarea.value = newValue;
  }

  textarea.selectionStart = start + text.length;
  textarea.selectionEnd = start + text.length;

  textarea.dispatchEvent(new Event("input", { bubbles: true }));
  textarea.dispatchEvent(new Event("change", { bubbles: true }));
}
