import { toast as sonnerToast } from "sonner";
import { logger } from "@/libs/logger";
import { extensionStore } from "@/stores/extensionStore";
import type { ResolvedMessagesConfig } from "@/types";

const baseOptions = { icon: null } as const;

interface ToastOptions {
  id?: string | number;
}

function isEmpty(message: unknown): boolean {
  return typeof message !== "string" || message.trim().length === 0;
}

function reportEmpty(
  variant: string,
  message: unknown,
  options?: ToastOptions,
): void {
  logger.error("toast:empty", {
    error: new Error(`Empty toast attempted: ${variant}`),
    variant,
    message,
    id: options?.id,
  });
}

export const toast = {
  show(message: string, options?: ToastOptions): void {
    if (isEmpty(message)) {
      reportEmpty("show", message, options);
      return;
    }
    sonnerToast(message, { ...baseOptions, ...options });
  },
  success(message: string, options?: ToastOptions): void {
    if (isEmpty(message)) {
      reportEmpty("success", message, options);
      return;
    }
    sonnerToast.success(message, { ...baseOptions, ...options });
  },
  error(message: string, options?: ToastOptions): void {
    if (isEmpty(message)) {
      reportEmpty("error", message, options);
      return;
    }
    sonnerToast.error(message, { ...baseOptions, ...options });
  },
  warning(message: string, options?: ToastOptions): void {
    if (isEmpty(message)) {
      reportEmpty("warning", message, options);
      return;
    }
    sonnerToast.warning(message, { ...baseOptions, ...options });
  },
  info(message: string, options?: ToastOptions): void {
    if (isEmpty(message)) {
      reportEmpty("info", message, options);
      return;
    }
    sonnerToast.info(message, { ...baseOptions, ...options });
  },
  loading(message: string, options?: ToastOptions): string | number {
    if (isEmpty(message)) {
      reportEmpty("loading", message, options);
      return -1;
    }
    return sonnerToast.loading(message, { ...baseOptions, ...options });
  },
  dismiss(id: string | number): void {
    sonnerToast.dismiss(id);
  },
};

export function resolveErrorMessage(
  code: string | null | undefined,
  messages: ResolvedMessagesConfig | undefined,
): string | null {
  if (!messages) return null;
  const map = messages.errors ?? {};
  if (code && map[code]) return map[code];
  return map.DEFAULT || null;
}

export function resolveSuccessMessage(
  code: string | null | undefined,
  messages: ResolvedMessagesConfig | undefined,
): string | null {
  if (!messages || !code) return null;
  const map = messages.success ?? {};
  return map[code] || null;
}

export function resolveInfoMessage(
  code: string | null | undefined,
  messages: ResolvedMessagesConfig | undefined,
): string | null {
  if (!messages || !code) return null;
  const map = messages.info ?? {};
  return map[code] || null;
}

interface EmitOptions {
  id?: string;
}

export function emitErrorToastr(
  code: string | null | undefined,
  options?: EmitOptions,
): void {
  const { config } = extensionStore.getState();
  const message = resolveErrorMessage(code, config?.messages);
  if (!message) return;
  toast.error(message, {
    id: options?.id ?? `vigogh-error-${code ?? "default"}`,
  });
}

export function emitSuccessToastr(code: string, options?: EmitOptions): void {
  const { config } = extensionStore.getState();
  const message = resolveSuccessMessage(code, config?.messages);
  if (!message) return;
  toast.success(message, { id: options?.id ?? `vigogh-success-${code}` });
}

export function emitInfoToastr(code: string, options?: EmitOptions): void {
  const { config } = extensionStore.getState();
  const message = resolveInfoMessage(code, config?.messages);
  if (!message) return;
  toast.info(message, { id: options?.id ?? `vigogh-info-${code}` });
}

export function emitNeutralToastr(code: string, options?: EmitOptions): void {
  const { config } = extensionStore.getState();
  const message = resolveInfoMessage(code, config?.messages);
  if (!message) return;
  toast.show(message, { id: options?.id ?? `vigogh-info-${code}` });
}

export function emitLoadingToastr(
  code: string,
  options?: EmitOptions,
): string | number {
  const { config } = extensionStore.getState();
  const message = resolveInfoMessage(code, config?.messages);
  if (!message) return -1;
  return toast.loading(message, options?.id ? { id: options.id } : undefined);
}
