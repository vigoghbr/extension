import type { EndpointKey, ExtensionSettings } from "@/types";

const DEFAULT_ENDPOINTS: Record<EndpointKey, string> = {
  context: "/v1/tools/contexts",
  autocomplete: "/v1/tools/autocompletes",
  autocompleteAccept: "/v1/tools/autocompletes/accept",
  chats: "/v1/tools/chats",
  chatMessages: "/v1/tools/chats/:chatId/messages",
  files: "/v1/tools/files",
  filesById: "/v1/tools/files/:id",
  transforms: "/v1/tools/transforms",
  answers: "/v1/tools/answers",
  notes: "/v1/tools/notes",
  notesById: "/v1/tools/notes/:id",
  quickMessages: "/v1/tools/quick-messages",
  quickMessagesById: "/v1/tools/quick-messages/:id",
};

let cached: Partial<Record<EndpointKey, string>> = {};

function loadFromStorage(): void {
  chrome.storage.local
    .get<{ "vigogh-settings"?: ExtensionSettings }>("vigogh-settings")
    .then((stored) => {
      cached = stored["vigogh-settings"]?.endpoints ?? {};
    })
    .catch(() => {});
}

loadFromStorage();

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && "vigogh-settings" in changes) loadFromStorage();
});

function interpolate(
  template: string,
  params?: Record<string, string>,
): string {
  if (!params) return template;
  return template.replace(
    /:([a-zA-Z]+)/g,
    (match, key: string) => params[key] ?? match,
  );
}

export function getEndpoint(
  key: EndpointKey,
  params?: Record<string, string>,
): string {
  return interpolate(cached[key] ?? DEFAULT_ENDPOINTS[key], params);
}
