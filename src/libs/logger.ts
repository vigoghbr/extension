import {
  BrowserClient,
  consoleLoggingIntegration,
  dedupeIntegration,
  defaultStackParser,
  makeFetchTransport,
  Scope,
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
  log: "logger_log",
  message: "logger_message",
  capture: "logger_capture",
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
    integrations: [
      consoleLoggingIntegration({ levels: ["log", "warn", "error"] }),
      dedupeIntegration(),
    ],
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

function captureMessageLocal(
  message: string,
  prefix?: string,
  extra?: LogData,
): void {
  if (!scope) return;
  try {
    const isolated = scope.clone();
    applyContext(isolated, prefix, extra);
    isolated.captureMessage(message, "info");
  } catch {}
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
  log(prefix: string, data?: LogData): void {
    if (__DEV__) console.log(prefix, data ?? {});
    broadcastDebugLog("log", prefix, data);
    if (scope) return;
    sendToRuntime(RUNTIME_ACTION.log, { prefix, data: data ?? {} });
  },
  info(prefix: string, data?: LogData): void {
    if (__DEV__) console.log(prefix, data ?? {});
    broadcastDebugLog("info", prefix, data);
    if (scope) {
      captureMessageLocal(prefix, prefix, data);
      return;
    }
    sendToRuntime(RUNTIME_ACTION.message, { prefix, extra: data });
  },
  warn(prefix: string, data?: LogData): void {
    if (__DEV__) console.warn(prefix, data ?? {});
    broadcastDebugLog("warn", prefix, data);
    if (data?.error === undefined) return;
    if (scope) {
      captureExceptionLocal(data.error, prefix, omitError(data));
      return;
    }
    sendToRuntime(RUNTIME_ACTION.capture, {
      ...serializeError(data.error),
      prefix,
      extra: omitError(data),
    });
  },
  error(prefix: string, data?: LogData): void {
    if (__DEV__) console.error(prefix, data ?? {});
    broadcastDebugLog("error", prefix, data);
    const error = data?.error ?? new Error(prefix);
    if (scope) {
      captureExceptionLocal(error, prefix, omitError(data));
      return;
    }
    sendToRuntime(RUNTIME_ACTION.capture, {
      ...serializeError(error),
      prefix,
      extra: omitError(data),
    });
  },
};

export function installGlobalHandlers(): void {
  const target: EventTarget = (typeof window !== "undefined"
    ? window
    : self) as EventTarget;

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
    if (action === RUNTIME_ACTION.log) {
      console.log(payload.prefix, payload.data ?? {});
      return false;
    }
    if (action === RUNTIME_ACTION.message) {
      captureMessageLocal(
        payload.prefix ?? "info",
        payload.prefix,
        payload.extra,
      );
      return false;
    }
    if (action === RUNTIME_ACTION.capture) {
      const err = new Error(payload.message ?? "Unknown error");
      err.name = payload.name ?? "Error";
      if (payload.stack) err.stack = payload.stack;
      captureExceptionLocal(err, payload.prefix, payload.extra);
      return false;
    }
    return false;
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
