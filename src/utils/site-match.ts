import type { SiteConfig } from "@/types";

export function matchSite(hostname: string, sites: SiteConfig[]): SiteConfig | null {
  return (
    sites.find(
      (s) =>
        hostname.includes(s.contains) ||
        (s.hostnamePatterns ?? []).some((p) => hostname.includes(p)),
    ) ?? null
  );
}

export function hasSiteStrategy(hostname: string, sites: SiteConfig[]): boolean {
  return matchSite(hostname, sites) !== null;
}
