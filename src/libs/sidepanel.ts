import { hasValidSession } from "@/libs/auth";
import { toast } from "@/libs/toast";
import { extensionStore } from "@/stores/extensionStore";
import { isExtensionContextValid } from "@/utils/extension-context";

const PENDING_ROUTE_KEY = "vigogh-pending-route";
const PLANS_PATH = "/sidepanel/plan";

export async function openSidePanelForTab(
  tabId: number | undefined,
  windowId: number | undefined,
): Promise<boolean> {
  try {
    if (tabId !== undefined) {
      await chrome.sidePanel.open({ tabId });
      return true;
    }
    if (windowId !== undefined) {
      await chrome.sidePanel.open({ windowId });
      return true;
    }
  } catch {}
  return false;
}

export async function openSidePanelFromActiveTab(): Promise<boolean> {
  try {
    const tabs = await chrome.tabs.query({
      active: true,
      lastFocusedWindow: true,
    });
    const tab = tabs[0];
    return openSidePanelForTab(tab?.id, tab?.windowId);
  } catch {
    return false;
  }
}

export function openSidePanel(): Promise<boolean> {
  if (!isExtensionContextValid()) return Promise.resolve(false);
  if (typeof window === "undefined") {
    return openSidePanelFromActiveTab();
  }
  return new Promise<boolean>((resolve) => {
    try {
      chrome.runtime.sendMessage({ action: "open_side_panel" }, (response) => {
        void chrome.runtime.lastError;
        resolve(!!response?.ok);
      });
    } catch {
      resolve(false);
    }
  });
}

export async function navigateSidepanel(path: string): Promise<void> {
  if (!isExtensionContextValid()) return;

  try {
    await chrome.storage.local.set({ [PENDING_ROUTE_KEY]: path });
  } catch {}

  await openSidePanel();

  try {
    chrome.runtime.sendMessage({ action: "navigate_sidepanel", path }, () => {
      void chrome.runtime.lastError;
    });
  } catch {}
}

export function openPlansScreen(): Promise<void> {
  return navigateSidepanel(PLANS_PATH);
}

export function requireSession(action: () => void): boolean {
  if (hasValidSession()) {
    action();
    return true;
  }
  void openSidePanel();
  const errors = extensionStore.getState().config?.messages.errors;
  const message = errors?.UNAUTHORIZED || errors?.default;
  if (message) {
    toast.error(message, { id: "vigogh-error-UNAUTHORIZED" });
  }
  return false;
}
