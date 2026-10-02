import { create } from "zustand";
import type { FirestoreDocument } from "../core";
import type { SaveMode } from "../components/DocumentEditor/editorModel";

export type EditorView = "table" | "json";

export interface EditorSession {
  /** Last server version: its updateTime is the save precondition and its fields the diff baseline. */
  baseDoc: FirestoreDocument;
  text: string;
}

interface EditorState {
  sessions: Record<string, EditorSession>;
  view: EditorView;
  mode: SaveMode;
  open(key: string, session: EditorSession): void;
  setText(key: string, text: string): void;
  rebase(key: string, session: EditorSession): void;
  setView(v: EditorView): void;
  setMode(m: SaveMode): void;
  clear(): void;
}

/** Sessions live outside React so unsaved edits survive navigation, remounts and language changes. */
export const useEditorStore = create<EditorState>((set) => ({
  sessions: {},
  view: "table",
  mode: "modified",
  open: (key, session) => set((s) => (s.sessions[key] ? s : { sessions: { ...s.sessions, [key]: session } })),
  setText: (key, text) =>
    set((s) => (s.sessions[key] ? { sessions: { ...s.sessions, [key]: { ...s.sessions[key], text } } } : s)),
  rebase: (key, session) => set((s) => ({ sessions: { ...s.sessions, [key]: session } })),
  setView: (view) => set({ view }),
  setMode: (mode) => set({ mode }),
  clear: () => set({ sessions: {} }),
}));
