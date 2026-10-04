import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Platform } from "../../platform/types";
import {
  ACCOUNTS_KEY,
  LEGACY_CREDENTIAL_KEY,
  accountSecretKey,
  addAccount,
  connectAccount,
  importAccount,
  loadAccounts,
  removeAccount,
  setActiveAccount,
} from "../accounts";

const PEM = `-----BEGIN ${"PRIVATE"} KEY-----\nAAAA\n-----END PRIVATE KEY-----\n`;

function keyJson(over: Record<string, unknown> = {}): string {
  return JSON.stringify({
    type: "service_account",
    project_id: "proj-a",
    private_key: PEM,
    private_key_id: "kid-a",
    client_email: "sa@proj-a.iam.gserviceaccount.com",
    token_uri: "https://oauth2.googleapis.com/token",
    ...over,
  });
}
const keyB = () =>
  keyJson({ project_id: "proj-b", private_key_id: "kid-b", client_email: "sa@proj-b.iam.gserviceaccount.com" });

interface Failure {
  op: "set" | "delete";
  key: string | RegExp;
}

function mockPlatform() {
  const data = new Map<string, string>();
  const log: string[] = [];
  const failures: Failure[] = [];
  const maybeFail = (op: "set" | "delete", key: string) => {
    const hit = failures.findIndex((f) => f.op === op && (typeof f.key === "string" ? f.key === key : f.key.test(key)));
    if (hit >= 0) {
      failures.splice(hit, 1);
      throw new Error("injected failure");
    }
  };
  const p = {
    mode: "browser",
    signJwtRsa: vi.fn(async () => "a.b.c"),
    secureStore: {
      get: vi.fn(async (k: string) => data.get(k) ?? null),
      set: vi.fn(async (k: string, v: string) => {
        maybeFail("set", k);
        log.push(`set:${k}`);
        data.set(k, v);
      }),
      delete: vi.fn(async (k: string) => {
        maybeFail("delete", k);
        log.push(`delete:${k}`);
        data.delete(k);
      }),
    },
  } as unknown as Platform;
  const index = () => JSON.parse(data.get(ACCOUNTS_KEY) ?? "null");
  return { p, data, log, failures, index };
}

let uuidCounter = 0;
beforeEach(() => {
  uuidCounter = 0;
  vi.spyOn(crypto, "randomUUID").mockImplementation(
    () => `00000000-0000-4000-8000-${String(++uuidCounter).padStart(12, "0")}` as `${string}-${string}-${string}-${string}-${string}`,
  );
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const ID1 = "00000000-0000-4000-8000-000000000001";
const ID2 = "00000000-0000-4000-8000-000000000002";

describe("account index", () => {
  it("is empty with no stored data and writes nothing", async () => {
    const { p, log } = mockPlatform();
    expect(await loadAccounts(p)).toEqual({ version: 1, activeId: null, accounts: [] });
    expect(log).toEqual([]);
  });

  it("adds an account writing the credential first and the index second, and activates it", async () => {
    const { p, data, log, index } = mockPlatform();
    const res = await addAccount(keyJson(), p);
    expect(res.duplicate).toBe(false);
    expect(res.account).toMatchObject({
      id: ID1,
      projectId: "proj-a",
      clientEmail: "sa@proj-a.iam.gserviceaccount.com",
      privateKeyId: "kid-a",
    });
    expect(Number.isNaN(Date.parse(res.account.addedAt))).toBe(false);
    expect(log).toEqual([`set:sa:${ID1}`, `set:${ACCOUNTS_KEY}`]);
    expect(data.get(accountSecretKey(ID1))).toBe(keyJson());
    expect(index()).toMatchObject({ version: 1, activeId: ID1 });
    expect(index().accounts).toHaveLength(1);
  });

  it("never puts secrets in the index", async () => {
    const { p, data } = mockPlatform();
    await addAccount(keyJson(), p);
    await addAccount(keyB(), p);
    const raw = data.get(ACCOUNTS_KEY)!;
    expect(raw).not.toMatch(/BEGIN|AAAA|private_key"|token_uri/);
    for (const a of JSON.parse(raw).accounts) {
      expect(Object.keys(a).sort()).toEqual(["addedAt", "clientEmail", "id", "privateKeyId", "projectId"]);
    }
  });

  it("omits privateKeyId when the key has none", async () => {
    const { p, index } = mockPlatform();
    await addAccount(keyJson({ private_key_id: undefined }), p);
    expect("privateKeyId" in index().accounts[0]).toBe(false);
  });

  it("leaves no account behind when writing the credential fails", async () => {
    const { p, data, failures } = mockPlatform();
    failures.push({ op: "set", key: /^sa:/ });
    await expect(addAccount(keyJson(), p)).rejects.toThrow();
    expect(data.has(ACCOUNTS_KEY)).toBe(false);
  });

  it("keeps an orphan credential harmless when the crash happens between the two writes", async () => {
    const { p, data, failures } = mockPlatform();
    failures.push({ op: "set", key: ACCOUNTS_KEY });
    await expect(addAccount(keyJson(), p)).rejects.toThrow();
    expect(data.has(`sa:${ID1}`)).toBe(true);
    expect(data.has(ACCOUNTS_KEY)).toBe(false);
    expect((await loadAccounts(p)).accounts).toEqual([]);
    const res = await addAccount(keyJson(), p);
    expect(res.duplicate).toBe(false);
    expect((await loadAccounts(p)).accounts).toHaveLength(1);
  });

  it("dedupes by clientEmail + privateKeyId, selecting the existing account without new writes of a credential", async () => {
    const { p, log, index } = mockPlatform();
    const first = await addAccount(keyJson(), p);
    await addAccount(keyB(), p);
    log.length = 0;
    const again = await addAccount(keyJson(), p);
    expect(again.duplicate).toBe(true);
    expect(again.account.id).toBe(first.account.id);
    expect(log).toEqual([`set:${ACCOUNTS_KEY}`]);
    expect(index().accounts).toHaveLength(2);
    expect(index().activeId).toBe(first.account.id);
  });

  it("does not dedupe when the privateKeyId differs", async () => {
    const { p, index } = mockPlatform();
    await addAccount(keyJson(), p);
    const res = await addAccount(keyJson({ private_key_id: "kid-rotated" }), p);
    expect(res.duplicate).toBe(false);
    expect(index().accounts).toHaveLength(2);
  });

  it("dedupes keys that both lack a privateKeyId", async () => {
    const { p, index } = mockPlatform();
    await addAccount(keyJson({ private_key_id: undefined }), p);
    const res = await addAccount(keyJson({ private_key_id: undefined }), p);
    expect(res.duplicate).toBe(true);
    expect(index().accounts).toHaveLength(1);
  });

  it("persists the active id and treats an unknown active id as signed out", async () => {
    const { p, data } = mockPlatform();
    const a = await addAccount(keyJson(), p);
    const b = await addAccount(keyB(), p);
    expect((await loadAccounts(p)).activeId).toBe(b.account.id);
    await setActiveAccount(p, a.account.id);
    expect((await loadAccounts(p)).activeId).toBe(a.account.id);
    await setActiveAccount(p, null);
    const idx = await loadAccounts(p);
    expect(idx.activeId).toBeNull();
    expect(idx.accounts).toHaveLength(2);
    data.set(ACCOUNTS_KEY, JSON.stringify({ ...idx, activeId: "ghost" }));
    expect((await loadAccounts(p)).activeId).toBeNull();
  });

  it("rejects activating an account that does not exist", async () => {
    const { p, log } = mockPlatform();
    await expect(setActiveAccount(p, "ghost")).rejects.toThrow();
    expect(log).toEqual([]);
  });

  it("raises keyUnreadable for a corrupt index without overwriting it", async () => {
    const { p, data } = mockPlatform();
    data.set(ACCOUNTS_KEY, "{broken");
    await expect(loadAccounts(p)).rejects.toMatchObject({ kind: "keyUnreadable" });
    expect(data.get(ACCOUNTS_KEY)).toBe("{broken");
  });
});

describe("remove", () => {
  it("writes the index first and deletes the credential second", async () => {
    const { p, data, log } = mockPlatform();
    const a = await addAccount(keyJson(), p);
    await addAccount(keyB(), p);
    log.length = 0;
    const { index } = await removeAccount(p, a.account.id);
    expect(log).toEqual([`set:${ACCOUNTS_KEY}`, `delete:sa:${a.account.id}`]);
    expect(data.has(`sa:${a.account.id}`)).toBe(false);
    expect(index.accounts.map((x) => x.id)).toEqual([ID2]);
  });

  it("keeps the active account when removing a non-active one", async () => {
    const { p } = mockPlatform();
    const a = await addAccount(keyJson(), p);
    const b = await addAccount(keyB(), p);
    const { index } = await removeAccount(p, a.account.id);
    expect(index.activeId).toBe(b.account.id);
  });

  it("activates another account when removing the active one", async () => {
    const { p } = mockPlatform();
    const a = await addAccount(keyJson(), p);
    const b = await addAccount(keyB(), p);
    const { index } = await removeAccount(p, b.account.id);
    expect(index.activeId).toBe(a.account.id);
    expect((await loadAccounts(p)).activeId).toBe(a.account.id);
  });

  it("leaves no active account when the last one is removed", async () => {
    const { p, data } = mockPlatform();
    const a = await addAccount(keyJson(), p);
    const { index } = await removeAccount(p, a.account.id);
    expect(index).toEqual({ version: 1, activeId: null, accounts: [] });
    expect([...data.keys()]).toEqual([ACCOUNTS_KEY]);
  });

  it("drops the account even when deleting the credential fails afterwards", async () => {
    const { p, data, failures } = mockPlatform();
    const a = await addAccount(keyJson(), p);
    failures.push({ op: "delete", key: /^sa:/ });
    const res = await removeAccount(p, a.account.id);
    expect(res.index.accounts).toEqual([]);
    expect(res.orphaned).toBe(true);
    expect(data.has(`sa:${a.account.id}`)).toBe(true);
    expect((await loadAccounts(p)).accounts).toEqual([]);
  });

  it("does not delete the credential when the index write fails", async () => {
    const { p, data, failures } = mockPlatform();
    const a = await addAccount(keyJson(), p);
    failures.push({ op: "set", key: ACCOUNTS_KEY });
    await expect(removeAccount(p, a.account.id)).rejects.toThrow();
    expect(data.has(`sa:${a.account.id}`)).toBe(true);
    expect((await loadAccounts(p)).accounts).toHaveLength(1);
  });

  it("ignores an unknown id", async () => {
    const { p, log } = mockPlatform();
    await addAccount(keyJson(), p);
    log.length = 0;
    const { index } = await removeAccount(p, "ghost");
    expect(index.accounts).toHaveLength(1);
    expect(log).toEqual([]);
  });
});

describe("legacy migration", () => {
  it("a removed account does not come back from a legacy entry whose delete failed during migration", async () => {
    const { p, data, failures } = mockPlatform();
    data.set(LEGACY_CREDENTIAL_KEY, keyJson());
    failures.push({ op: "delete", key: LEGACY_CREDENTIAL_KEY });
    const migrated = await loadAccounts(p);
    expect(data.has(LEGACY_CREDENTIAL_KEY)).toBe(true);
    await removeAccount(p, migrated.accounts[0].id);
    expect(data.has(LEGACY_CREDENTIAL_KEY)).toBe(false);
    const reloaded = await loadAccounts(p);
    expect(reloaded.accounts).toEqual([]);
    expect(reloaded.activeId).toBeNull();
  });

  it("keeps the account listed when its legacy copy cannot be deleted, so the removal can be retried", async () => {
    const { p, data, failures, index } = mockPlatform();
    data.set(LEGACY_CREDENTIAL_KEY, keyJson());
    failures.push({ op: "delete", key: LEGACY_CREDENTIAL_KEY });
    const migrated = await loadAccounts(p);
    const id = migrated.accounts[0].id;
    failures.push({ op: "delete", key: LEGACY_CREDENTIAL_KEY });
    await expect(removeAccount(p, id)).rejects.toThrow("injected failure");
    expect(index().accounts.map((a: { id: string }) => a.id)).toEqual([id]);
    expect(data.has(accountSecretKey(id))).toBe(true);
    await removeAccount(p, id);
    expect((await loadAccounts(p)).accounts).toEqual([]);
  });

  it("removing another account leaves an unrelated legacy entry alone", async () => {
    const { p, data } = mockPlatform();
    const b = await addAccount(keyB(), p);
    data.set(LEGACY_CREDENTIAL_KEY, "not json");
    await removeAccount(p, b.account.id);
    expect(data.get(LEGACY_CREDENTIAL_KEY)).toBe("not json");
  });

  it("moves the legacy credential into an account, writing before deleting", async () => {
    const { p, data, log, index } = mockPlatform();
    data.set(LEGACY_CREDENTIAL_KEY, keyJson());
    const idx = await loadAccounts(p);
    expect(idx.accounts).toHaveLength(1);
    expect(idx.activeId).toBe(ID1);
    expect(log).toEqual([`set:sa:${ID1}`, `set:${ACCOUNTS_KEY}`, `delete:${LEGACY_CREDENTIAL_KEY}`]);
    expect(data.has(LEGACY_CREDENTIAL_KEY)).toBe(false);
    expect(data.get(`sa:${ID1}`)).toBe(keyJson());
    expect(index().accounts[0]).toMatchObject({ projectId: "proj-a", privateKeyId: "kid-a" });
  });

  it("is a no-op once migrated", async () => {
    const { p, data, log } = mockPlatform();
    data.set(LEGACY_CREDENTIAL_KEY, keyJson());
    await loadAccounts(p);
    log.length = 0;
    await loadAccounts(p);
    expect(log).toEqual([]);
  });

  it.each([
    ["the credential write", { op: "set", key: /^sa:/ } as Failure],
    ["the index write", { op: "set", key: ACCOUNTS_KEY } as Failure],
    ["the legacy delete", { op: "delete", key: LEGACY_CREDENTIAL_KEY } as Failure],
  ])("never loses the key when a crash hits %s, and re-running does not duplicate", async (_name, failure) => {
    const { p, data, failures } = mockPlatform();
    data.set(LEGACY_CREDENTIAL_KEY, keyJson());
    failures.push(failure);
    const firstRun = await loadAccounts(p).then(
      (i) => i,
      () => null,
    );
    const legacyGone = !data.has(LEGACY_CREDENTIAL_KEY);
    if (legacyGone) expect([...data.keys()].some((k) => k.startsWith("sa:"))).toBe(true);
    if (failure.op === "delete") expect(firstRun?.accounts).toHaveLength(1);
    const idx = await loadAccounts(p);
    expect(idx.accounts).toHaveLength(1);
    expect(idx.activeId).toBe(idx.accounts[0].id);
    // A legacy copy whose delete failed stays as never-read garbage once the index exists.
    if (failure.op !== "delete") expect(data.has(LEGACY_CREDENTIAL_KEY)).toBe(false);
    const conn = await connectAccount(p, idx.accounts[0].id);
    expect(conn.projectId).toBe("proj-a");
  });

  it.each([
    ["the same key", keyJson],
    ["another key", keyB],
  ])("never reads a legacy entry (%s) once an index exists, so it cannot prompt on every launch", async (_name, legacyKey) => {
    const { p, data } = mockPlatform();
    const a = await addAccount(keyJson(), p);
    await setActiveAccount(p, null);
    data.set(LEGACY_CREDENTIAL_KEY, legacyKey());
    const get = vi.mocked(p.secureStore.get);
    get.mockClear();
    const idx = await loadAccounts(p);
    expect(idx.accounts.map((x) => x.id)).toEqual([a.account.id]);
    expect(idx.activeId).toBeNull();
    expect(get.mock.calls.map((c) => c[0])).toEqual([ACCOUNTS_KEY]);
  });

  it("keeps an unreadable legacy entry and reports keyUnreadable", async () => {
    const { p, data, log } = mockPlatform();
    data.set(LEGACY_CREDENTIAL_KEY, "{not json");
    await expect(loadAccounts(p)).rejects.toMatchObject({ kind: "keyUnreadable" });
    expect(data.get(LEGACY_CREDENTIAL_KEY)).toBe("{not json");
    expect(log).toEqual([]);
  });

  it("does not block saved accounts because of an unreadable legacy entry", async () => {
    const { p, data } = mockPlatform();
    await addAccount(keyJson(), p);
    data.set(LEGACY_CREDENTIAL_KEY, "{not json");
    expect((await loadAccounts(p)).accounts).toHaveLength(1);
    expect(data.get(LEGACY_CREDENTIAL_KEY)).toBe("{not json");
  });
});

describe("connectAccount", () => {
  it("builds the connection from the stored credential without touching the network", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { p } = mockPlatform();
    const a = await addAccount(keyJson(), p);
    const conn = await connectAccount(p, a.account.id);
    expect(conn).toMatchObject({ projectId: "proj-a", clientEmail: "sa@proj-a.iam.gserviceaccount.com" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("raises keyUnreadable when the credential is missing or invalid", async () => {
    const { p, data } = mockPlatform();
    const a = await addAccount(keyJson(), p);
    data.delete(`sa:${a.account.id}`);
    await expect(connectAccount(p, a.account.id)).rejects.toMatchObject({ kind: "keyUnreadable" });
    data.set(`sa:${a.account.id}`, "{nope");
    await expect(connectAccount(p, a.account.id)).rejects.toMatchObject({ kind: "keyUnreadable" });
  });
});

describe("importAccount", () => {
  const ok = () =>
    vi.fn(async (url: string) =>
      url.includes("oauth2")
        ? new Response(JSON.stringify({ access_token: "tok", expires_in: 3600 }), { status: 200 })
        : new Response(JSON.stringify({ collectionIds: ["users"] }), { status: 200 }),
    );

  it("stores nothing when Google rejects the key", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ error: "invalid_grant", error_description: "bad" }), { status: 400 })),
    );
    const { p, data } = mockPlatform();
    const err = await importAccount(keyJson(), p, "k.json").catch((e) => e);
    expect(err).toMatchObject({ kind: "rejected", fileName: "k.json", keyId: "kid-a" });
    expect(data.size).toBe(0);
  });

  it("stores and activates a verified key", async () => {
    vi.stubGlobal("fetch", ok());
    const { p, index } = mockPlatform();
    const res = await importAccount(keyJson(), p);
    expect(res.duplicate).toBe(false);
    expect(res.connection.projectId).toBe("proj-a");
    expect(index().activeId).toBe(res.account.id);
  });

  it("selects an existing account for a duplicate key without calling the network", async () => {
    vi.stubGlobal("fetch", ok());
    const { p } = mockPlatform();
    const first = await importAccount(keyJson(), p);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const again = await importAccount(keyJson(), p);
    expect(again.duplicate).toBe(true);
    expect(again.account.id).toBe(first.account.id);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("re-importing the same key repairs a missing stored credential after verifying it", async () => {
    vi.stubGlobal("fetch", ok());
    const { p, data } = mockPlatform();
    const first = await importAccount(keyJson(), p);
    data.delete(accountSecretKey(first.account.id));
    await expect(connectAccount(p, first.account.id)).rejects.toMatchObject({ kind: "keyUnreadable" });
    const again = await importAccount(keyJson(), p);
    expect(again.duplicate).toBe(true);
    expect(again.account.id).toBe(first.account.id);
    expect(again.connection.projectId).toBe("proj-a");
    expect(data.get(accountSecretKey(first.account.id))).toBe(keyJson());
  });

  it("does not repair a missing credential with a key Google rejects", async () => {
    vi.stubGlobal("fetch", ok());
    const { p, data } = mockPlatform();
    const first = await importAccount(keyJson(), p);
    data.delete(accountSecretKey(first.account.id));
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: "invalid_grant" }), { status: 400 })));
    await expect(importAccount(keyJson(), p)).rejects.toMatchObject({ kind: "rejected" });
    expect(data.has(accountSecretKey(first.account.id))).toBe(false);
  });

  it("reports local key errors with the file name and stores nothing", async () => {
    const { p, data } = mockPlatform();
    const err = await importAccount("{not json", p, "broken.json").catch((e) => e);
    expect(err).toMatchObject({ kind: "keyInvalid", fileName: "broken.json" });
    expect(data.size).toBe(0);
  });

  it("rewrites a fresh index when the stored one is corrupt, so adding a key is never blocked", async () => {
    vi.stubGlobal("fetch", ok());
    const { p, data, index } = mockPlatform();
    data.set(ACCOUNTS_KEY, "{corrupt!");
    const res = await importAccount(keyJson(), p);
    expect(res.duplicate).toBe(false);
    expect(res.connection.projectId).toBe("proj-a");
    expect(index()).toEqual({ version: 1, activeId: res.account.id, accounts: [res.account] });
    expect(data.get(`sa:${res.account.id}`)).toBe(keyJson());
  });
});

describe("addAccount with a corrupt index", () => {
  it("replaces the unreadable index with a fresh one holding the new account", async () => {
    const { p, data, index } = mockPlatform();
    data.set(ACCOUNTS_KEY, "not json at all");
    const res = await addAccount(keyJson(), p);
    expect(res.duplicate).toBe(false);
    expect(index()).toEqual({ version: 1, activeId: res.account.id, accounts: [res.account] });
  });

  it("still refuses to store a rejected key when the index is corrupt", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ error: "invalid_grant", error_description: "bad" }), { status: 400 })),
    );
    const { p, data } = mockPlatform();
    data.set(ACCOUNTS_KEY, "{corrupt!");
    const err = await importAccount(keyJson(), p, "k.json").catch((e) => e);
    expect(err).toMatchObject({ kind: "rejected" });
    expect(data.get(ACCOUNTS_KEY)).toBe("{corrupt!");
  });
});
