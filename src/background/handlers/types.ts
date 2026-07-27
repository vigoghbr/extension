import type { ExtensionMessage } from "@/types";

export type BackgroundMessageResult = boolean | null;

export type BackgroundMessageHandler = (
  message: ExtensionMessage,
  sender: chrome.runtime.MessageSender,
  sendResponse: (response: unknown) => void,
) => BackgroundMessageResult;
