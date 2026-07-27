import type React from "react";
import type { ResolvedAiMenuConfig, ThemeColorSet } from "@/types";

export interface PopoverProps {
  colors: ThemeColorSet;
  config: ResolvedAiMenuConfig;
  label: string;
  bottom: number;
  right: number;
  onClose: () => void;
}

export interface PopoverToolRegistration {
  id: string;
  popoverId: string;
  icon: React.ReactNode;
  getLabel: (labels: NonNullable<ResolvedAiMenuConfig["vigoghMenu"]>) => string;
  Popover: React.ComponentType<PopoverProps>;
}
