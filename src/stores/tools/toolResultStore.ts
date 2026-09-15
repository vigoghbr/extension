import { createStore } from "zustand/vanilla";
import { touchToolActivity } from "@/libs/tool-inactivity-timer";

export interface ToolResult {
  toolId: string;
  text: string;
}

interface ToolResultState {
  result: ToolResult | null;
}

export const toolResultStore = createStore<ToolResultState>()(() => ({
  result: null,
}));

export function showToolResult(result: ToolResult): void {
  toolResultStore.setState({ result });
  touchToolActivity();
}

export function clearToolResult(): void {
  toolResultStore.setState({ result: null });
}
