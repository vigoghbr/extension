import { createStore } from "zustand/vanilla";
import type { ExtensionLocales } from "@/types";

interface RegionState {
  region: "us" | "br";
  locales: ExtensionLocales | null;
}

export const regionsStore = createStore<RegionState>()(() => ({
  region: "br",
  locales: null,
}));

chrome.storage.local
  .get<{ "vigogh-region"?: "us" | "br"; "vigogh-locales"?: ExtensionLocales }>([
    "vigogh-region",
    "vigogh-locales",
  ])
  .then((stored) => {
    regionsStore.setState({
      region: stored["vigogh-region"] ?? "br",
      locales: stored["vigogh-locales"] ?? null,
    });
  })
  .catch(() => {});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  const update: Partial<RegionState> = {};
  if ("vigogh-region" in changes)
    update.region =
      (changes["vigogh-region"].newValue as "us" | "br" | undefined) ?? "br";
  if ("vigogh-locales" in changes)
    update.locales =
      (changes["vigogh-locales"].newValue as ExtensionLocales | undefined) ??
      null;
  if (Object.keys(update).length > 0) regionsStore.setState(update);
});
