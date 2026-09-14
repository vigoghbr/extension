import type { ExtensionMessage } from "@/types";

export interface OffscreenModule {
  id: string;
  actions: readonly string[];
  handle(message: ExtensionMessage): void;
  isActive(): boolean;
  teardown(): void;
}

export interface OffscreenModuleContext {
  notifyIdle: () => void;
}

export type OffscreenModuleFactory = (
  context: OffscreenModuleContext,
) => OffscreenModule;
