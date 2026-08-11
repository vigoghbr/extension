function cyrb53(input: string): number {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < input.length; i++) {
    const ch = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 =
    Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^
    Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 =
    Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^
    Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}

function hashPageId(tabId: number, url: string): string {
  return String(cyrb53(`${tabId}:${url}`));
}

const pageIds = new Map<number, string>();

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.url) pageIds.set(tabId, hashPageId(tabId, changeInfo.url));
});

chrome.tabs.onRemoved.addListener((tabId) => {
  pageIds.delete(tabId);
});

export function getPageId(
  tab: { id?: number; url?: string } | undefined,
): string {
  if (!tab?.id) return hashPageId(0, tab?.url ?? "");
  const cached = pageIds.get(tab.id);
  if (cached) return cached;
  const fresh = hashPageId(tab.id, tab.url ?? "");
  pageIds.set(tab.id, fresh);
  return fresh;
}
