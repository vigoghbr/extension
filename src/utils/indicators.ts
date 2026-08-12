import { extensionStore } from "@/stores/extensionStore";
import { stylesStore } from "@/stores/stylesStore";
import type { IndicatorType, ResolvedExtensionSettings } from "@/types";
import { isExtensionContextValid } from "@/utils/extension-context";

export function showIndicator(
  type: IndicatorType,
  config: ResolvedExtensionSettings,
): void {
  if (type === "top-border") {
    showTopBorderIndicator(config);
  } else if (type === "bottom-border") {
    showBottomBorderIndicator(config);
  }
}

export function hideIndicator(type: IndicatorType): void {
  if (type === "top-border") {
    document.getElementById("vigogh-top-indicator")?.remove();
    document.getElementById("vigogh-top-indicator-styles")?.remove();
  } else if (type === "bottom-border") {
    document.getElementById("vigogh-bottom-indicator")?.remove();
    document.getElementById("vigogh-bottom-indicator-styles")?.remove();
  }
}

function showTopBorderIndicator(config: ResolvedExtensionSettings): void {
  document.getElementById("vigogh-top-indicator")?.remove();
  document.getElementById("vigogh-top-indicator-styles")?.remove();

  const tbCfg = config.indicators.topBorder;
  if (!tbCfg.enabled) return;

  const c1 = config.indicators.color1;
  const c2 = config.indicators.color2;
  const duration = tbCfg.duration;
  const height = tbCfg.height;

  const styleEl = document.createElement("style");
  styleEl.id = "vigogh-top-indicator-styles";
  styleEl.textContent = `
    @property --vigogh-tb-c {
      syntax: '<color>';
      initial-value: ${c1};
      inherits: false;
    }
    @keyframes vigogh-tb-move {
      0%   { --vigogh-tb-c: ${c1}; }
      50%  { --vigogh-tb-c: ${c2}; }
      100% { --vigogh-tb-c: ${c1}; }
    }
    #vigogh-top-indicator {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      height: ${height};
      pointer-events: none;
      z-index: ${stylesStore.getState().styles?.indicators.zIndex ?? 2147483644};
      background: var(--vigogh-tb-c);
      animation: vigogh-tb-move ${duration} ease-in-out infinite;
    }
  `.trim();

  const divEl = document.createElement("div");
  divEl.id = "vigogh-top-indicator";

  document.head.appendChild(styleEl);
  document.body.appendChild(divEl);
}

function showBottomBorderIndicator(config: ResolvedExtensionSettings): void {
  document.getElementById("vigogh-bottom-indicator")?.remove();
  document.getElementById("vigogh-bottom-indicator-styles")?.remove();

  const bbCfg = config.indicators.bottomBorder;
  if (!bbCfg.enabled) return;

  const c1 = config.indicators.color1;
  const c2 = config.indicators.color2;
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
