import { create } from "zustand";
import { getPlatform, type PickedFile } from "../platform";
import {
  connectAccount,
  importAccount,
  loadAccounts,
  removeAccount,
  setActiveAccount,
  type AccountMeta,
} from "../core/accounts";
import { classifyError, ConnectionError, type Connection } from "../core/connection";
import { useEditorStore } from "./documentEditor";
import { useRcEditor } from "./rcEditor";

export type ConnectionPhase = "restoring" | "welcome" | "verifying" | "connected";

interface ConnectionState {
  phase: ConnectionPhase;
  accounts: AccountMeta[];
  activeId: string | null;
  /** Derived from the active account; null while signed out. */
  connection: Connection | null;
  error: ConnectionError | null;
  /** Set when the last added key matched this saved account, which was selected instead. */
  duplicateOf: string | null;
  /** Id of the last removed account whose credential could not be deleted (leftover `sa:<id>` entry). */
  orphaned: string | null;
  restore(): Promise<void>;
  /** Internal: the actual restore work; `restore` dedupes concurrent invocations. */
  doRestore(): Promise<void>;
  addFromPicker(): Promise<void>;
  addText(text: string, fileName?: string): Promise<void>;
  switchTo(id: string): Promise<void>;
  signOut(): Promise<void>;
  remove(id: string): Promise<void>;
  clearError(): void;
}

/** Drafts belong to the account being left; callers confirm with hasUnsavedChanges() first. */
function discardEditorSessions(): void {
  useEditorStore.getState().clear();
  useRcEditor.getState().reset();
}

/**
 * React StrictMode mounts effects twice, which would run the legacy migration twice in parallel and
 * leave an orphaned `sa:<id>` entry behind. Sharing one in-flight restore keeps it single-run.
 */
let restoreInFlight: Promise<void> | null = null;

export const useConnection = create<ConnectionState>((set, get) => ({
  phase: "restoring",
  accounts: [],
  activeId: null,
  connection: null,
  error: null,
  duplicateOf: null,
  orphaned: null,

  restore() {
    restoreInFlight ??= get()
      .doRestore()
      .finally(() => {
        restoreInFlight = null;
      });
    return restoreInFlight;
  },

  async doRestore() {
    try {
      const platform = getPlatform();
      const index = await loadAccounts(platform);
      if (index.activeId === null) {
        set({ phase: "welcome", accounts: index.accounts, activeId: null, connection: null });
        return;
      }
      try {
        const connection = await connectAccount(platform, index.activeId);
        set({ phase: "connected", accounts: index.accounts, activeId: index.activeId, connection, error: null });
      } catch (e) {
        set({ phase: "welcome", accounts: index.accounts, activeId: null, connection: null, error: classifyError(e) });
      }
    } catch (e) {
      set({ phase: "welcome", error: classifyError(e) });
    }
  },

  async addFromPicker() {
    if (get().phase === "verifying") return;
    let picked: PickedFile | null;
    try {
      picked = await getPlatform().pickJsonFile();
    } catch {
      set({ error: new ConnectionError("fileRead", ""), phase: get().connection ? "connected" : "welcome" });
      return;
    }
    if (picked === null) return;
    await get().addText(picked.contents, picked.name);
  },

  async addText(text, fileName) {
    if (get().phase === "verifying") return;
    const previous = get();
    set({ phase: "verifying", error: null, duplicateOf: null });
    try {
      const res = await importAccount(text, getPlatform(), fileName);
      if (res.account.id !== previous.activeId) discardEditorSessions();
      set({
        phase: "connected",
        accounts: res.index.accounts,
        activeId: res.account.id,
        connection: res.connection,
        error: null,
        duplicateOf: res.duplicate ? res.account.id : null,
      });
    } catch (e) {
      set({ phase: previous.connection ? "connected" : "welcome", error: classifyError(e) });
    }
  },

  async switchTo(id) {
    if (get().phase === "verifying") return;
    const previousPhase = get().phase;
    const { accounts, activeId } = get();
    if (!accounts.some((a) => a.id === id)) return;
    const platform = getPlatform();
    set({ phase: "verifying" });
    try {
      const connection = await connectAccount(platform, id);
      await setActiveAccount(platform, id);
      if (id !== activeId) discardEditorSessions();
      set({ phase: "connected", activeId: id, connection, error: null, duplicateOf: null });
    } catch (e) {
      set({ phase: previousPhase, error: classifyError(e) });
    }
  },

  async signOut() {
    if (get().phase === "verifying") return;
    const previousPhase = get().phase;
    set({ phase: "verifying" });
    try {
      await setActiveAccount(getPlatform(), null);
    } catch (e) {
      set({ phase: previousPhase, error: classifyError(e) });
      return;
    }
    discardEditorSessions();
    set({ phase: "welcome", activeId: null, connection: null, error: null, duplicateOf: null });
  },

  async remove(id) {
    if (get().phase === "verifying") return;
    const previousPhase = get().phase;
    set({ phase: "verifying" });
    const platform = getPlatform();
    const wasActive = get().activeId === id;
    let result;
    try {
      result = await removeAccount(platform, id);
    } catch (e) {
      set({ phase: previousPhase, error: classifyError(e) });
      return;
    }
    const { index } = result;
    // The account is already out of the index; a failed credential delete leaves a harmless
    // orphaned `sa:<id>` entry that the UI must surface instead of ignoring.
    set({ orphaned: result.orphaned ? id : null });
    if (!wasActive) {
      set({ phase: previousPhase, accounts: index.accounts, duplicateOf: null });
      return;
    }
    discardEditorSessions();
    if (index.activeId === null) {
      set({ phase: "welcome", accounts: index.accounts, activeId: null, connection: null, error: null, duplicateOf: null });
      return;
    }
    try {
      const connection = await connectAccount(platform, index.activeId);
      set({
        phase: "connected",
        accounts: index.accounts,
        activeId: index.activeId,
        connection,
        error: null,
        duplicateOf: null,
      });
    } catch (e) {
      set({
        phase: "welcome",
        accounts: index.accounts,
        activeId: null,
        connection: null,
        error: classifyError(e),
        duplicateOf: null,
      });
    }
  },

  clearError: () => set({ error: null, duplicateOf: null, orphaned: null }),
}));
