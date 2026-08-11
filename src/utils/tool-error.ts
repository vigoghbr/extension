import { toastr } from "@/libs/toastr";
import { chatStore } from "@/stores/tools/chatStore";
import { filesStore } from "@/stores/tools/filesStore";
import { toolsStore } from "@/stores/tools/toolsStore";

let forceCloseHandler: (() => void) | null = null;

export function setForceCloseWidget(fn: () => void): void {
  forceCloseHandler = fn;
}

export function handleToolError(): void {
  toastr.error(null, { id: "vigogh-error-default" });

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
