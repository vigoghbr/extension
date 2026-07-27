import type { ExtensionStylesZLayers } from "@/types";

export const DEFAULT_Z_LAYERS: ExtensionStylesZLayers = {
  default: 2147483640,
  focused: 2147483643,
  hovered: 2147483646,
};

export function resolveZIndex(
  state: { isHovered: boolean; isFocused?: boolean },
  zLayers: ExtensionStylesZLayers | undefined,
): number {
  const layers = zLayers ?? DEFAULT_Z_LAYERS;
  if (state.isHovered) return layers.hovered;
  if (state.isFocused) return layers.focused;
  return layers.default;
}
