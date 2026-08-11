const SESSION_ID_KEY = "vigogh-session-id";
const SESSION_EXPIRES_AT_KEY = "vigogh-session-expires-at";

interface SessionStorage {
  [SESSION_ID_KEY]?: string;
  [SESSION_EXPIRES_AT_KEY]?: string;
}

export async function persistSession(message: {
  sessionId: string;
  expiresAt: string;
}): Promise<void> {
  await chrome.storage.local.set({
    [SESSION_ID_KEY]: message.sessionId,
    [SESSION_EXPIRES_AT_KEY]: message.expiresAt,
  });
}

export async function clearSession(): Promise<void> {
  await chrome.storage.local.remove([SESSION_ID_KEY, SESSION_EXPIRES_AT_KEY]);
}

function isValid(
  sessionId: string | undefined,
  expiresAt: string | undefined,
): boolean {
  if (!sessionId || !expiresAt) return false;
  return Date.now() < new Date(expiresAt).getTime();
}

export async function hasValidSession(): Promise<boolean> {
  const stored = await chrome.storage.local.get<SessionStorage>([
    SESSION_ID_KEY,
    SESSION_EXPIRES_AT_KEY,
  ]);
  return isValid(stored[SESSION_ID_KEY], stored[SESSION_EXPIRES_AT_KEY]);
}

export async function getSessionHeaders(): Promise<Record<string, string>> {
  const stored = await chrome.storage.local.get<SessionStorage>([
    SESSION_ID_KEY,
    SESSION_EXPIRES_AT_KEY,
  ]);
  const sessionId = stored[SESSION_ID_KEY];
  if (!isValid(sessionId, stored[SESSION_EXPIRES_AT_KEY])) return {};
  return { "X-Session-Id": sessionId as string };
}

interface SessionCache {
  sessionId: string | null;
  expiresAt: string | null;
  loaded: boolean;
}

const cache: SessionCache = {
  sessionId: null,
  expiresAt: null,
  loaded: false,
};

let listenerInstalled = false;

export async function initSessionCache(): Promise<void> {
  if (!listenerInstalled) {
    listenerInstalled = true;
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== "local") return;
      if (SESSION_ID_KEY in changes) {
        cache.sessionId =
          (changes[SESSION_ID_KEY].newValue as string | undefined) ?? null;
      }
      if (SESSION_EXPIRES_AT_KEY in changes) {
        cache.expiresAt =
          (changes[SESSION_EXPIRES_AT_KEY].newValue as string | undefined) ??
          null;
      }
    });
  }
  try {
    const stored = await chrome.storage.local.get<SessionStorage>([
      SESSION_ID_KEY,
      SESSION_EXPIRES_AT_KEY,
    ]);
    cache.sessionId = stored[SESSION_ID_KEY] ?? null;
    cache.expiresAt = stored[SESSION_EXPIRES_AT_KEY] ?? null;
  } finally {
    cache.loaded = true;
  }
}

export function hasValidSessionSync(): boolean {
  if (!cache.loaded) return false;
  return isValid(cache.sessionId ?? undefined, cache.expiresAt ?? undefined);
}
