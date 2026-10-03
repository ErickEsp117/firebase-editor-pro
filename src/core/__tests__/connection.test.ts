import { afterEach, describe, expect, it, vi } from "vitest";
import type { Platform } from "../../platform/types";
import { CREDENTIAL_KEY, ConnectionError, forgetConnection, importKey, restoreConnection } from "../connection";

const key = {
  type: "service_account",
  project_id: "proj",
  private_key: `-----BEGIN ${"PRIVATE"} KEY-----\nAAAA\n-----END PRIVATE KEY-----\n`,
  client_email: "sa@proj.iam.gserviceaccount.com",
  token_uri: "https://oauth2.googleapis.com/token",
};

function platform() {
  const data = new Map<string, string>();
  const p = {
    mode: "browser",
    signJwtRsa: vi.fn(async () => "a.b.c"),
    secureStore: {
      get: vi.fn(async (k: string) => data.get(k) ?? null),
      set: vi.fn(async (k: string, v: string) => void data.set(k, v)),
      delete: vi.fn(async (k: string) => void data.delete(k)),
    },
  } as unknown as Platform;
  return { p, data };
}

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });

afterEach(() => vi.unstubAllGlobals());

describe("connection", () => {
  it("stores the credential only after real verification succeeds", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        url.includes("oauth2") ? json(200, { access_token: "tok", expires_in: 3600 }) : json(200, { collectionIds: ["users"] }),
      ),
    );
    const { p, data } = platform();
    const conn = await importKey(JSON.stringify(key), p);
    expect(conn.projectId).toBe("proj");
    expect(data.has(CREDENTIAL_KEY)).toBe(true);
    expect((await restoreConnection(p))?.projectId).toBe("proj");
    await forgetConnection(p);
    expect(await restoreConnection(p)).toBeNull();
  });

  it("rejects malformed JSON locally without touching the network or storage", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { p, data } = platform();
    await expect(importKey("{not json", p)).rejects.toMatchObject({ kind: "keyInvalid" });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(data.size).toBe(0);
  });

  it("maps a Google invalid_grant to a 'rejected' error and stores nothing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => json(400, { error: "invalid_grant", error_description: "Invalid JWT Signature." })),
    );
    const { p, data } = platform();
    const err = await importKey(JSON.stringify(key), p).catch((e) => e);
    expect(err).toBeInstanceOf(ConnectionError);
    expect(err.kind).toBe("rejected");
    expect(err.detail).toContain("Invalid JWT Signature");
    expect(data.size).toBe(0);
  });

  it("attaches the file name and private_key_id to a rejected error without leaking key material", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => json(400, { error: "invalid_grant", error_description: "Invalid JWT Signature." })),
    );
    const { p } = platform();
    const text = JSON.stringify({ ...key, private_key_id: "abc123keyid" });
    const err = await importKey(text, p, "wrong-key.json").catch((e) => e);
    expect(err.kind).toBe("rejected");
    expect(err.fileName).toBe("wrong-key.json");
    expect(err.keyId).toBe("abc123keyid");
    expect(`${err.message} ${err.detail} ${err.fileName} ${err.keyId}`).not.toMatch(/BEGIN|AAAA/);
  });

  it("keeps working without a file name and omits a missing private_key_id", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json(400, { error: "invalid_grant", error_description: "x" })));
    const { p } = platform();
    const err = await importKey(JSON.stringify(key), p).catch((e) => e);
    expect(err.kind).toBe("rejected");
    expect(err.fileName).toBeUndefined();
    expect(err.keyId).toBeUndefined();
  });

  it("does not add a key id to a locally invalid file", async () => {
    const { p } = platform();
    const err = await importKey("{not json", p, "broken.json").catch((e) => e);
    expect(err.kind).toBe("keyInvalid");
    expect(err.fileName).toBe("broken.json");
    expect(err.keyId).toBeUndefined();
  });
});
