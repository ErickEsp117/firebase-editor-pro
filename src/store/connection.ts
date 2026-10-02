import { create } from "zustand";
import { getPlatform } from "../platform";
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
  importText(text: string): Promise<void>;
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
    let text: string | null;
    try {
      text = (await getPlatform().pickJsonFile())?.contents ?? null;
    } catch {
      set({ error: new ConnectionError("fileRead", ""), phase: "welcome" });
      return;
    }
    if (text === null) return;
    await get().importText(text);
  },

  async importText(text) {
    set({ phase: "verifying", error: null });
    try {
      const connection = await importKey(text);
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
