import { create } from "zustand";

/**
 * Table cells keep a local draft until they commit on blur or Enter. While such a draft differs from the
 * stored value it is an unsaved change too, even when it is not valid yet and cannot be committed.
 * Cells belong to an area (the open Firestore document or the Remote Config template), so one area's
 * discard or reload never touches the other's cells.
 */
export type InputScope = "firestore" | "rc";

interface PendingInputsState {
  ids: Record<string, InputScope>;
  /** Bumped per area to make its cells drop their uncommitted drafts (Discard, a confirmed reload). */
  epochs: Record<InputScope, number>;
  mark(id: string, pending: boolean, scope: InputScope): void;
  resetAll(scope: InputScope): void;
}

export const usePendingInputs = create<PendingInputsState>((set) => ({
  ids: {},
  epochs: { firestore: 0, rc: 0 },
  mark: (id, pending, scope) =>
    set((s) => {
      if ((s.ids[id] === scope) === pending) return s;
      const ids = { ...s.ids };
      if (pending) ids[id] = scope;
      else delete ids[id];
      return { ids };
    }),
  resetAll: (scope) =>
    set((s) => ({
      ids: Object.fromEntries(Object.entries(s.ids).filter(([, sc]) => sc !== scope)),
      epochs: { ...s.epochs, [scope]: s.epochs[scope] + 1 },
    })),
}));

/** Any uncommitted cell, or only those of one area. */
export const hasPendingInputs = (scope?: InputScope): boolean =>
  Object.values(usePendingInputs.getState().ids).some((sc) => scope === undefined || sc === scope);

/** Hook form of hasPendingInputs for rendering. */
export const usePendingIn = (scope: InputScope): boolean =>
  usePendingInputs((s) => Object.values(s.ids).some((sc) => sc === scope));
