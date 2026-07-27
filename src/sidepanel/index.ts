import { initLogger, logger } from "@/libs/logger";
import { SIDEPANEL_URL } from "@/libs/constants";
import { setupIframeBridge } from "./bridge";

initLogger("sidepanel");
logger.info("sidepanel:opened");

document.addEventListener("DOMContentLoaded", () => {
  const iframe = document.querySelector<HTMLIFrameElement>("iframe");

  if (!iframe) {
    console.error("Sidepanel: No iframe found in document!");
    return;
  }

  const targetOrigin = new URL(SIDEPANEL_URL).origin;

  setupIframeBridge(iframe, targetOrigin, SIDEPANEL_URL);
});
