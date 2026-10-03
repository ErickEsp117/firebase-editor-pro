import { create } from "zustand";

/**
 * Table cells keep a local draft until they commit on blur or Enter. While such a draft differs from the
 * stored value it is an unsaved change too, even when it is not valid yet and cannot be committed.
 */
interface PendingInputsState {
  ids: Record<string, true>;
  mark(id: string, pending: boolean): void;
}

export const usePendingInputs = create<PendingInputsState>((set) => ({
  ids: {},
  mark: (id, pending) =>
    set((s) => {
      if (Boolean(s.ids[id]) === pending) return s;
      const ids = { ...s.ids };
      if (pending) ids[id] = true;
      else delete ids[id];
      return { ids };
    }),
}));

export const hasPendingInputs = (): boolean => Object.keys(usePendingInputs.getState().ids).length > 0;
