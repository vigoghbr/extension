import type { ResolvedExtensionSettings, IndicatorType } from "@/types";
import { extensionStore } from "@/stores/extensionStore";
import { stylesStore } from "@/stores/stylesStore";
import { isExtensionContextValid } from "@/utils/extension-context";

let pageIndicatorAutoHideTimer: ReturnType<typeof setTimeout> | null = null;

function clearPageIndicatorAutoHide(): void {
  if (pageIndicatorAutoHideTimer !== null) {
    clearTimeout(pageIndicatorAutoHideTimer);
    pageIndicatorAutoHideTimer = null;
  }
}

export function showIndicator(type: IndicatorType, config: ResolvedExtensionSettings): void {
  if (type === "page") {
    showPageIndicator(config);
    clearPageIndicatorAutoHide();
    pageIndicatorAutoHideTimer = setTimeout(() => {
      pageIndicatorAutoHideTimer = null;
      hideIndicator("page");
    }, config.behavior.pageIndicatorMaxDurationMs ?? 10000);
  } else if (type === "bottom-border") {
    showBottomBorderIndicator(config);
  }
}

export function hideIndicator(type: IndicatorType): void {
  if (type === "page") {
    document.getElementById("vigogh-page-indicator")?.remove();
    document.getElementById("vigogh-page-indicator-styles")?.remove();
  } else if (type === "bottom-border") {
    document.getElementById("vigogh-bottom-indicator")?.remove();
    document.getElementById("vigogh-bottom-indicator-styles")?.remove();
  }
}

function showPageIndicator(config: ResolvedExtensionSettings): void {
  document.getElementById("vigogh-page-indicator")?.remove();
  document.getElementById("vigogh-page-indicator-styles")?.remove();

  const borderCfg = config.indicators.page.border;
  if (!borderCfg.enabled) return;

  const c1 = borderCfg.color1;
  const c2 = borderCfg.color2;
  const duration = borderCfg.duration;

  const styleEl = document.createElement("style");
  styleEl.id = "vigogh-page-indicator-styles";
  styleEl.textContent = `
    @property --vigogh-c {
      syntax: '<color>';
      initial-value: ${c1};
      inherits: false;
    }
    @keyframes vigogh-border-move {
      0%   { --vigogh-c: ${c1}; }
      50%  { --vigogh-c: ${c2}; }
      100% { --vigogh-c: ${c1}; }
    }
    #vigogh-page-indicator {
      position: fixed;
      inset: 0;
      pointer-events: none;
      z-index: ${stylesStore.getState().styles?.indicators.zIndex ?? 2147483644};
      overflow: hidden;
    }
    #vigogh-page-indicator::before {
      content: '';
      position: absolute;
      inset: 8px;
      border-radius: 10px;
      box-shadow: 0 0 0 100vmax var(--vigogh-c);
      opacity: 0.55;
      animation: vigogh-border-move ${duration} ease-in-out infinite;
    }
  `.trim();

  const divEl = document.createElement("div");
  divEl.id = "vigogh-page-indicator";

  document.head.appendChild(styleEl);
  document.body.appendChild(divEl);
}

function showBottomBorderIndicator(config: ResolvedExtensionSettings): void {
  document.getElementById("vigogh-bottom-indicator")?.remove();
  document.getElementById("vigogh-bottom-indicator-styles")?.remove();

  const bbCfg = config.indicators.bottomBorder;
  if (!bbCfg.enabled) return;

  const borderCfg = config.indicators.page.border;
  const c1 = borderCfg.color1;
  const c2 = borderCfg.color2;
  const duration = bbCfg.duration;
  const loadingDuration = bbCfg.loadingDuration;
  const height = bbCfg.height;

  const styleEl = document.createElement("style");
  styleEl.id = "vigogh-bottom-indicator-styles";
  styleEl.textContent = `
    @property --vigogh-bb-c {
      syntax: '<color>';
      initial-value: ${c1};
      inherits: false;
    }
    @keyframes vigogh-bb-move {
      0%   { --vigogh-bb-c: ${c1}; }
      50%  { --vigogh-bb-c: ${c2}; }
      100% { --vigogh-bb-c: ${c1}; }
    }
    #vigogh-bottom-indicator {
      position: fixed;
      bottom: 0;
      left: 0;
      right: 0;
      height: ${height};
      pointer-events: none;
      z-index: ${stylesStore.getState().styles?.indicators.zIndex ?? 2147483644};
      background: var(--vigogh-bb-c);
      animation: vigogh-bb-move ${duration} ease-in-out infinite;
    }
    #vigogh-bottom-indicator[data-loading] {
      animation-duration: ${loadingDuration};
    }
  `.trim();

  const divEl = document.createElement("div");
  divEl.id = "vigogh-bottom-indicator";

  document.head.appendChild(styleEl);
  document.body.appendChild(divEl);
}

export function setBottomBorderLoading(isLoading: boolean): void {
  const el = document.getElementById("vigogh-bottom-indicator");
  if (!el) return;
  if (isLoading) {
    el.setAttribute("data-loading", "");
  } else {
    el.removeAttribute("data-loading");
  }
}

export function initIndicatorListener(): void {
  if (typeof chrome === "undefined" || !chrome.runtime?.onMessage) return;

  chrome.runtime.onMessage.addListener((message) => {
    if (message.action !== "indicator_event") return;
    if (!isExtensionContextValid()) return;

    const { config } = extensionStore.getState();
    if (message.show) {
      if (config) showIndicator(message.indicator, config);
    } else {
      hideIndicator(message.indicator);
    }
  });
}
