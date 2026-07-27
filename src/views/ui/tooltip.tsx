import { Tooltip as TooltipPrimitive } from "radix-ui";
import { createContext, useContext } from "react";
import type * as React from "react";

import cn from "@/libs/cn";

const TooltipPortalContext = createContext<HTMLElement | null>(null);

function TooltipProvider({
  delayDuration = 0,
  portalContainer,
  children,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Provider> & { portalContainer?: HTMLElement | null }) {
  return (
    <TooltipPortalContext.Provider value={portalContainer ?? null}>
      <TooltipPrimitive.Provider
        data-slot="tooltip-provider"
        delayDuration={delayDuration}
        {...props}
      >
        {children}
      </TooltipPrimitive.Provider>
    </TooltipPortalContext.Provider>
  );
}

function Tooltip({
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Root>) {
  return <TooltipPrimitive.Root data-slot="tooltip" {...props} />;
}

function TooltipTrigger({
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Trigger>) {
  return <TooltipPrimitive.Trigger data-slot="tooltip-trigger" {...props} />;
}

function TooltipContent({
  className,
  sideOffset = 6,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Content>) {
  const container = useContext(TooltipPortalContext);
  return (
    <TooltipPrimitive.Portal container={container ?? undefined}>
      <TooltipPrimitive.Content
        data-slot="tooltip-content"
        sideOffset={sideOffset}
        className={cn(
          "overflow-hidden rounded-md px-2.5 py-1 text-[11px]",
          className,
        )}
        style={{ background: "var(--muted)", color: "var(--foreground)", border: "1px solid var(--border)", whiteSpace: "nowrap", zIndex: 2147483647 }}
        {...props}
      />
    </TooltipPrimitive.Portal>
  );
}

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider };
