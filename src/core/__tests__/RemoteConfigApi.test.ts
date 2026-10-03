import { describe, expect, it } from "vitest";
import { ApiClient } from "../ApiClient";
import { ApiError } from "../ApiError";
import { apiErrorKind } from "../errorKind";
import { RemoteConfigApi, RemoteConfigConflictError, isRemoteConfigConflict } from "../RemoteConfigApi";

interface Call {
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: unknown;
}
interface Reply {
  status?: number;
  json?: unknown;
  text?: string;
  etag?: string;
}

function setup(respond: (c: Call) => Reply = () => ({ json: {} })) {
  const calls: Call[] = [];
  const fetch = async (url: string, init?: RequestInit) => {
    const call: Call = {
      url,
      method: init?.method ?? "GET",
      headers: { ...(init?.headers as Record<string, string>) },
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
    };
    calls.push(call);
    const r = respond(call);
    const headers = new Headers(r.etag ? { ETag: r.etag } : {});
    return new Response(r.text ?? JSON.stringify(r.json ?? {}), { status: r.status ?? 200, headers });
  };
  const auth = { getAccessToken: async () => "t", refresh: async () => "t" };
  const api = new RemoteConfigApi(new ApiClient(auth, { fetch, platform: { mode: "tauri" } }), "proj");
  return { api, calls };
}
const RC = "https://firebaseremoteconfig.googleapis.com/v1/projects/proj/remoteConfig";

const googleError = (code: number, status: string, message = "boom") => ({
  json: { error: { code, status, message } },
});

describe("RemoteConfigApi.getTemplate", () => {
  it("returns the template and the ETag from the response header", async () => {
    const { api, calls } = setup(() => ({ json: { parameters: { a: {} } }, etag: "etag-1-7" }));
    expect(await api.getTemplate()).toEqual({ template: { parameters: { a: {} } }, etag: "etag-1-7" });
    expect(calls[0]).toMatchObject({ url: RC, method: "GET" });
  });

  it("accepts an empty template body", async () => {
    const { api } = setup(() => ({ text: "", etag: "etag-1-0" }));
    expect(await api.getTemplate()).toEqual({ template: {}, etag: "etag-1-0" });
  });

  it("fails when the response carries no ETag", async () => {
    const { api } = setup(() => ({ json: {} }));
    await expect(api.getTemplate()).rejects.toBeInstanceOf(Error);
  });

  it.each([
    ["getTemplate", (api: RemoteConfigApi) => api.getTemplate()],
    ["publish", (api: RemoteConfigApi) => api.publish({}, "e", "d")],
    ["rollback", (api: RemoteConfigApi) => api.rollback("3")],
  ])("%s: a 200 without ETag is MISSING_ETAG with the real HTTP status, never offline", async (_name, run) => {
    const { api } = setup(() => ({ json: { parameters: {} } }));
    const err = await run(api).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).http).toBe(200);
    expect((err as ApiError).status).toBe("MISSING_ETAG");
    expect(apiErrorKind(err)).toBe("unexpectedResponse");
    expect(apiErrorKind(err)).not.toBe("offline");
  });
});

describe("RemoteConfigApi.publish", () => {
  const template = {
    parameters: { a: { defaultValue: { value: "1" }, futureField: { x: 1 } } },
    conditions: [{ name: "c", expression: "true", tagColor: "BLUE", extra: [1, 2] }],
    parameterGroups: { g: { description: "d", parameters: {} } },
    version: { versionNumber: "9", updateUser: { email: "a@b" }, description: "old" },
    somethingNew: { deep: [true, null] },
  };

  it("sends If-Match with the etag and replaces version with only the description, keeping every other key", async () => {
    const { api, calls } = setup(() => ({ json: { ok: true }, etag: "etag-1-8" }));
    const out = await api.publish(template, "etag-1-7", "my change");
    expect(calls[0].method).toBe("PUT");
    expect(calls[0].url).toBe(RC);
    expect(calls[0].headers["If-Match"]).toBe("etag-1-7");
    expect(calls[0].headers["Content-Type"]).toBe("application/json");
    expect(calls[0].body).toEqual({ ...template, version: { description: "my change" } });
    expect(out).toEqual({ template: { ok: true }, etag: "etag-1-8" });
  });

  it("does not mutate the caller's template", async () => {
    const { api } = setup(() => ({ etag: "e" }));
    const copy = structuredClone(template);
    await api.publish(template, "etag-1-7", "x");
    expect(template).toEqual(copy);
  });

  it("uses If-Match: * when forced", async () => {
    const { api, calls } = setup(() => ({ etag: "e" }));
    await api.publish(template, "etag-1-7", "forced", { force: true });
    expect(calls[0].headers["If-Match"]).toBe("*");
  });

  it("rejects descriptions over 1024 characters before calling the API", async () => {
    const { api, calls } = setup();
    await expect(api.publish(template, "e", "x".repeat(1025))).rejects.toBeInstanceOf(Error);
    expect(calls).toHaveLength(0);
  });

  it.each([400, 409, 412])("maps HTTP %i on an If-Match publish to a conflict error", async (http) => {
    const { api } = setup(() => ({ status: http, ...googleError(http, "FAILED_PRECONDITION", "[VERSION_MISMATCH]") }));
    const err = await api.publish(template, "etag-1-1", "d").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(RemoteConfigConflictError);
    expect(err).toBeInstanceOf(ApiError);
    expect(isRemoteConfigConflict(err)).toBe(true);
    expect((err as ApiError).http).toBe(http);
    expect((err as ApiError).status).toBe("FAILED_PRECONDITION");
  });

  it("does not treat a forced 400 as a conflict", async () => {
    const { api } = setup(() => ({ status: 400, ...googleError(400, "INVALID_ARGUMENT") }));
    const err = await api.publish(template, "e", "d", { force: true }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(isRemoteConfigConflict(err)).toBe(false);
  });

  it.each([401, 403, 404, 500])("leaves HTTP %i as a plain ApiError", async (http) => {
    const { api } = setup(() => ({ status: http, ...googleError(http, "PERMISSION_DENIED") }));
    const err = await api.publish(template, "e", "d").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(isRemoteConfigConflict(err)).toBe(false);
  });
});

describe("RemoteConfigApi.validate", () => {
  it("PUTs with validate_only and If-Match; the -0 etag of a successful validation is not surfaced", async () => {
    const { api, calls } = setup(() => ({ json: { version: {} }, etag: "etag-1-0" }));
    const result = await api.validate({ parameters: {}, keep: 1 }, "etag-1-5");
    expect(result).toBeUndefined();
    expect(calls[0]).toMatchObject({ url: `${RC}?validate_only=true`, method: "PUT" });
    expect(calls[0].headers["If-Match"]).toBe("etag-1-5");
    expect(calls[0].body).toEqual({ parameters: {}, keep: 1 });
  });

  it("leaves the template etag usable for a later publish after a successful validation", async () => {
    const { api, calls } = setup((c) => ({ etag: c.url.includes("validate_only") ? "etag-1-0" : "etag-1-6" }));
    await api.validate({ parameters: {} }, "etag-1-5");
    await api.publish({ parameters: {} }, "etag-1-5", "d");
    expect(calls[1].headers["If-Match"]).toBe("etag-1-5");
  });

  it("keeps a plain INVALID_ARGUMENT 400 as a validation error", async () => {
    const { api } = setup(() => ({ status: 400, ...googleError(400, "INVALID_ARGUMENT", "bad condition") }));
    const err = await api.validate({}, "e").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(isRemoteConfigConflict(err)).toBe(false);
  });

  it.each([
    [409, "ABORTED"],
    [412, "FAILED_PRECONDITION"],
    [400, "FAILED_PRECONDITION"],
  ])("maps HTTP %i %s to a conflict", async (http, status) => {
    const { api } = setup(() => ({ status: http, ...googleError(http, status) }));
    const err = await api.validate({}, "e").catch((e: unknown) => e);
    expect(isRemoteConfigConflict(err)).toBe(true);
  });
});

describe("RemoteConfigApi versions, rollback, defaults", () => {
  it("lists versions with paging and tolerates an empty response", async () => {
    const { api, calls } = setup(() => ({ json: {} }));
    expect(await api.listVersions({ pageSize: 5, pageToken: "tok" })).toEqual({ versions: [], nextPageToken: undefined });
    expect(calls[0].url).toBe(`${RC}:listVersions?pageSize=5&pageToken=tok`);
  });

  it("returns versions and the next page token", async () => {
    const versions = [{ versionNumber: "12", updateTime: "t", description: "d" }];
    const { api, calls } = setup(() => ({ json: { versions, nextPageToken: "n" } }));
    expect(await api.listVersions()).toEqual({ versions, nextPageToken: "n" });
    expect(calls[0].url).toBe(`${RC}:listVersions`);
  });

  it("rolls back with the version number as a string and returns the new etag", async () => {
    const { api, calls } = setup(() => ({ json: { parameters: {} }, etag: "etag-1-13" }));
    const out = await api.rollback(12);
    expect(calls[0]).toMatchObject({ url: `${RC}:rollback`, method: "POST", body: { versionNumber: "12" } });
    expect(out).toEqual({ template: { parameters: {} }, etag: "etag-1-13" });
  });

  it("downloads defaults as JSON text by default", async () => {
    const { api, calls } = setup(() => ({ text: '{"a":"1"}' }));
    expect(await api.downloadDefaults()).toBe('{"a":"1"}');
    expect(calls[0].url).toBe(`${RC}:downloadDefaults?format=JSON`);
  });
});
