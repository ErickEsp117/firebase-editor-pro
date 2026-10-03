import { create } from "zustand";

export type Area = "firestore" | "remoteConfig";

interface AreaState {
  area: Area;
  setArea(area: Area): void;
}

export const useArea = create<AreaState>((set) => ({
  area: "firestore",
  setArea: (area) => set({ area }),
}));

/** The Remote Config template being edited: lives outside React state so it survives area switches and remounts. */
export interface RcSession {
  projectId: string;
  etag: string;
  versionNumber?: string;
  updateTime?: string;
  /** Last text received from the server; `text` is the user's draft. */
  baseText: string;
  text: string;
}

interface RcEditorState {
  session: RcSession | null;
  open(session: RcSession): void;
  setText(text: string): void;
  reset(): void;
}

export const useRcEditor = create<RcEditorState>((set) => ({
  session: null,
  open: (session) => set({ session }),
  setText: (text) => set((s) => (s.session ? { session: { ...s.session, text } } : s)),
  reset: () => set({ session: null }),
}));
