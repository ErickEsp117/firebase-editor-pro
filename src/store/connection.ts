import { create } from "zustand";
import { getPlatform, type PickedFile } from "../platform";
import {
  classifyError,
  ConnectionError,
  forgetConnection,
  importKey,
  restoreConnection,
  type Connection,
} from "../core/connection";

export type ConnectionPhase = "restoring" | "welcome" | "verifying" | "connected";

interface ConnectionState {
  phase: ConnectionPhase;
  connection: Connection | null;
  error: ConnectionError | null;
  restore(): Promise<void>;
  importFromPicker(): Promise<void>;
  importText(text: string, fileName?: string): Promise<void>;
  disconnect(): Promise<void>;
  clearError(): void;
}

export const useConnection = create<ConnectionState>((set, get) => ({
  phase: "restoring",
  connection: null,
  error: null,

  async restore() {
    try {
      const connection = await restoreConnection();
      set(connection ? { phase: "connected", connection, error: null } : { phase: "welcome" });
    } catch (e) {
      set({ phase: "welcome", error: classifyError(e) });
    }
  },

  async importFromPicker() {
    if (get().phase === "verifying") return;
    let picked: PickedFile | null;
    try {
      picked = await getPlatform().pickJsonFile();
    } catch {
      set({ error: new ConnectionError("fileRead", ""), phase: "welcome" });
      return;
    }
    if (picked === null) return;
    await get().importText(picked.contents, picked.name);
  },

  async importText(text, fileName) {
    set({ phase: "verifying", error: null });
    try {
      const connection = await importKey(text, undefined, fileName);
      set({ phase: "connected", connection, error: null });
    } catch (e) {
      set({ phase: "welcome", connection: null, error: classifyError(e) });
    }
  },

  async disconnect() {
    await forgetConnection();
    set({ phase: "welcome", connection: null, error: null });
  },

  clearError: () => set({ error: null }),
}));
