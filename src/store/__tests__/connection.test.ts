import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ACCOUNTS_KEY, LEGACY_CREDENTIAL_KEY } from "../../core/accounts";
import { listRootCollections } from "../../core/connection";
import { FirestoreApi } from "../../core/FirestoreApi";
import { RemoteConfigApi } from "../../core/RemoteConfigApi";
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

const initial = { phase: "restoring" as const, accounts: [], activeId: null, connection: null, error: null, duplicateOf: null, retry: null };
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

  it("sends every later request with the new account's project and token", async () => {
    const b64 = (v: unknown) => Buffer.from(JSON.stringify(v)).toString("base64url");
    const calls: { url: string; auth: string | null }[] = [];
    setPlatformForTests({
      mode: "browser",
      // The JWT payload carries the account's client_email, so the token endpoint answer can differ per account.
      signJwtRsa: async (_pem: string, header: unknown, claims: unknown) => `${b64(header)}.${b64(claims)}.sig`,
      secureStore: {
        get: async (k: string) => data.get(k) ?? null,
        set: async (k: string, v: string) => void data.set(k, v),
        delete: async (k: string) => void data.delete(k),
      },
      pickJsonFile: async () => picked,
    } as unknown as Platform);
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        if (String(url).includes("oauth2")) {
          const assertion = new URLSearchParams(String(init?.body)).get("assertion") ?? "";
          const iss = JSON.parse(Buffer.from(assertion.split(".")[1], "base64url").toString()).iss;
          return new Response(JSON.stringify({ access_token: `tok:${iss}`, expires_in: 3600 }), { status: 200 });
        }
        const headers = (init?.headers ?? {}) as Record<string, string>;
        calls.push({ url: String(url), auth: headers.Authorization ?? null });
        if (String(url).includes("remoteConfig")) {
          return new Response(JSON.stringify({ parameters: {}, version: { versionNumber: "1" } }), { status: 200, headers: { ETag: "etag-1" } });
        }
        return new Response(JSON.stringify({ collectionIds: ["users"] }), { status: 200 });
      }),
    );
    const [a] = await addTwo(); // proj-b stays active after adding the second key
    const baseline = calls.length;
    await useConnection.getState().switchTo(a.id);
    const conn = useConnection.getState().connection!;
    await listRootCollections(conn);
    // The same constructions the Firestore and Remote Config views make from the active connection.
    await new FirestoreApi(conn.client, conn.projectId).listCollectionIds();
    await new RemoteConfigApi(conn.client, conn.projectId).getTemplate();
    const afterSwitch = calls.slice(baseline);
    expect(afterSwitch.some((c) => c.url.includes("firestore.googleapis.com"))).toBe(true);
    expect(afterSwitch.some((c) => c.url.includes("/projects/proj-a/remoteConfig"))).toBe(true);
    for (const c of afterSwitch) {
      expect(c.url).toContain("proj-a");
      expect(c.url).not.toContain("proj-b");
      expect(c.auth).toBe("Bearer tok:sa@proj-a.iam.gserviceaccount.com");
    }
    expect(afterSwitch.some((c) => c.auth === "Bearer tok:sa@proj-b.iam.gserviceaccount.com")).toBe(false);
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

  it("flags orphaned when the credential delete fails after the index was updated", async () => {
    const [a, b] = await addTwo();
    setPlatformForTests({
      mode: "browser",
      signJwtRsa: async () => "a.b.c",
      secureStore: {
        get: async (k: string) => data.get(k) ?? null,
        set: async (k: string, v: string) => void data.set(k, v),
        delete: async (k: string) => {
          if (k === `sa:${a.id}`) throw new Error("keychain unavailable");
          data.delete(k);
        },
      },
      pickJsonFile: async () => picked,
    } as unknown as Platform);
    await useConnection.getState().remove(a.id);
    const s = useConnection.getState();
    // The account is gone from the list and the index, but the credential survived and is reported.
    expect(s.orphaned).toBe(a.id);
    expect(s.accounts.map((x) => x.id)).toEqual([b.id]);
    expect(storedIndex().accounts.map((x: { id: string }) => x.id)).toEqual([b.id]);
    expect(data.has(`sa:${a.id}`)).toBe(true);
    expect(s.activeId).toBe(b.id);
    expect(s.connection?.projectId).toBe("proj-b");
    useConnection.getState().clearError();
    expect(useConnection.getState().orphaned).toBeNull();
  });
});

describe("clearError", () => {
  it("clears the error and the duplicate notice", () => {
    useConnection.setState({ error: new Error("x") as never, duplicateOf: "id" });
    useConnection.getState().clearError();
    expect(useConnection.getState()).toMatchObject({ error: null, duplicateOf: null });
  });
});

describe("keychain access denied (macOS prompt answered with Deny)", () => {
  it("reports keychainDenied instead of an unexpected error, and Retry connects once access is given", async () => {
    await addTwo();
    let deny = true;
    setPlatformForTests({
      mode: "tauri",
      signJwtRsa: async () => "a.b.c",
      secureStore: {
        get: async (k: string) => {
          if (deny) throw "KEYCHAIN_DENIED: User canceled the operation.";
          return data.get(k) ?? null;
        },
        set: async (k: string, v: string) => void data.set(k, v),
        delete: async (k: string) => void data.delete(k),
      },
      pickJsonFile: async () => picked,
    } as unknown as Platform);
    useConnection.setState(initial);
    await useConnection.getState().restore();
    expect(useConnection.getState().phase).toBe("welcome");
    expect(useConnection.getState().error?.kind).toBe("keychainDenied");
    deny = false;
    await useConnection.getState().retryRestore();
    expect(useConnection.getState()).toMatchObject({ phase: "connected", error: null, retry: null });
    expect(useConnection.getState().accounts).toHaveLength(2);
  });

  it("Retry repeats the denied switch, so it connects the account the user picked", async () => {
    await addTwo();
    await useConnection.getState().signOut();
    const [first, second] = useConnection.getState().accounts;
    let deny = true;
    const store = {
      get: async (k: string) => {
        if (deny && k !== ACCOUNTS_KEY) throw "KEYCHAIN_DENIED: User canceled the operation.";
        return data.get(k) ?? null;
      },
      set: async (k: string, v: string) => void data.set(k, v),
      delete: async (k: string) => void data.delete(k),
    };
    setPlatformForTests({ mode: "tauri", signJwtRsa: async () => "a.b.c", secureStore: store, pickJsonFile: async () => picked } as unknown as Platform);
    await useConnection.getState().switchTo(second.id);
    expect(useConnection.getState()).toMatchObject({ phase: "welcome", activeId: null });
    expect(useConnection.getState().error?.kind).toBe("keychainDenied");
    deny = false;
    await useConnection.getState().retry!();
    expect(useConnection.getState()).toMatchObject({ phase: "connected", activeId: second.id, error: null, retry: null });
    expect(second.id).not.toBe(first.id);
  });

  it("a successful retried removal on the welcome screen clears the denied banner", async () => {
    await addTwo();
    await useConnection.getState().signOut();
    const [first] = useConnection.getState().accounts;
    let deny = true;
    const store = {
      get: async (k: string) => data.get(k) ?? null,
      set: async (k: string, v: string) => {
        if (deny) throw "KEYCHAIN_DENIED: User canceled the operation.";
        data.set(k, v);
      },
      delete: async (k: string) => void data.delete(k),
    };
    setPlatformForTests({ mode: "tauri", signJwtRsa: async () => "a.b.c", secureStore: store, pickJsonFile: async () => picked } as unknown as Platform);
    await useConnection.getState().remove(first.id);
    expect(useConnection.getState().error?.kind).toBe("keychainDenied");
    deny = false;
    await useConnection.getState().retry!();
    expect(useConnection.getState()).toMatchObject({ phase: "welcome", error: null, retry: null });
    expect(useConnection.getState().accounts.map((a) => a.id)).not.toContain(first.id);
  });

  it("does not restore while a switch is still waiting on the keychain", async () => {
    useConnection.setState({ phase: "verifying" });
    await useConnection.getState().retryRestore();
    expect(useConnection.getState().phase).toBe("verifying");
  });

  it("offers no Retry for errors that cannot be repeated, and clearError drops it", async () => {
    await useConnection.getState().addText("{ not a key");
    expect(useConnection.getState().error).not.toBeNull();
    expect(useConnection.getState().retry).toBeNull();
    useConnection.setState({ retry: async () => {} });
    useConnection.getState().clearError();
    expect(useConnection.getState().retry).toBeNull();
  });
});
