import { applyTextWithIdentify } from "@/utils/apply-text";

export function applyQuickMessage(text: string): void {
  navigator.clipboard.writeText(text);
  applyTextWithIdentify(text, "COPIED_CLICK_TO_PASTE");
}
