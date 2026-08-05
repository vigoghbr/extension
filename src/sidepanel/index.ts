import { SIDEPANEL_URL } from "@/libs/constants";
import { initLogger, logger } from "@/libs/logger";
import { setupIframeBridge } from "./bridge";

initLogger("sidepanel");
logger.info("sidepanel:opened");

document.addEventListener("DOMContentLoaded", () => {
  const iframe = document.querySelector<HTMLIFrameElement>("iframe");

  if (!iframe) {
    logger.error("sidepanel:no-iframe", {
      error: new Error("Sidepanel iframe not found in document"),
    });
    return;
  }

  const targetOrigin = new URL(SIDEPANEL_URL).origin;

  setupIframeBridge(iframe, targetOrigin, SIDEPANEL_URL);
});
