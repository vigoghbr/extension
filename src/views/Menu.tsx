import { FolderOpen, NotebookPen, Settings, Zap } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useStore } from "zustand";
import { resolveIcon } from "@/libs/icons";
import { popoverTools } from "@/libs/popover";
import { openSidePanel, requireSession } from "@/libs/sidepanel";
import { extensionStore, resolveThemeColors } from "@/stores/extensionStore";
import { stylesStore } from "@/stores/stylesStore";
import {
  autocompleteStore,
  toggleAutocomplete,
} from "@/stores/tools/autocompleteStore";
import { prepareToolContext } from "@/stores/tools/contextStore";
import {
  applyTransform,
  requestAnswers,
  toolsStore,
} from "@/stores/tools/toolsStore";
import {
  closePopover,
  openChat,
  openMenu,
  setActiveInputItem,
  setDirection,
  togglePopover,
  widgetStore,
} from "@/stores/widgetStore";
import type {
  AiButtonAppearance,
  ExtensionStylesWidget,
  ThemeColorSet,
} from "@/types";
import { isExtensionContextValid } from "@/utils/extension-context";
import { resolveZIndex } from "@/utils/z-index";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/views/ui/tooltip";

const QUICK_MESSAGES_TOOL_ID = "quick-messages";

export default function Menu() {
  const config = useStore(extensionStore, (s) => s.config);
  const styles = useStore(stylesStore, (s) => s.styles);
  const autocompleteDisabled = useStore(extensionStore, (s) => s.disabled);
  const userToolsEnabled = useStore(extensionStore, (s) => s.userToolsEnabled);
  const quickMessagesEnabled =
    userToolsEnabled[QUICK_MESSAGES_TOOL_ID] !== false;
  const overlayVisible = useStore(autocompleteStore, (s) => s.overlayVisible);
  const hasEditorText = useStore(toolsStore, (s) => s.hasEditorText);
  const activePopovers = useStore(widgetStore, (s) => s.activePopovers);
  const chatOpen = useStore(widgetStore, (s) => s.chatOpen);
  const activeInputItem = useStore(widgetStore, (s) => s.activeInputItem);
  const [pos, setPos] = useState<{ bottom: number; right: number } | null>(
    null,
  );
  const [appearance, setAppearance] = useState<AiButtonAppearance | null>(null);
  const [menuHovered, setMenuHovered] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const circleRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chrome.storage.local
      .get<{ "vigogh-ai-button-appearance"?: AiButtonAppearance }>(
        "vigogh-ai-button-appearance",
      )
      .then((stored) => {
        const saved = stored["vigogh-ai-button-appearance"] ?? null;
        setAppearance(saved);
      })
      .catch(() => {});
    const handleStorageChange = (
      changes: Record<string, chrome.storage.StorageChange>,
    ) => {
      if ("vigogh-ai-button-appearance" in changes) {
        setAppearance(
          (changes["vigogh-ai-button-appearance"].newValue as
            | AiButtonAppearance
            | undefined) ?? null,
        );
      }
    };
    chrome.storage.local.onChanged.addListener(handleStorageChange);
    return () =>
      chrome.storage.local.onChanged.removeListener(handleStorageChange);
  }, []);

  useEffect(() => {
    if (overlayVisible && !autocompleteDisabled) openMenu();
  }, [overlayVisible, autocompleteDisabled]);

  useEffect(() => {
    const handleMouseDown = (e: MouseEvent) => {
      const path = e.composedPath();
      const inCircle = circleRef.current && path.includes(circleRef.current);
      const inMenu = menuRef.current && path.includes(menuRef.current);
      if (inCircle || inMenu) return;
      if (menuOpen) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleMouseDown, true);
    return () =>
      document.removeEventListener("mousedown", handleMouseDown, true);
  }, [menuOpen]);

  if (!config || !styles) return null;
  const menu = config.widget.menu;
  if (!menu) return null;

  const handleItemClick = (action: () => void) => () => {
    setMenuOpen(false);
    void prepareToolContext().then(() => {
      action();
    });
  };

  const handleItemClickNoContext = (action: () => void) => () => {
    setMenuOpen(false);
    action();
  };

  const widgetConfig = config.widget;
  const colors: ThemeColorSet = resolveThemeColors(config, appearance);

  const effectiveBottom = pos?.bottom ?? parseFloat(widgetConfig.bottom);
  const effectiveRight = pos?.right ?? parseFloat(widgetConfig.right);
  const shineDuration = widgetConfig.shineDuration;
  const sweepDuration = widgetConfig.sweepDuration;
  const loadingDuration = widgetConfig.loadingAnimation.duration;

  const circleSize = styles.widget.baseCircleSize;
  const effectiveMenuWidth = Math.max(
    styles.widget.menuWidthMin,
    Math.round(
      circleSize * (styles.widget.menuWidth / styles.widget.circleSize),
    ),
  );
  const pillWidth = effectiveMenuWidth + styles.widget.pillPadding * 2;
  const popoverRight = effectiveRight + pillWidth + styles.widget.popoverGap;
  const pillFontSize = styles.widget.baseFontSize;
  const pillIconSize = styles.widget.baseIconSize;
  const pillPaddingV = styles.widget.basePaddingV;
  const pillPaddingH = styles.widget.basePaddingH;
  const logoHeight = styles.widget.logoHeight;
  const scaledGap = styles.widget.pillGap;
  const pillBorderRadius = styles.widget.pillBorderRadius;

  const menuLabels = menu;
  const menuBorderRadius = widgetConfig.menuBorderRadius;

  const cssVars = `
:host {
  --ai-btn-c1: ${colors.buttonColor1};
  --ai-btn-c2: ${colors.buttonColor2};
  --ai-btn-shine-duration: ${shineDuration};
  --ai-btn-sweep-duration: ${sweepDuration};
  --ai-btn-border-radius: 50%;
  --ai-btn-load-c1: ${colors.loadingColors[0]};
  --ai-btn-load-c2: ${colors.loadingColors[1]};
  --ai-btn-load-c3: ${colors.loadingColors[2]};
  --ai-btn-load-duration: ${loadingDuration};
  --item-hover-bg: ${colors.itemSecondaryHoverBackground};
  --shine-btn-bg: ${styles.shineButton.background};
  --shine-btn-sweep: ${styles.shineButton.sweepColor};
}`.trim();

  const handleDragMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const target = menuRef.current!;
    const rect = target.getBoundingClientRect();
    const startX = e.clientX;
    const startY = e.clientY;
    const offsetX = e.clientX - rect.left;
    const offsetY = e.clientY - rect.top;
    let moved = false;
    const MARGIN = styles.widget.dragMarginPx;
    const threshold = styles.widget.dragThresholdPx;
    const onMove = (ev: MouseEvent) => {
      if (
        !moved &&
        Math.hypot(ev.clientX - startX, ev.clientY - startY) < threshold
      )
        return;
      moved = true;
      const pw = target.offsetWidth;
      const ph = target.offsetHeight;
      const left = Math.max(
        MARGIN,
        Math.min(window.innerWidth - pw - MARGIN, ev.clientX - offsetX),
      );
      const top = Math.max(
        MARGIN,
        Math.min(window.innerHeight - ph - MARGIN, ev.clientY - offsetY),
      );
      setPos({
        bottom: window.innerHeight - top - ph,
        right: window.innerWidth - left - pw,
      });
    };
    const onUp = () => {
      document.removeEventListener("mousemove", onMove, true);
      document.removeEventListener("mouseup", onUp, true);
    };
    document.addEventListener("mousemove", onMove, true);
    document.addEventListener("mouseup", onUp, true);
  };

  const widgetZIndex = resolveZIndex(
    { isHovered: menuOpen || menuHovered },
    styles.zLayers,
  );

  return (
    <>
      <style>{cssVars}</style>

      <div
        id="vigogh-ai-button"
        ref={circleRef}
        style={{
          position: "fixed",
          bottom: `${effectiveBottom}px`,
          right: `${effectiveRight}px`,
          zIndex: widgetZIndex,
          width: `${circleSize}px`,
          height: `${circleSize}px`,
          borderRadius: "50%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: "pointer",
          background: `linear-gradient(${styles.widget.circleOverlay}, ${styles.widget.circleOverlay}), linear-gradient(135deg, ${colors.buttonColor1}, ${colors.buttonColor2})`,
          backdropFilter: "blur(16px)",
          WebkitBackdropFilter: "blur(16px)",
          border: `1px solid ${colors.menuBorderColor}`,
          boxShadow: colors.containerShadow,
          opacity: menuOpen ? 0 : 0.45,
          transform: menuOpen
            ? `scale(${styles.widget.circleClosedScale})`
            : "scale(1)",
          transition: `opacity ${styles.widget.circleTransitionMs}ms ease, transform ${styles.widget.circleTransitionMs}ms ease`,
          pointerEvents: menuOpen ? "none" : "auto",
        }}
        onMouseEnter={() => setMenuOpen(true)}
        onClick={() =>
          window.open(widgetConfig.appUrl, "_blank", "noopener,noreferrer")
        }
      >
        <img
          src={chrome.runtime.getURL(
            colors.iconVariant === "white"
              ? "white-icon128.png"
              : "icon128.png",
          )}
          style={{
            width: `${styles.widget.circleIconSize}px`,
            height: `${styles.widget.circleIconSize}px`,
            objectFit: "contain",
            display: "block",
            pointerEvents: "none",
          }}
          alt="Vigogh"
        />
      </div>

      <div
        ref={menuRef}
        style={{
          position: "fixed",
          bottom: `${effectiveBottom}px`,
          right: `${effectiveRight}px`,
          zIndex: widgetZIndex,
          display: "flex",
          flexDirection: "column",
          alignItems: "stretch",
          gap: `${styles.widget.pillGap}px`,
          padding: `${styles.widget.pillPadding}px`,
          minWidth: `${effectiveMenuWidth + styles.widget.pillPadding * 2}px`,
          background: colors.menuBackground,
          backdropFilter: "blur(16px)",
          WebkitBackdropFilter: "blur(16px)",
          border: `1px solid ${colors.menuBorderColor}`,
          borderRadius: menuBorderRadius,
          boxShadow: colors.containerShadow,
          overflow: "hidden",
          opacity: menuOpen ? 1 : 0,
          transform: menuOpen
            ? "scale(1)"
            : `scale(${styles.widget.menuClosedScale})`,
          transformOrigin: "bottom right",
          transition: `opacity ${styles.widget.menuTransitionMs}ms ease, transform ${styles.widget.menuTransitionMs}ms cubic-bezier(0.34, 1.56, 0.64, 1)`,
          pointerEvents: menuOpen ? "auto" : "none",
        }}
        onMouseEnter={() => setMenuHovered(true)}
        onMouseLeave={() => setMenuHovered(false)}
      >
        <PanelGlassOrbs
          c1={colors.buttonColor1}
          c2={colors.buttonColor2}
          paused={!menuHovered}
          orbs={styles.widget.panelOrbs}
        />
        <div
          style={{
            position: "relative",
            zIndex: 1,
            display: "flex",
            flexDirection: "column",
            gap: `${scaledGap}px`,
          }}
        >
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                style={{
                  width: "100%",
                  borderRadius: pillBorderRadius,
                  border: "none",
                  overflow: "hidden",
                  cursor: "grab",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: styles.widget.logoButtonPadding,
                  flexShrink: 0,
                  background: "transparent",
                }}
                onMouseDown={handleDragMouseDown}
              >
                <img
                  src={chrome.runtime.getURL(
                    colors.iconVariant === "white"
                      ? "white-logo.png"
                      : "logo.png",
                  )}
                  style={{
                    height: `${logoHeight}px`,
                    objectFit: "contain",
                    display: "block",
                  }}
                  alt="Vigogh"
                />
              </button>
            </TooltipTrigger>
            <TooltipContent>{config.messages.info.DRAG_LABEL}</TooltipContent>
          </Tooltip>

          {widgetConfig.tools
            .filter((item) => item.enabled !== false)
            .map((item) => {
              const Icon = resolveIcon(item.icon);
              if (item.type === "answer") {
                return (
                  <PillButton
                    key={item.id}
                    icon={<Icon size={pillIconSize} />}
                    label={item.label ?? ""}
                    active={activeInputItem?.id === item.id}
                    activeBackground={colors.accentActiveBackground}
                    activeBorderColor={styles.widget.pillActiveBorderColor}
                    hoverTransitionMs={styles.widget.pillHoverTransitionMs}
                    hoverBg={colors.itemSecondaryHoverBackground}
                    textColor={colors.textColor}
                    fontSize={pillFontSize}
                    paddingV={pillPaddingV}
                    paddingH={pillPaddingH}
                    borderRadius={pillBorderRadius}
                    onClick={handleItemClick(() => {
                      requireSession(() => {
                        setDirection("");
                        const itemPages = item.pages?.length
                          ? item.pages
                          : [{ type: "options" as const }];
                        const itemFirstPage = itemPages[0]?.type ?? "options";
                        setActiveInputItem(item);
                        if (itemFirstPage === "options") {
                          requestAnswers(item.id);
                        } else {
                          openMenu();
                        }
                      });
                    })}
                  />
                );
              }
              if (
                item.type === "toggle" &&
                item.toggleTarget === "autocomplete"
              ) {
                return (
                  <PillButton
                    key={item.id}
                    icon={<Icon size={pillIconSize} />}
                    label={item.label ?? ""}
                    active={!autocompleteDisabled}
                    activeBackground={colors.toggleEnabledBackground}
                    activeBorderColor={styles.widget.pillActiveBorderColor}
                    hoverTransitionMs={styles.widget.pillHoverTransitionMs}
                    hoverBg={colors.itemSecondaryHoverBackground}
                    textColor={colors.textColor}
                    fontSize={pillFontSize}
                    paddingV={pillPaddingV}
                    paddingH={pillPaddingH}
                    borderRadius={pillBorderRadius}
                    onClick={
                      autocompleteDisabled
                        ? handleItemClick(() => toggleAutocomplete())
                        : handleItemClickNoContext(() => toggleAutocomplete())
                    }
                  />
                );
              }
              if (item.type === "link") {
                return (
                  <PillButton
                    key={item.id}
                    icon={<Icon size={pillIconSize} />}
                    label={item.label ?? ""}
                    active={item.linkAction === "open_chat" && chatOpen}
                    activeBackground={colors.toggleEnabledBackground}
                    activeBorderColor={styles.widget.pillActiveBorderColor}
                    hoverTransitionMs={styles.widget.pillHoverTransitionMs}
                    hoverBg={colors.itemSecondaryHoverBackground}
                    textColor={colors.textColor}
                    fontSize={pillFontSize}
                    paddingV={pillPaddingV}
                    paddingH={pillPaddingH}
                    borderRadius={pillBorderRadius}
                    onClick={handleItemClick(() => {
                      if (item.linkAction === "open_chat") {
                        requireSession(() => {
                          openMenu();
                          openChat();
                        });
                      } else if (item.linkAction === "open_app") {
                        closePopover();
                        window.open(
                          widgetConfig.appUrl,
                          "_blank",
                          "noopener,noreferrer",
                        );
                      } else if (item.href) {
                        closePopover();
                        window.open(item.href, "_blank", "noopener,noreferrer");
                      }
                    })}
                  />
                );
              }
              return null;
            })}

          <PillButton
            icon={<FolderOpen size={pillIconSize} />}
            label={menuLabels.filesLabel}
            active={activePopovers.includes("files")}
            activeBackground={colors.toggleEnabledBackground}
            activeBorderColor={styles.widget.pillActiveBorderColor}
            hoverTransitionMs={styles.widget.pillHoverTransitionMs}
            hoverBg={colors.itemSecondaryHoverBackground}
            textColor={colors.textColor}
            fontSize={pillFontSize}
            paddingV={pillPaddingV}
            paddingH={pillPaddingH}
            borderRadius={pillBorderRadius}
            onClick={handleItemClickNoContext(() =>
              requireSession(() => togglePopover("files")),
            )}
          />
          <PillButton
            icon={<NotebookPen size={pillIconSize} />}
            label={menuLabels.notesLabel}
            active={activePopovers.includes("notes")}
            activeBackground={colors.toggleEnabledBackground}
            activeBorderColor={styles.widget.pillActiveBorderColor}
            hoverTransitionMs={styles.widget.pillHoverTransitionMs}
            hoverBg={colors.itemSecondaryHoverBackground}
            textColor={colors.textColor}
            fontSize={pillFontSize}
            paddingV={pillPaddingV}
            paddingH={pillPaddingH}
            borderRadius={pillBorderRadius}
            onClick={handleItemClickNoContext(() =>
              requireSession(() => togglePopover("notes")),
            )}
          />
          {quickMessagesEnabled && (
            <PillButton
              icon={<Zap size={pillIconSize} />}
              label={menuLabels.messagesLabel}
              active={activePopovers.includes("messages")}
              activeBackground={colors.toggleEnabledBackground}
              activeBorderColor={styles.widget.pillActiveBorderColor}
              hoverTransitionMs={styles.widget.pillHoverTransitionMs}
              hoverBg={colors.itemSecondaryHoverBackground}
              textColor={colors.textColor}
              fontSize={pillFontSize}
              paddingV={pillPaddingV}
              paddingH={pillPaddingH}
              borderRadius={pillBorderRadius}
              onClick={handleItemClickNoContext(() =>
                requireSession(() => togglePopover("messages")),
              )}
            />
          )}

          {hasEditorText &&
            widgetConfig.transforms.filter((item) => item.enabled !== false)
              .length > 0 && (
              <>
                <div
                  style={{
                    height: "1px",
                    background: colors.dividerColor,
                    margin: "2px 4px",
                  }}
                />
                {widgetConfig.transforms
                  .filter((item) => item.enabled !== false)
                  .map((item) => {
                    const Icon = resolveIcon(item.icon);
                    return (
                      <PillButton
                        key={item.id}
                        icon={<Icon size={pillIconSize} />}
                        label={item.label ?? ""}
                        active={false}
                        activeBackground={colors.accentActiveBackground}
                        activeBorderColor={styles.widget.pillActiveBorderColor}
                        hoverTransitionMs={styles.widget.pillHoverTransitionMs}
                        hoverBg={colors.itemSecondaryHoverBackground}
                        textColor={colors.textColor}
                        fontSize={pillFontSize}
                        paddingV={pillPaddingV}
                        paddingH={pillPaddingH}
                        borderRadius={pillBorderRadius}
                        onClick={handleItemClick(() => {
                          requireSession(() => {
                            openMenu();
                            applyTransform(
                              item.id,
                              item.transformAction,
                              item.autoApply,
                            );
                          });
                        })}
                      />
                    );
                  })}
              </>
            )}

          <div
            style={{
              height: "1px",
              background: colors.dividerColor,
              margin: "2px 4px",
            }}
          />

          <PanelButton
            icon={<Settings size={pillIconSize} />}
            label={menuLabels.panelLabel}
            hoverBg={colors.itemSecondaryHoverBackground}
            textColor={colors.textColor}
            fontSize={pillFontSize}
            paddingV={pillPaddingV}
            paddingH={pillPaddingH}
            borderRadius={pillBorderRadius}
            hoverTransitionMs={styles.widget.pillHoverTransitionMs}
            onClick={handleItemClickNoContext(() => {
              if (!isExtensionContextValid()) return;
              void openSidePanel();
              closePopover();
            })}
          />
        </div>
      </div>

      {activePopovers.length > 0 && (
        <div>
          {activePopovers.map((popoverId, index) => {
            const tool = popoverTools.find((t) => t.popoverId === popoverId);
            if (!tool) return null;
            const stackOffset = index * 24;
            return (
              <tool.Popover
                key={tool.popoverId}
                colors={colors}
                config={widgetConfig}
                label={tool.getLabel(menuLabels)}
                bottom={effectiveBottom + stackOffset}
                right={popoverRight + stackOffset}
                onClose={() => closePopover(popoverId)}
              />
            );
          })}
        </div>
      )}
    </>
  );
}

interface PillButtonProps {
  icon: React.ReactNode;
  label: string;
  active: boolean;
  activeBackground: string;
  activeBorderColor: string;
  hoverTransitionMs: number;
  hoverBg: string;
  textColor: string;
  fontSize: number;
  paddingV: number;
  paddingH: number;
  borderRadius: string;
  onClick: () => void;
}

function PillButton({
  icon,
  label,
  active,
  activeBackground,
  activeBorderColor,
  hoverTransitionMs,
  hoverBg,
  textColor,
  fontSize,
  paddingV,
  paddingH,
  borderRadius,
  onClick,
}: PillButtonProps) {
  const [hovered, setHovered] = useState(false);

  return (
    <button
      style={{
        width: "calc(100% - 8px)",
        margin: "0 4px",
        borderRadius,
        border: active
          ? `1px solid ${activeBorderColor}`
          : "1px solid transparent",
        boxShadow: "none",
        background: active
          ? activeBackground
          : hovered
            ? hoverBg
            : "transparent",
        color: textColor,
        display: "flex",
        alignItems: "center",
        justifyContent: "flex-start",
        gap: "8px",
        cursor: "pointer",
        padding: `${paddingV}px ${paddingH}px`,
        flexShrink: 0,
        fontSize: `${fontSize}px`,
        transition: `background ${hoverTransitionMs}ms, color ${hoverTransitionMs}ms`,
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onMouseDown={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onClick();
      }}
    >
      {icon}
      {label}
    </button>
  );
}

interface PanelButtonProps {
  icon: React.ReactNode;
  label: string;
  hoverBg: string;
  textColor: string;
  fontSize: number;
  paddingV: number;
  paddingH: number;
  borderRadius: string;
  hoverTransitionMs: number;
  onClick: () => void;
}

function PanelButton({
  icon,
  label,
  hoverBg,
  textColor,
  fontSize,
  paddingV,
  paddingH,
  borderRadius,
  hoverTransitionMs,
  onClick,
}: PanelButtonProps) {
  const [hovered, setHovered] = useState(false);

  return (
    <button
      style={{
        width: "calc(100% - 8px)",
        margin: "0 4px",
        borderRadius,
        border: "none",
        background: hovered ? hoverBg : "transparent",
        color: textColor,
        display: "flex",
        alignItems: "center",
        justifyContent: "flex-start",
        gap: "8px",
        cursor: "pointer",
        padding: `${paddingV}px ${paddingH}px`,
        flexShrink: 0,
        fontSize: `${fontSize}px`,
        transition: `background ${hoverTransitionMs}ms, color ${hoverTransitionMs}ms`,
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onMouseDown={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onClick();
      }}
    >
      {icon}
      {label}
    </button>
  );
}

function PanelGlassOrbs({
  c1,
  c2,
  paused,
  orbs,
}: {
  c1: string;
  c2: string;
  paused: boolean;
  orbs: ExtensionStylesWidget["panelOrbs"];
}) {
  const state = paused ? "paused" : "running";
  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
      <div
        style={{
          position: "absolute",
          width: "80%",
          height: "80%",
          top: "-20%",
          left: "-20%",
          borderRadius: "50%",
          background: c1,
          opacity: orbs.opacityA,
          filter: `blur(${orbs.blurA})`,
          animation: `vigogh-glass-float-a ${orbs.durationA} ease-in-out infinite`,
          animationPlayState: state,
        }}
      />
      <div
        style={{
          position: "absolute",
          width: "65%",
          height: "65%",
          bottom: "-15%",
          right: "-15%",
          borderRadius: "50%",
          background: c2,
          opacity: orbs.opacityB,
          filter: `blur(${orbs.blurB})`,
          animation: `vigogh-glass-float-b ${orbs.durationB} ease-in-out infinite`,
          animationPlayState: state,
        }}
      />
    </div>
  );
}
