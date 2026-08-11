import { hasValidSession as hasValidAuthSession } from "@/libs/auth";
import { hasValidSessionSync } from "@/libs/session";
import { toastr } from "@/libs/toastr";
import { isExtensionContextValid } from "@/utils/extension-context";

const PENDING_ROUTE_KEY = "vigogh-pending-route";
const PLANS_PATH = "/sidepanel/plan";
const VALIDATE_SESSION_PATH = "/sidepanel/validate-session";

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

export function openValidateSessionScreen(): Promise<void> {
  return navigateSidepanel(VALIDATE_SESSION_PATH);
}

export function requireSiteSession(action: () => void): boolean {
  if (hasValidSessionSync()) {
    action();
    return true;
  }
  void openValidateSessionScreen();
  toastr.info("VALIDATING_SESSION", {
    id: "vigogh-info-VALIDATING_SESSION",
  });
  return false;
}

export function requireSession(action: () => void): boolean {
  if (!hasValidAuthSession()) {
    void openSidePanel();
    toastr.error("UNAUTHORIZED", { id: "vigogh-error-UNAUTHORIZED" });
    return false;
  }
  return requireSiteSession(action);
}
