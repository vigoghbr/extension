import { createStore } from "zustand/vanilla";
import api from "@/libs/api-dispatch";
import { getEndpoint } from "@/libs/endpoints";
import {
  hideBottomBorder,
  hideTopBorder,
  showBottomBorder,
  showTopBorder,
} from "@/stores/borderStore";
import { extensionStore } from "@/stores/extensionStore";
import type { QuickMessage } from "@/types";

interface QuickMessagesState {
  items: QuickMessage[];
  status: "idle" | "loading" | "success" | "error";
  error: string | null;
  saveStatus: "idle" | "loading" | "success" | "error";
}

export const quickMessagesStore = createStore<QuickMessagesState>()(() => ({
  items: [],
  status: "idle",
  error: null,
  saveStatus: "idle",
}));

export function fetchQuickMessages(): void {
  quickMessagesStore.setState({ status: "loading", error: null });
  showBottomBorder();
  api
    .get<{ data: { messages: QuickMessage[] } }>(getEndpoint("quickMessages"))
    .then((res) => {
      quickMessagesStore.setState({
        items: res.data.data.messages,
        status: "success",
      });
      hideBottomBorder();
    })
    .catch(() => {
      quickMessagesStore.setState({
        status: "error",
        error: extensionStore.getState().config?.messages.errors.DEFAULT ?? "",
      });
      hideBottomBorder();
    });
}

export function createQuickMessage(text: string): Promise<void> {
  quickMessagesStore.setState({ saveStatus: "loading" });
  showTopBorder();
  return api
    .post<{ data: QuickMessage }>(getEndpoint("quickMessages"), { text })
    .then((res) => {
      quickMessagesStore.setState((s) => ({
        items: [...s.items, res.data.data],
        saveStatus: "success",
      }));
      hideTopBorder();
    })
    .catch(() => {
      quickMessagesStore.setState({ saveStatus: "error" });
      hideTopBorder();
      throw new Error();
    });
}

export function updateQuickMessage(id: string, text: string): Promise<void> {
  quickMessagesStore.setState({ saveStatus: "loading" });
  showTopBorder();
  return api
    .patch<{ data: QuickMessage }>(getEndpoint("quickMessagesById", { id }), {
      text,
    })
    .then((res) => {
      quickMessagesStore.setState((s) => ({
        items: s.items.map((m) => (m.id === id ? res.data.data : m)),
        saveStatus: "success",
      }));
      hideTopBorder();
    })
    .catch(() => {
      quickMessagesStore.setState({ saveStatus: "error" });
      hideTopBorder();
      throw new Error();
    });
}

export function deleteQuickMessage(id: string): void {
  showBottomBorder();
  api
    .delete(getEndpoint("quickMessagesById", { id }))
    .then(() => {
      quickMessagesStore.setState((s) => ({
        items: s.items.filter((m) => m.id !== id),
      }));
      hideBottomBorder();
    })
    .catch(() => {
      hideBottomBorder();
    });
}
