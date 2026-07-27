import { emitErrorToastr } from "@/libs/toast";
import { toolsStore } from "@/stores/tools/toolsStore";
import { chatStore } from "@/stores/tools/chatStore";
import { filesStore } from "@/stores/tools/filesStore";

let forceCloseHandler: (() => void) | null = null;

export function setForceCloseAiMenu(fn: () => void): void {
  forceCloseHandler = fn;
}

export function handleToolError(): void {
  emitErrorToastr(null, { id: "vigogh-error-default" });

  toolsStore.setState({
    status: "idle",
    suggestions: [],
    activeItemId: null,
    errorCode: null,
    toolUsageId: null,
  });
  chatStore.setState({ status: "idle", errorCode: null });
  filesStore.setState({ status: "idle", uploadStatus: "idle", error: null });

  forceCloseHandler?.();
}
