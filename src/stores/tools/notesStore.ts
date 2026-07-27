import { createStore } from "zustand/vanilla";
import api from "@/libs/api-dispatch";
import { getEndpoint } from "@/libs/endpoints";
import { extensionStore } from "@/stores/extensionStore";
import { hideStickyNote } from "@/stores/stickyNotesStore";
import type { Note } from "@/types";

interface NotesState {
  items: Note[];
  status: "idle" | "loading" | "success" | "error";
  error: string | null;
  saveStatus: "idle" | "loading" | "success" | "error";
}

export const notesStore = createStore<NotesState>()(() => ({
  items: [],
  status: "idle",
  error: null,
  saveStatus: "idle",
}));

export function fetchNotes(): void {
  notesStore.setState({ status: "loading", error: null });
  api
    .get<{ data: { notes: Note[] } }>(getEndpoint("notes"))
    .then((res) => {
      notesStore.setState({ items: res.data.data.notes, status: "success" });
    })
    .catch(() => {
      notesStore.setState({
        status: "error",
        error: extensionStore.getState().config?.messages.errors.DEFAULT ?? "",
      });
    });
}

export function createNote(content: string): Promise<Note | null> {
  notesStore.setState({ saveStatus: "loading" });
  return api
    .post<{ data: Note }>(getEndpoint("notes"), { content })
    .then((res) => {
      notesStore.setState((s) => ({
        items: [...s.items, res.data.data],
        saveStatus: "success",
      }));
      return res.data.data;
    })
    .catch(() => {
      notesStore.setState({ saveStatus: "error" });
      return null;
    });
}

export function updateNote(id: string, content: string): Promise<void> {
  notesStore.setState({ saveStatus: "loading" });
  return api
    .patch<{ data: Note }>(getEndpoint("notesById", { id }), { content })
    .then((res) => {
      notesStore.setState((s) => ({
        items: s.items.map((n) => (n.id === id ? res.data.data : n)),
        saveStatus: "success",
      }));
    })
    .catch(() => {
      notesStore.setState({ saveStatus: "error" });
      throw new Error();
    });
}

export function deleteNote(id: string): void {
  const previous = notesStore.getState().items;
  hideStickyNote(id);
  notesStore.setState((s) => ({ items: s.items.filter((n) => n.id !== id) }));
  api.delete(getEndpoint("notesById", { id })).catch(() => {
    notesStore.setState({ items: previous });
  });
}

export function createEmptyNote(): Promise<Note | null> {
  return createNote("");
}

export function toggleNoteAI(id: string): void {
  const previous = notesStore.getState().items;
  const current = previous.find((n) => n.id === id);
  if (!current) return;
  const nextDisabled = !current.disabledForAI;
  notesStore.setState({
    items: previous.map((n) =>
      n.id === id ? { ...n, disabledForAI: nextDisabled } : n,
    ),
  });
  api
    .patch<{ data: Note }>(getEndpoint("notesById", { id }), {
      disabledForAI: nextDisabled,
    })
    .then((res) => {
      notesStore.setState((s) => ({
        items: s.items.map((n) => (n.id === id ? res.data.data : n)),
      }));
    })
    .catch(() => {
      notesStore.setState({ items: previous });
    });
}
