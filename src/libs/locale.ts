import { regionsStore } from "@/stores/regionsStore";
import type { LocaleString } from "@/types";

export function getLocale(
  v: LocaleString | undefined,
  fallback: LocaleString = "",
): string {
  const { region } = regionsStore.getState();
  const resolved = v ?? fallback;
  if (typeof resolved === "string") return resolved;
  return resolved[region] ?? resolved.br ?? resolved.us ?? "";
}

export function getLocaleArray(
  v: { us?: string[]; br?: string[] } | string[] | undefined,
): string[] {
  if (!v) return [];
  if (Array.isArray(v)) return v;
  const { region } = regionsStore.getState();
  return v[region] ?? v.br ?? v.us ?? [];
}
