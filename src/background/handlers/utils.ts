import type { ExtensionSettings, SiteConfig } from "@/types";

export function toMatchArray(match: string | string[]): string[] {
  return Array.isArray(match) ? match : [match];
}

export async function getSiteConfigs(): Promise<SiteConfig[]> {
  const stored = await chrome.storage.local.get<{
    "vigogh-settings"?: ExtensionSettings;
  }>("vigogh-settings");
  const config = stored["vigogh-settings"];
  return config?.sites ?? [];
}

export function findSiteConfig(
  sites: SiteConfig[],
  key: string,
): SiteConfig | undefined {
  return sites.find((s) => s.key === key);
}
