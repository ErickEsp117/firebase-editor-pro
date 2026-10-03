import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ACCOUNTS_KEY, LEGACY_CREDENTIAL_KEY } from "../../core/accounts";
import { setPlatformForTests } from "../../platform";
import type { Platform } from "../../platform/types";
import { useConnection } from "../connection";
import { useEditorStore } from "../documentEditor";
import { useRcEditor } from "../rcEditor";

const PEM = `-----BEGIN ${"PRIVATE"} KEY-----\nAAAA\n-----END PRIVATE KEY-----\n`;
const keyJson = (over: Record<string, unknown> = {}) =>
  JSON.stringify({
    type: "service_account",
    project_id: "proj-a",
    private_key: PEM,
    private_key_id: "kid-a",
    client_email: "sa@proj-a.iam.gserviceaccount.com",
    token_uri: "https://oauth2.googleapis.com/token",
    ...over,
  });
const keyB = () =>
  keyJson({ project_id: "proj-b", private_key_id: "kid-b", client_email: "sa@proj-b.iam.gserviceaccount.com" });
const keyC = () =>
  keyJson({ project_id: "proj-c", private_key_id: "kid-c", client_email: "sa@proj-c.iam.gserviceaccount.com" });

let data: Map<string, string>;
let picked: { name: string; contents: string } | null;

const okFetch = () =>
  vi.fn(async (url: string) =>
    url.includes("oauth2")
      ? new Response(JSON.stringify({ access_token: "tok", expires_in: 3600 }), { status: 200 })
      : new Response(JSON.stringify({ collectionIds: ["users"] }), { status: 200 }),
  );

const initial = { phase: "restoring" as const, accounts: [], activeId: null, connection: null, error: null, duplicateOf: null };
const storedIndex = () => JSON.parse(data.get(ACCOUNTS_KEY) ?? "null");

beforeEach(() => {
  data = new Map();
  picked = null;
  setPlatformForTests({
    mode: "browser",
    signJwtRsa: async () => "a.b.c",
    secureStore: {
      get: async (k: string) => data.get(k) ?? null,
      set: async (k: string, v: string) => void data.set(k, v),
      delete: async (k: string) => void data.delete(k),
    },
    pickJsonFile: async () => picked,
  } as unknown as Platform);
  vi.stubGlobal("fetch", okFetch());
  useConnection.setState(initial);
  useEditorStore.getState().clear();
  useRcEditor.getState().reset();
});
afterEach(() => {
  setPlatformForTests(undefined);
  vi.unstubAllGlobals();
});

async function addTwo() {
  await useConnection.getState().addText(keyJson());
  await useConnection.getState().addText(keyB());
  return useConnection.getState().accounts;
}

describe("restore", () => {
  it("goes to welcome with no accounts", async () => {
    await useConnection.getState().restore();
    expect(useConnection.getState()).toMatchObject({ phase: "welcome", accounts: [], activeId: null, connection: null });
  });

  it("migrates a legacy credential and connects to it", async () => {
    data.set(LEGACY_CREDENTIAL_KEY, keyJson());
    await useConnection.getState().restore();
    const s = useConnection.getState();
    expect(s.phase).toBe("connected");
    expect(s.accounts).toHaveLength(1);
    expect(s.activeId).toBe(s.accounts[0].id);
    expect(s.connection?.projectId).toBe("proj-a");
    expect(data.has(LEGACY_CREDENTIAL_KEY)).toBe(false);
  });

  it("runs a single migration when restore is invoked concurrently (StrictMode double effect)", async () => {
    data.set(LEGACY_CREDENTIAL_KEY, keyJson());
    await Promise.all([useConnection.getState().restore(), useConnection.getState().restore()]);
    const s = useConnection.getState();
    expect(s.phase).toBe("connected");
    expect(s.accounts).toHaveLength(1);
    expect([...data.keys()].filter((k) => k.startsWith("sa:"))).toHaveLength(1);
  });

  it("keeps an unreadable legacy credential and reports keyUnreadable on the welcome screen", async () => {
    data.set(LEGACY_CREDENTIAL_KEY, "{broken");
    await useConnection.getState().restore();
    expect(useConnection.getState()).toMatchObject({ phase: "welcome", connection: null });
    expect(useConnection.getState().error?.kind).toBe("keyUnreadable");
    expect(data.get(LEGACY_CREDENTIAL_KEY)).toBe("{broken");
  });

  it("restores the last active account after a reload without network", async () => {
    await addTwo();
    const [a] = useConnection.getState().accounts;
    await useConnection.getState().switchTo(a.id);
    useConnection.setState(initial);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await useConnection.getState().restore();
    const s = useConnection.getState();
    expect(s).toMatchObject({ phase: "connected", activeId: a.id });
    expect(s.connection?.projectId).toBe("proj-a");
    expect(s.accounts).toHaveLength(2);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("lists the accounts on the welcome screen after a sign out", async () => {
    await addTwo();
    await useConnection.getState().signOut();
    useConnection.setState(initial);
    await useConnection.getState().restore();
    expect(useConnection.getState()).toMatchObject({ phase: "welcome", activeId: null, connection: null });
    expect(useConnection.getState().accounts).toHaveLength(2);
  });

  it("shows keyUnreadable when the active credential is gone but keeps the accounts listed", async () => {
    await addTwo();
    const active = useConnection.getState().activeId!;
    data.delete(`sa:${active}`);
    useConnection.setState(initial);
    await useConnection.getState().restore();
    const s = useConnection.getState();
    expect(s.phase).toBe("welcome");
    expect(s.error?.kind).toBe("keyUnreadable");
    expect(s.accounts).toHaveLength(2);
    expect(s.connection).toBeNull();
  });

  it("reports a corrupt index as keyUnreadable but still lets a new key rewrite it", async () => {
    data.set(ACCOUNTS_KEY, "{corrupt!");
    await useConnection.getState().restore();
    expect(useConnection.getState()).toMatchObject({ phase: "welcome", connection: null, accounts: [] });
    expect(useConnection.getState().error?.kind).toBe("keyUnreadable");
    await useConnection.getState().addText(keyJson());
    const s = useConnection.getState();
    expect(s).toMatchObject({ phase: "connected", error: null });
    expect(s.accounts).toHaveLength(1);
    expect(s.activeId).toBe(s.accounts[0].id);
    expect(storedIndex()).toMatchObject({ version: 1, activeId: s.activeId, accounts: [s.accounts[0]] });
  });
});

describe("addText / addFromPicker", () => {
  it("verifies, stores and activates a key", async () => {
    await useConnection.getState().addText(keyJson());
    const s = useConnection.getState();
    expect(s).toMatchObject({ phase: "connected", error: null, duplicateOf: null });
    expect(s.connection?.projectId).toBe("proj-a");
    expect(s.activeId).toBe(s.accounts[0].id);
    expect(storedIndex().activeId).toBe(s.activeId);
  });

  it("adds a second account and makes it the active one", async () => {
    const accounts = await addTwo();
    expect(accounts.map((a) => a.projectId)).toEqual(["proj-a", "proj-b"]);
    expect(useConnection.getState().activeId).toBe(accounts[1].id);
    expect(useConnection.getState().connection?.projectId).toBe("proj-b");
  });

  it("selects the existing account for a duplicate key and flags it", async () => {
    const [a] = (await addTwo(), useConnection.getState().accounts);
    await useConnection.getState().addText(keyJson());
    const s = useConnection.getState();
    expect(s.accounts).toHaveLength(2);
    expect(s.activeId).toBe(a.id);
    expect(s.duplicateOf).toBe(a.id);
    expect(s.connection?.projectId).toBe("proj-a");
    await useConnection.getState().addText(keyC());
    expect(useConnection.getState().duplicateOf).toBeNull();
  });

  it("keeps the current session and accounts when the new key is rejected, with file name and key id", async () => {
    await useConnection.getState().addText(keyJson());
    const before = useConnection.getState();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ error: "invalid_grant", error_description: "bad sig" }), { status: 400 })),
    );
    await useConnection.getState().addText(keyB(), "other.json");
    const s = useConnection.getState();
    expect(s.phase).toBe("connected");
    expect(s.connection).toBe(before.connection);
    expect(s.activeId).toBe(before.activeId);
    expect(s.accounts).toHaveLength(1);
    expect(s.error).toMatchObject({ kind: "rejected", fileName: "other.json", keyId: "kid-b" });
  });

  it("returns to welcome when the first key is rejected", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ error: "invalid_grant", error_description: "bad" }), { status: 400 })),
    );
    await useConnection.getState().addText(keyJson(), "k.json");
    expect(useConnection.getState()).toMatchObject({ phase: "welcome", connection: null, accounts: [] });
    expect(useConnection.getState().error?.kind).toBe("rejected");
    expect(data.size).toBe(0);
  });

  it("reads the file name from the picker", async () => {
    picked = { name: "picked.json", contents: "{bad" };
    await useConnection.getState().addFromPicker();
    expect(useConnection.getState().error).toMatchObject({ kind: "keyInvalid", fileName: "picked.json" });
    picked = { name: "ok.json", contents: keyJson() };
    await useConnection.getState().addFromPicker();
    expect(useConnection.getState().phase).toBe("connected");
  });

  it("does nothing when the picker is cancelled", async () => {
    useConnection.setState({ phase: "welcome" });
    await useConnection.getState().addFromPicker();
    expect(useConnection.getState().phase).toBe("welcome");
    expect(useConnection.getState().error).toBeNull();
  });
});

describe("switchTo", () => {
  it("changes the active account from the store without any network and persists it", async () => {
    const [a] = await addTwo();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await useConnection.getState().switchTo(a.id);
    const s = useConnection.getState();
    expect(s).toMatchObject({ phase: "connected", activeId: a.id, error: null });
    expect(s.connection?.projectId).toBe("proj-a");
    expect(storedIndex().activeId).toBe(a.id);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("creates a fresh connection object per switch", async () => {
    const [a, b] = await addTwo();
    await useConnection.getState().switchTo(a.id);
    const first = useConnection.getState().connection;
    await useConnection.getState().switchTo(b.id);
    await useConnection.getState().switchTo(a.id);
    expect(useConnection.getState().connection).not.toBe(first);
  });

  it("keeps the current account when the target credential is unreadable", async () => {
    const [a, b] = await addTwo();
    data.delete(`sa:${a.id}`);
    await useConnection.getState().switchTo(a.id);
    const s = useConnection.getState();
    expect(s.error?.kind).toBe("keyUnreadable");
    expect(s.activeId).toBe(b.id);
    expect(s.connection?.projectId).toBe("proj-b");
    expect(storedIndex().activeId).toBe(b.id);
  });

  it("ignores an unknown id", async () => {
    await addTwo();
    const before = useConnection.getState().activeId;
    await useConnection.getState().switchTo("ghost");
    expect(useConnection.getState().activeId).toBe(before);
  });

  it("discards the outgoing account's editor sessions", async () => {
    const [a] = await addTwo();
    useEditorStore.setState({ sessions: { "proj-b/users/u1": { baseDoc: {} as never, text: "x" } } });
    useRcEditor.getState().open({ projectId: "proj-b", etag: "e", baseText: "{}", text: "{}" });
    await useConnection.getState().switchTo(a.id);
    expect(useEditorStore.getState().sessions).toEqual({});
    expect(useRcEditor.getState().session).toBeNull();
  });
});

describe("signOut", () => {
  it("persists the signed-out state, returns to welcome and keeps every account", async () => {
    const accounts = await addTwo();
    await useConnection.getState().signOut();
    expect(useConnection.getState()).toMatchObject({ phase: "welcome", activeId: null, connection: null, error: null });
    expect(useConnection.getState().accounts).toEqual(accounts);
    expect(storedIndex().activeId).toBeNull();
    expect(storedIndex().accounts).toHaveLength(2);
    for (const a of accounts) expect(data.has(`sa:${a.id}`)).toBe(true);
  });

  it("lets the user reconnect to a saved account in one switch", async () => {
    const [a] = await addTwo();
    await useConnection.getState().signOut();
    await useConnection.getState().switchTo(a.id);
    expect(useConnection.getState()).toMatchObject({ phase: "connected", activeId: a.id });
  });
});

describe("remove", () => {
  it("activates another account when removing the active one", async () => {
    const [a, b] = await addTwo();
    await useConnection.getState().remove(b.id);
    const s = useConnection.getState();
    expect(s).toMatchObject({ phase: "connected", activeId: a.id });
    expect(s.connection?.projectId).toBe("proj-a");
    expect(s.accounts.map((x) => x.id)).toEqual([a.id]);
    expect(data.has(`sa:${b.id}`)).toBe(false);
    expect(storedIndex().activeId).toBe(a.id);
  });

  it("keeps the session untouched when removing a non-active account", async () => {
    const [a, b] = await addTwo();
    const connection = useConnection.getState().connection;
    await useConnection.getState().remove(a.id);
    const s = useConnection.getState();
    expect(s.activeId).toBe(b.id);
    expect(s.connection).toBe(connection);
    expect(s.accounts.map((x) => x.id)).toEqual([b.id]);
    expect(data.has(`sa:${a.id}`)).toBe(false);
  });

  it("returns to welcome after removing the last account", async () => {
    await useConnection.getState().addText(keyJson());
    const [a] = useConnection.getState().accounts;
    await useConnection.getState().remove(a.id);
    expect(useConnection.getState()).toMatchObject({ phase: "welcome", accounts: [], activeId: null, connection: null });
    expect([...data.keys()]).toEqual([ACCOUNTS_KEY]);
  });

  it("removes a saved account while signed out without connecting", async () => {
    const [a] = await addTwo();
    await useConnection.getState().signOut();
    await useConnection.getState().remove(a.id);
    expect(useConnection.getState()).toMatchObject({ phase: "welcome", activeId: null, connection: null });
    expect(useConnection.getState().accounts).toHaveLength(1);
  });

  it("drops editor sessions only when the active account is removed", async () => {
    const [a, b] = await addTwo();
    useEditorStore.setState({ sessions: { "proj-b/users/u1": { baseDoc: {} as never, text: "x" } } });
    await useConnection.getState().remove(a.id);
    expect(Object.keys(useEditorStore.getState().sessions)).toHaveLength(1);
    await useConnection.getState().remove(b.id);
    expect(useEditorStore.getState().sessions).toEqual({});
  });

  it("falls back to welcome with an error if the replacement account cannot be read", async () => {
    const [a, b] = await addTwo();
    data.delete(`sa:${a.id}`);
    await useConnection.getState().remove(b.id);
    const s = useConnection.getState();
    expect(s).toMatchObject({ phase: "welcome", connection: null });
    expect(s.error?.kind).toBe("keyUnreadable");
    expect(s.accounts.map((x) => x.id)).toEqual([a.id]);
  });
});

describe("clearError", () => {
  it("clears the error and the duplicate notice", () => {
    useConnection.setState({ error: new Error("x") as never, duplicateOf: "id" });
    useConnection.getState().clearError();
    expect(useConnection.getState()).toMatchObject({ error: null, duplicateOf: null });
  });
});
