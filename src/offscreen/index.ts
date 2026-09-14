import { logger } from "@/libs/logger";
import { offscreenModules } from "@/offscreen/registry";
import type { OffscreenModule } from "@/offscreen/types";
import type { ExtensionMessage } from "@/types";

const IDLE_CLOSE_DELAY_MS = 1000;

let idleTimer: ReturnType<typeof setTimeout> | null = null;

const modules: OffscreenModule[] = offscreenModules.map((create) =>
  create({ notifyIdle: () => scheduleIdleCheck() }),
);

function scheduleIdleCheck(): void {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    idleTimer = null;
    if (modules.some((module) => module.isActive())) return;
    logger.info("offscreen:closing", { reason: "idle" });
    window.close();
  }, IDLE_CLOSE_DELAY_MS);
}

function cancelIdleCheck(): void {
  if (!idleTimer) return;
  clearTimeout(idleTimer);
  idleTimer = null;
}

chrome.runtime.onMessage.addListener((message: ExtensionMessage) => {
  if (message.action === "offscreen_teardown") {
    for (const module of modules) module.teardown();
    scheduleIdleCheck();
    return false;
  }

  const target = modules.find((module) =>
    module.actions.includes(message.action),
  );
  if (!target) return false;

  cancelIdleCheck();
  target.handle(message);
  if (!modules.some((module) => module.isActive())) scheduleIdleCheck();
  return false;
});
