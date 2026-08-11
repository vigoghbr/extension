import { toastr } from "@/libs/toastr";
import { autocompleteStore } from "@/stores/tools/autocompleteStore";
import { applyTextWithIdentify } from "@/utils/apply-text";

export function applyQuickMessage(text: string): void {
  autocompleteStore.setState({ suppressUntilKeydown: true });
  applyTextWithIdentify(text, "SELECT_APPLY_TARGET").then(() => {
    toastr.success("QUICK_MESSAGE_APPLIED");
  });
}
