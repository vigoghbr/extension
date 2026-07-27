import { createStore } from "zustand/vanilla";
import type { ExtensionStyles } from "@/types";

interface StylesState {
  styles: ExtensionStyles | null;
}

export const stylesStore = createStore<StylesState>()(() => ({
  styles: null,
}));

export function setStyles(styles: ExtensionStyles): void {
  stylesStore.setState({ styles });
}
