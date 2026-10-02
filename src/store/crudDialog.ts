import { create } from "zustand";

export type CrudDialog =
  /** `collectionPath` null = the user types the (new) collection id; `parentDocPath` "" = root. */
  | { kind: "create"; parentDocPath: string; collectionPath: string | null }
  | { kind: "deleteDoc"; path: string }
  | { kind: "deleteCollection"; path: string }
  | { kind: "export"; scope: "doc" | "collection"; path: string }
  | { kind: "import"; scope: "doc" | "collection"; path: string };

interface CrudDialogState {
  dialog: CrudDialog | null;
  open(d: CrudDialog): void;
  close(): void;
}

export const useCrudDialog = create<CrudDialogState>((set) => ({
  dialog: null,
  open: (dialog) => set({ dialog }),
  close: () => set({ dialog: null }),
}));
