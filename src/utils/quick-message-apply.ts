import { emitSuccessToastr } from "@/libs/toast";
import { autocompleteStore } from "@/stores/tools/autocompleteStore";
import { applyTextToEditor } from "@/utils/apply-text";

export function applyQuickMessage(text: string): void {
  autocompleteStore.setState({ suppressUntilKeydown: true });
  const applied = applyTextToEditor(text);
  if (!applied) return;
  emitSuccessToastr("QUICK_MESSAGE_APPLIED");
}
