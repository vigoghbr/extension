import axios, { type AxiosError, type InternalAxiosRequestConfig } from "axios";
import { maybeRefreshAuthToken, refreshAuthToken } from "@/libs/auth";
import { API_BASE_URL } from "@/libs/constants";
import { logger } from "@/libs/logger";
import type { SeriousErrorPayload } from "@/types";
import { isExtensionContextValid } from "@/utils/extension-context";

type Method = "get" | "post" | "put" | "patch" | "delete";

export interface ApiRequestPayload {
  method: Method;
  path: string;
  body?: unknown;
  headers?: Record<string, string>;
}

export type ApiRunResult =
  | { ok: true; status: number; data: unknown }
  | { ok: false; status: number; data: unknown };

const axiosApi = axios.create({ baseURL: API_BASE_URL, adapter: "fetch" });

function extractErrorCode(data: unknown): string | null {
  if (!data || typeof data !== "object") return null;
  const inner = (data as { data?: unknown }).data;
  if (!inner || typeof inner !== "object") return null;
  const code = (inner as { code?: unknown }).code;
  return typeof code === "string" ? code : null;
}

function classifyError(
  status: number,
  data: unknown,
): SeriousErrorPayload | null {
  if (status === 0) return { status, isAuthError: false };
  if (status >= 400 && status < 600) {
    const code = extractErrorCode(data);
    if (code) return null;
    return { status, isAuthError: status === 401 || status === 403 };
  }
  return null;
}

function isServiceWorkerContext(): boolean {
  return typeof window === "undefined";
}

function broadcastSeriousErrorFromWorker(payload: SeriousErrorPayload): void {
  chrome.tabs
    .query({ active: true, lastFocusedWindow: true })
    .then((tabs) => {
      const tabId = tabs[0]?.id;
      if (tabId !== undefined) {
        chrome.tabs
          .sendMessage(tabId, { action: "serious_error_toast", payload })
          .catch(() => {});
      }
    })
    .catch(() => {});
  chrome.runtime
    .sendMessage({ action: "serious_error_toast", payload })
    .catch(() => {});
}

function notifySeriousError(payload: SeriousErrorPayload): void {
  if (!isExtensionContextValid()) return;
  try {
    if (isServiceWorkerContext()) {
      broadcastSeriousErrorFromWorker(payload);
      return;
    }
    chrome.runtime.sendMessage(
      { action: "serious_error_broadcast", payload },
      () => {
        void chrome.runtime.lastError;
      },
    );
  } catch {}
}

axiosApi.interceptors.request.use(async (config) => {
  const token = await maybeRefreshAuthToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

axiosApi.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    if (error.response?.status === 401) {
      const original = error.config as
        | (InternalAxiosRequestConfig & { _retried?: boolean })
        | undefined;
      if (original && !original._retried) {
        const newToken = await refreshAuthToken();
        if (newToken) {
          original._retried = true;
          original.headers = original.headers ?? {};
          (original.headers as Record<string, string>).Authorization =
            `Bearer ${newToken}`;
          return axiosApi.request(original);
        }
      }
      try {
        await chrome.storage.local.remove([
          "vigogh-auth-token",
          "vigogh-auth-refresh-token",
          "vigogh-auth-token-expires-at",
        ]);
      } catch {}
    }
    const status = error.response?.status ?? 0;
    const payload = classifyError(status, error.response?.data);
    if (payload) notifySeriousError(payload);
    return Promise.reject(error);
  },
);

export async function runApiRequest(
  payload: ApiRequestPayload,
): Promise<ApiRunResult> {
  const { method, path, body, headers } = payload;
  logger.debug("api:request", { method, path });
  try {
    const response = await axiosApi.request({
      method,
      url: path,
      data: method === "get" || method === "delete" ? undefined : body,
      headers,
    });
    logger.debug("api:response", {
      method,
      path,
      status: response.status,
    });
    return { ok: true, status: response.status, data: response.data };
  } catch (err) {
    if (axios.isAxiosError(err) && err.response) {
      logger.warn("api:response-error", {
        method,
        path,
        status: err.response.status,
      });
      return {
        ok: false,
        status: err.response.status,
        data: err.response.data,
      };
    }
    logger.error("api:network-error", { method, path, error: err });
    return {
      ok: false,
      status: 0,
      data: {
        data: {
          code: "NETWORK_ERROR",
          message: (err as Error)?.message ?? "Network error",
        },
        error: true,
      },
    };
  }
}

(globalThis as { __vigoghApiLocal?: typeof runApiRequest }).__vigoghApiLocal =
  runApiRequest;

if (typeof chrome !== "undefined" && chrome.runtime?.onMessage) {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (sender.id !== chrome.runtime.id) return false;
    if (message?.action !== "api_request") return false;
    runApiRequest(message.payload as ApiRequestPayload)
      .then(sendResponse)
      .catch((err) => {
        sendResponse({
          ok: false,
          status: 0,
          data: {
            data: {
              code: "RUNTIME_ERROR",
              message: (err as Error)?.message ?? "Runtime error",
            },
            error: true,
          },
        });
      });
    return true;
  });
}
