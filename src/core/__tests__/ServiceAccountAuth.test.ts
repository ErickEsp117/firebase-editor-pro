import { describe, expect, it, vi } from "vitest";
import type { Platform } from "../../platform/types";
import { ApiClient } from "../ApiClient";
import { ApiError } from "../ApiError";
import { KeyFileError, ServiceAccountAuth, parseKeyJson } from "../ServiceAccountAuth";

const key = {
  type: "service_account",
  project_id: "proj",
  private_key_id: "kid123",
  private_key: "-----BEGIN PRIVATE KEY-----\nAAAA\n-----END PRIVATE KEY-----\n",
  client_email: "sa@proj.iam.gserviceaccount.com",
  token_uri: "https://oauth2.googleapis.com/token",
};

function fakePlatform() {
  const signJwtRsa = vi.fn(async () => "signed.jwt.value");
  return { platform: { mode: "browser", signJwtRsa } as unknown as Platform, signJwtRsa };
}

const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers });

describe("parseKeyJson", () => {
  it("accepts a valid key", () => {
    expect(parseKeyJson(JSON.stringify(key)).project_id).toBe("proj");
  });
  it.each(["type", "project_id", "private_key", "client_email", "token_uri"])("rejects missing %s", (f) => {
    const bad: Record<string, unknown> = { ...key };
    delete bad[f];
    expect(() => parseKeyJson(JSON.stringify(bad))).toThrow(KeyFileError);
  });
  it("rejects wrong type and invalid JSON without echoing the key", () => {
    expect(() => parseKeyJson(JSON.stringify({ ...key, type: "authorized_user" }))).toThrow(KeyFileError);
    expect(() => parseKeyJson("{nope")).toThrow("not valid JSON");
  });
});

describe("ServiceAccountAuth", () => {
  it("builds exact claims/header and posts a jwt-bearer grant", async () => {
    const { platform, signJwtRsa } = fakePlatform();
    const fetchFn = vi.fn(async () => json(200, { access_token: "tok1", expires_in: 3600 }));
    const auth = new ServiceAccountAuth(parseKeyJson(JSON.stringify(key)), {
      platform, fetch: fetchFn, useProxy: false, now: () => 1_700_000_000_500,
    });
    expect(await auth.getAccessToken()).toBe("tok1");
    const [, header, claims] = signJwtRsa.mock.calls[0] as unknown as [string, object, object];
    expect(header).toEqual({ alg: "RS256", typ: "JWT", kid: "kid123" });
    expect(claims).toEqual({
      iss: key.client_email,
      scope: "https://www.googleapis.com/auth/datastore https://www.googleapis.com/auth/firebase.remoteconfig",
      aud: key.token_uri,
      iat: 1_700_000_000,
      exp: 1_700_003_600,
    });
    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(key.token_uri);
    const body = new URLSearchParams(init.body as string);
    expect(body.get("grant_type")).toBe("urn:ietf:params:oauth:grant-type:jwt-bearer");
    expect(body.get("assertion")).toBe("signed.jwt.value");
  });

  it("caches and re-mints 60s before expiry", async () => {
    const { platform } = fakePlatform();
    let n = 0;
    const fetchFn = vi.fn(async () => json(200, { access_token: `tok${++n}`, expires_in: 3600 }));
    let t = 0;
    const auth = new ServiceAccountAuth(key as never, { platform, fetch: fetchFn, useProxy: false, now: () => t });
    expect(await auth.getAccessToken()).toBe("tok1");
    t = 3_539_000;
    expect(await auth.getAccessToken()).toBe("tok1");
    t = 3_540_000;
    expect(await auth.getAccessToken()).toBe("tok2");
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it("surfaces token endpoint failures as ApiError", async () => {
    const { platform } = fakePlatform();
    const fetchFn = vi.fn(async () => json(400, { error: "invalid_grant", error_description: "bad" }));
    const auth = new ServiceAccountAuth(key as never, { platform, fetch: fetchFn, useProxy: false });
    await expect(auth.getAccessToken()).rejects.toMatchObject({ http: 400, status: "invalid_grant" });
  });
});

describe("ApiClient", () => {
  const setup = (responses: Response[]) => {
    const { platform } = fakePlatform();
    let n = 0;
    const tokenFetch = vi.fn(async () => json(200, { access_token: `tok${++n}`, expires_in: 3600 }));
    const auth = new ServiceAccountAuth(key as never, { platform, fetch: tokenFetch, useProxy: false });
    const apiFetch = vi.fn(async () => responses.shift()!);
    return { client: new ApiClient(auth, { fetch: apiFetch, useProxy: false }), apiFetch, tokenFetch };
  };

  it("sends Bearer and exposes response headers", async () => {
    const { client, apiFetch } = setup([json(200, { ok: 1 }, { ETag: "etag-1" })]);
    const res = await client.request("https://x/y", { method: "POST", body: {} });
    expect(res.headers.get("etag")).toBe("etag-1");
    expect(res.data).toEqual({ ok: 1 });
    const init = (apiFetch.mock.calls[0] as unknown as [string, RequestInit])[1];
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer tok1");
  });

  it("retries once with a renewed token on 401", async () => {
    const { client, apiFetch, tokenFetch } = setup([json(401, { error: { code: 401, message: "m", status: "UNAUTHENTICATED" } }), json(200, {})]);
    const res = await client.request("https://x/y");
    expect(res.status).toBe(200);
    expect(apiFetch).toHaveBeenCalledTimes(2);
    expect(tokenFetch).toHaveBeenCalledTimes(2);
    const init2 = (apiFetch.mock.calls[1] as unknown as [string, RequestInit])[1];
    expect((init2.headers as Record<string, string>).Authorization).toBe("Bearer tok2");
  });

  it("does not retry a second time on repeated 401", async () => {
    const e = { error: { code: 401, message: "m", status: "UNAUTHENTICATED" } };
    const { client, apiFetch } = setup([json(401, e), json(401, e)]);
    await expect(client.request("https://x/y")).rejects.toMatchObject({ http: 401, status: "UNAUTHENTICATED" });
    expect(apiFetch).toHaveBeenCalledTimes(2);
  });

  it("maps errors and network failures to ApiError", async () => {
    const a = setup([json(404, { error: { code: 404, message: "gone", status: "NOT_FOUND" } })]);
    await expect(a.client.request("https://x/y")).rejects.toMatchObject({ http: 404, status: "NOT_FOUND", message: "gone" });
    const { platform } = fakePlatform();
    const auth = new ServiceAccountAuth(key as never, { platform, fetch: async () => json(200, { access_token: "t", expires_in: 3600 }), useProxy: false });
    const client = new ApiClient(auth, { fetch: async () => { throw new TypeError("offline"); }, useProxy: false });
    const err = await client.request("https://x/y").catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ http: 0, status: "UNAVAILABLE" });
  });
});
