import { logger } from "@/libs/logger";

export const FIREBASE_PUBLIC_KEY = "AIzaSyCi9rK0ofgE_cfH_UkCp1_d6EuOM-MxYeM";
export const TOKEN_REFRESH_SKEW_MS = 5 * 60 * 1000;

const SECURE_TOKEN_URL = `https://securetoken.googleapis.com/v1/token?key=${FIREBASE_PUBLIC_KEY}`;

export interface FirebaseRefreshResponse {
  id_token: string;
  refresh_token: string;
  expires_in: string;
  user_id: string;
  project_id: string;
}

interface AuthStorage {
  "vigogh-auth-token"?: string;
  "vigogh-auth-refresh-token"?: string;
  "vigogh-auth-token-expires-at"?: number;
}

let inflight: Promise<string | null> | null = null;

export async function exchangeRefreshToken(
  refreshToken: string,
): Promise<FirebaseRefreshResponse> {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });
  const response = await fetch(SECURE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`securetoken_${response.status}:${text}`);
  }
  return (await response.json()) as FirebaseRefreshResponse;
}

export async function refreshAuthToken(): Promise<string | null> {
  if (inflight) return inflight;
  inflight = (async () => {
    const stored = await chrome.storage.local.get<AuthStorage>("vigogh-auth-refresh-token");
    const refreshToken = stored["vigogh-auth-refresh-token"];
    if (!refreshToken) return null;

    try {
      const data = await exchangeRefreshToken(refreshToken);
      const expiresAt = Date.now() + Number(data.expires_in) * 1000;
      await chrome.storage.local.set({
        "vigogh-auth-token": data.id_token,
        "vigogh-auth-refresh-token": data.refresh_token,
        "vigogh-auth-token-expires-at": expiresAt,
      });
      return data.id_token;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (
        message.includes("INVALID_REFRESH_TOKEN") ||
        message.includes("TOKEN_EXPIRED") ||
        message.includes("USER_DISABLED") ||
        message.includes("USER_NOT_FOUND")
      ) {
        await chrome.storage.local.remove([
          "vigogh-auth-token",
          "vigogh-auth-refresh-token",
          "vigogh-auth-token-expires-at",
        ]);
        return null;
      }
      logger.error("auth:refresh-token", {
        error: error instanceof Error ? error : new Error(message),
      });
      return null;
    }
  })().finally(() => {
    inflight = null;
  });
  return inflight;
}

export async function maybeRefreshAuthToken(
  skewMs: number = TOKEN_REFRESH_SKEW_MS,
): Promise<string | null> {
  const stored = await chrome.storage.local.get<AuthStorage>([
    "vigogh-auth-token",
    "vigogh-auth-refresh-token",
    "vigogh-auth-token-expires-at",
  ]);
  const token = stored["vigogh-auth-token"];
  const refreshToken = stored["vigogh-auth-refresh-token"];
  if (!refreshToken) return token ?? null;
  const expiresAt = stored["vigogh-auth-token-expires-at"];
  if (token && expiresAt && Date.now() < expiresAt - skewMs) return token;
  return refreshAuthToken();
}

interface SessionCache {
  token: string | null;
  refreshToken: string | null;
  expiresAt: number | null;
  loaded: boolean;
}

const cache: SessionCache = {
  token: null,
  refreshToken: null,
  expiresAt: null,
  loaded: false,
};

let listenerInstalled = false;

export async function initSessionCache(): Promise<void> {
  if (!listenerInstalled) {
    listenerInstalled = true;
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== "local") return;
      if ("vigogh-auth-token" in changes) {
        cache.token = (changes["vigogh-auth-token"].newValue as string | undefined) ?? null;
      }
      if ("vigogh-auth-refresh-token" in changes) {
        cache.refreshToken =
          (changes["vigogh-auth-refresh-token"].newValue as string | undefined) ?? null;
      }
      if ("vigogh-auth-token-expires-at" in changes) {
        cache.expiresAt =
          (changes["vigogh-auth-token-expires-at"].newValue as number | undefined) ?? null;
      }
    });
  }
  try {
    const stored = await chrome.storage.local.get<AuthStorage>([
      "vigogh-auth-token",
      "vigogh-auth-refresh-token",
      "vigogh-auth-token-expires-at",
    ]);
    cache.token = stored["vigogh-auth-token"] ?? null;
    cache.refreshToken = stored["vigogh-auth-refresh-token"] ?? null;
    cache.expiresAt = stored["vigogh-auth-token-expires-at"] ?? null;
  } finally {
    cache.loaded = true;
  }
}

export function hasValidSession(): boolean {
  if (!cache.loaded) return false;
  if (!cache.token && !cache.refreshToken) return false;
  if (cache.token && cache.expiresAt) {
    if (Date.now() < cache.expiresAt - TOKEN_REFRESH_SKEW_MS) return true;
    return cache.refreshToken !== null;
  }
  if (cache.token) return true;
  return cache.refreshToken !== null;
}
