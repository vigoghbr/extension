import { createStore } from "zustand/vanilla";
import type { PageSessionData } from "@/types";
import { isExtensionContextValid } from "@/utils/extension-context";

type AsyncStatus = "idle" | "loading" | "success" | "error";

interface ContextState {
  status: AsyncStatus;
}

export const contextStore = createStore<ContextState>()(() => ({
  status: "idle",
}));

export function prepareToolContext(): Promise<void> {
  if (!isExtensionContextValid()) return Promise.resolve();

  contextStore.setState({ status: "loading" });

  return new Promise<void>((resolve) => {
    chrome.runtime.sendMessage(
      { action: "capture_page", silent: true },
      (res: { success?: boolean; data?: PageSessionData } | undefined) => {
        if (chrome.runtime.lastError || !res?.success || !res.data) {
          contextStore.setState({ status: "error" });
          resolve();
          return;
        }

        resolve();

        chrome.runtime.sendMessage(
          {
            action: "prepare_context_request",
            pageURL: res.data.pageURL,
            pageContent: res.data.pageContent,
            pageMetadata: res.data.pageMetadata,
            pageForms: res.data.pageForms,
            pageScreenshot: res.data.pageScreenshot,
          },
          (contextRes: { success?: boolean } | undefined) => {
            if (chrome.runtime.lastError || !contextRes?.success) {
              contextStore.setState({ status: "error" });
              return;
            }
            contextStore.setState({ status: "success" });
          },
        );
      },
    );
  });
}
