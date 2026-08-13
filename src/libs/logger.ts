import {
  BrowserClient,
  dedupeIntegration,
  defaultStackParser,
  makeFetchTransport,
  Scope,
  logger as sentryLog,
} from "@sentry/browser";
import type { DebugLogEntry, DebugLogLevel, DebugLogSource } from "@/types";

type LogData = Record<string, unknown>;

type SerializedError = {
  name: string;
  message: string;
  stack?: string;
};

const SENTRY_DSN =
  "https://033119fe74681ba9599019f580260d29@o4510412351995904.ingest.us.sentry.io/4510848234160128";

const SENTRY_TUNNEL = "https://api.vigogh.com/v1/sentry";

const RUNTIME_ACTION = {
  info: "logger_info",
  warn: "logger_warn",
  error: "logger_error",
} as const;

let scope: Scope | null = null;
let initialized = false;
let debugSource: DebugLogSource = "content";

function buildSentryScope(): Scope {
  const client = new BrowserClient({
    dsn: SENTRY_DSN,
    tunnel: SENTRY_TUNNEL,
    transport: makeFetchTransport,
    stackParser: defaultStackParser,
    integrations: [dedupeIntegration()],
    enableLogs: true,
  });
  const next = new Scope();
  next.setClient(client);
  client.init();
  return next;
}

function applyContext(target: Scope, prefix?: string, extra?: LogData): void {
  if (prefix) target.setTag("prefix", prefix);
  if (!extra) return;
  for (const [key, value] of Object.entries(extra)) {
    target.setExtra(key, value as never);
  }
}

function captureExceptionLocal(
  error: unknown,
  prefix?: string,
  extra?: LogData,
): void {
  if (!scope) return;
  try {
    const isolated = scope.clone();
    applyContext(isolated, prefix, extra);
    const err = error instanceof Error ? error : new Error(String(error));
    isolated.captureException(err);
  } catch {}
}

type LogSeverity = "debug" | "info" | "warn" | "error";

function captureLogLocal(
  severity: LogSeverity,
  message: string,
  prefix?: string,
  extra?: LogData,
): void {
  if (!scope) return;
  try {
    const isolated = scope.clone();
    if (prefix) isolated.setTag("prefix", prefix);
    sentryLog[severity](message, extra, { scope: isolated });
  } catch {}
}

function deserializeError(serialized: Partial<SerializedError>): Error {
  const err = new Error(serialized.message ?? "Unknown error");
  err.name = serialized.name ?? "Error";
  if (serialized.stack) err.stack = serialized.stack;
  return err;
}

function isExtensionContextValid(): boolean {
  try {
    return !!chrome?.runtime?.id;
  } catch {
    return false;
  }
}

function sendToRuntime(action: string, payload: unknown): void {
  if (!isExtensionContextValid()) return;
  try {
    chrome.runtime.sendMessage({ action, payload }, () => {
      void chrome.runtime.lastError;
    });
  } catch {}
}

function serializeError(err: unknown): SerializedError {
  if (err instanceof Error) {
    return { name: err.name, message: err.message, stack: err.stack };
  }
  return { name: "UnknownError", message: String(err) };
}

function omitError(data?: LogData): LogData | undefined {
  if (!data) return undefined;
  const { error: _ignored, ...rest } = data;
  return Object.keys(rest).length > 0 ? rest : undefined;
}

function safeSerialize(data: LogData): string | undefined {
  if (Object.keys(data).length === 0) return undefined;
  try {
    return JSON.stringify(data, (_key, value) =>
      value instanceof Error ? serializeError(value) : value,
    );
  } catch {
    try {
      return String(data);
    } catch {
      return "[unserializable]";
    }
  }
}

function broadcastDebugLog(
  level: DebugLogLevel,
  prefix: string,
  data?: LogData,
  source: DebugLogSource = debugSource,
): void {
  if (!isExtensionContextValid()) return;
  const entry: DebugLogEntry = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    source,
    level,
    prefix,
    data: data ? safeSerialize(data) : undefined,
    timestamp: Date.now(),
  };
  try {
    chrome.runtime.sendMessage({ action: "debug_log_broadcast", entry }, () => {
      void chrome.runtime.lastError;
    });
  } catch {}
}

export function logRemoteEntry(
  source: DebugLogSource,
  level: DebugLogLevel,
  prefix: string,
  data?: LogData,
): void {
  broadcastDebugLog(level, prefix, data, source);
}

export const logger = {
  info(prefix: string, data?: LogData): void {
    if (__DEV__) console.log(prefix, data ?? {});
    broadcastDebugLog("info", prefix, data);
    if (scope) {
      captureLogLocal("info", prefix, prefix, data);
      return;
    }
    sendToRuntime(RUNTIME_ACTION.info, { prefix, data });
  },
  debug(prefix: string, data?: LogData): void {
    if (__DEV__) console.log(prefix, data ?? {});
    broadcastDebugLog("debug", prefix, data);
  },
  warn(prefix: string, data?: LogData): void {
    if (__DEV__) console.warn(prefix, data ?? {});
    broadcastDebugLog("warn", prefix, data);
    const extra = omitError(data);
    if (scope) {
      captureLogLocal("warn", prefix, prefix, extra);
      if (data?.error !== undefined) {
        captureExceptionLocal(data.error, prefix, extra);
      }
      return;
    }
    sendToRuntime(RUNTIME_ACTION.warn, {
      prefix,
      extra,
      error: data?.error !== undefined ? serializeError(data.error) : undefined,
    });
  },
  error(prefix: string, data?: LogData): void {
    if (__DEV__) console.error(prefix, data ?? {});
    broadcastDebugLog("error", prefix, data);
    const extra = omitError(data);
    const error = data?.error ?? new Error(prefix);
    if (scope) {
      captureLogLocal("error", prefix, prefix, extra);
      captureExceptionLocal(error, prefix, extra);
      return;
    }
    sendToRuntime(RUNTIME_ACTION.error, {
      ...serializeError(error),
      prefix,
      extra,
    });
  },
};

export function installGlobalHandlers(): void {
  const target: EventTarget = (
    typeof window !== "undefined" ? window : self
  ) as EventTarget;

  target.addEventListener("error", (event: Event) => {
    const e = event as ErrorEvent;
    logger.error("global:error", {
      error: e.error ?? new Error(e.message ?? "Unknown error"),
      filename: e.filename,
      lineno: e.lineno,
      colno: e.colno,
    });
  });

  target.addEventListener("unhandledrejection", (event: Event) => {
    const e = event as PromiseRejectionEvent;
    logger.error("global:unhandledrejection", { error: e.reason });
  });
}

function installRuntimeListener(): void {
  if (typeof chrome === "undefined" || !chrome.runtime?.onMessage) return;
  chrome.runtime.onMessage.addListener((message, sender) => {
    if (sender.id !== chrome.runtime.id) return false;
    const action = message?.action;
    const payload = message?.payload ?? {};
    switch (action) {
      case RUNTIME_ACTION.info:
        captureLogLocal("info", payload.prefix, payload.prefix, payload.data);
        return false;
      case RUNTIME_ACTION.warn:
        captureLogLocal("warn", payload.prefix, payload.prefix, payload.extra);
        if (payload.error) {
          captureExceptionLocal(
            deserializeError(payload.error),
            payload.prefix,
            payload.extra,
          );
        }
        return false;
      case RUNTIME_ACTION.error:
        captureLogLocal("error", payload.prefix, payload.prefix, payload.extra);
        captureExceptionLocal(
          deserializeError(payload),
          payload.prefix,
          payload.extra,
        );
        return false;
      default:
        return false;
    }
  });
}

export function initLogger(source: DebugLogSource = "content"): void {
  if (initialized) return;
  initialized = true;
  debugSource = source;
  scope = buildSentryScope();
  installGlobalHandlers();
  installRuntimeListener();
}
