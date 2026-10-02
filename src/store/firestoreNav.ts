import { create } from "zustand";

interface FirestoreNavState {
  /** Expanded tree nodes keyed by "c:<collectionPath>" or "d:<documentPath>". */
  expanded: Record<string, true>;
  selectedDoc: string | null;
  toggle(key: string): void;
  select(docPath: string | null): void;
  reset(): void;
}

export const useFirestoreNav = create<FirestoreNavState>((set) => ({
  expanded: {},
  selectedDoc: null,
  toggle: (key) =>
    set((s) => {
      const expanded = { ...s.expanded };
      if (expanded[key]) delete expanded[key];
      else expanded[key] = true;
      return { expanded };
    }),
  select: (selectedDoc) => set({ selectedDoc }),
  reset: () => set({ expanded: {}, selectedDoc: null }),
}));
