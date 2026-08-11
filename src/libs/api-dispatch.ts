import { logger } from "@/libs/logger";
import { getSessionHeaders } from "@/libs/session";
import { toastr } from "@/libs/toastr";

type Method = "get" | "post" | "put" | "patch" | "delete";

interface RequestConfig {
  headers?: Record<string, string>;
}

interface ApiResponse<T> {
  data: T;
}

type ApiRunResult =
  | { ok: true; status: number; data: unknown }
  | { ok: false; status: number; data: unknown };

type LocalRunner = (payload: {
  method: Method;
  path: string;
  body?: unknown;
  headers?: Record<string, string>;
}) => Promise<ApiRunResult>;

export class ApiError extends Error {
  response: { status: number; data: unknown };
  constructor(response: { status: number; data: unknown }) {
    super(`API ${response.status}`);
    this.name = "ApiError";
    this.response = response;
  }
}

function getResponse(
  error: unknown,
): { status?: number; data?: unknown } | null {
  const e = error as { response?: { status?: number; data?: unknown } } | null;
  return e?.response ?? null;
}

export function isUnauthorizedError(error: unknown): boolean {
  return getResponse(error)?.status === 401;
}

export function extractApiErrorCode(error: unknown): string | null {
  const r = (error as { response?: { data?: unknown } } | null)?.response;
  const inner = (r?.data as { data?: { code?: unknown } } | undefined)?.data;
  const code = inner?.code;
  return typeof code === "string" ? code : null;
}

export function extractApiSuccessCode(body: unknown): string | null {
  const code = (body as { code?: unknown } | null)?.code;
  return typeof code === "string" ? code : null;
}

function showErrorToast(error: ApiError): void {
  if (typeof document === "undefined") return;
  if (isUnauthorizedError(error)) return;
  const code = extractApiErrorCode(error);
  if (!code) return;
  toastr.error(code);
}

function showSuccessToast(body: unknown): void {
  if (typeof document === "undefined") return;
  const code = extractApiSuccessCode(body);
  if (!code) return;
  toastr.success(code);
}

function getLocal(): LocalRunner | null {
  const fn = (globalThis as { __vigoghApiLocal?: LocalRunner })
    .__vigoghApiLocal;
  return typeof fn === "function" ? fn : null;
}

async function sendViaRuntime(payload: {
  method: Method;
  path: string;
  body?: unknown;
  headers?: Record<string, string>;
}): Promise<ApiRunResult> {
  try {
    const response = (await chrome.runtime.sendMessage({
      action: "api_request",
      payload,
    })) as ApiRunResult | undefined;
    if (!response) {
      return {
        ok: false,
        status: 0,
        data: {
          data: { code: "RUNTIME_ERROR", message: "Empty runtime response" },
          error: true,
        },
      };
    }
    return response;
  } catch (err) {
    return {
      ok: false,
      status: 0,
      data: {
        data: {
          code: "RUNTIME_ERROR",
          message: (err as Error)?.message ?? "Runtime error",
        },
        error: true,
      },
    };
  }
}

async function dispatch<T>(
  method: Method,
  path: string,
  body?: unknown,
  config?: RequestConfig,
): Promise<ApiResponse<T>> {
  const sessionHeaders = await getSessionHeaders();
  const payload = {
    method,
    path,
    body,
    headers: { ...sessionHeaders, ...config?.headers },
  };
  const local = getLocal();
  const result = local ? await local(payload) : await sendViaRuntime(payload);
  if (!result.ok) {
    const error = new ApiError({ status: result.status, data: result.data });
    if (!isUnauthorizedError(error)) {
      if (result.status === 0) {
        logger.error("api:network-error", { method, path, error });
      } else {
        logger.warn("api:response-error", {
          method,
          path,
          status: result.status,
        });
      }
    }
    showErrorToast(error);
    throw error;
  }
  showSuccessToast(result.data);
  return { data: result.data as T };
}

const api = {
  get<T = any>(path: string, config?: RequestConfig): Promise<ApiResponse<T>> {
    return dispatch<T>("get", path, undefined, config);
  },
  post<T = any>(
    path: string,
    body?: unknown,
    config?: RequestConfig,
  ): Promise<ApiResponse<T>> {
    return dispatch<T>("post", path, body, config);
  },
  put<T = any>(
    path: string,
    body?: unknown,
    config?: RequestConfig,
  ): Promise<ApiResponse<T>> {
    return dispatch<T>("put", path, body, config);
  },
  patch<T = any>(
    path: string,
    body?: unknown,
    config?: RequestConfig,
  ): Promise<ApiResponse<T>> {
    return dispatch<T>("patch", path, body, config);
  },
  delete<T = any>(
    path: string,
    config?: RequestConfig,
  ): Promise<ApiResponse<T>> {
    return dispatch<T>("delete", path, undefined, config);
  },
};

export default api;
