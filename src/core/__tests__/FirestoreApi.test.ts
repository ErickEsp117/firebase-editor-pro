import { describe, expect, it } from "vitest";
import { ApiClient } from "../ApiClient";
import { ApiError } from "../ApiError";
import { FirestoreApi, fieldPath } from "../FirestoreApi";

interface Call {
  url: string;
  method: string;
  body?: unknown;
}

function setup(respond: (c: Call) => { status?: number; json: unknown } = () => ({ json: {} })) {
  const calls: Call[] = [];
  const fetch = async (url: string, init?: RequestInit) => {
    const call = { url, method: init?.method ?? "GET", body: init?.body ? JSON.parse(String(init.body)) : undefined };
    calls.push(call);
    const r = respond(call);
    return new Response(JSON.stringify(r.json), { status: r.status ?? 200 });
  };
  const auth = { getAccessToken: async () => "t", refresh: async () => "t" };
  const api = new FirestoreApi(new ApiClient(auth, { fetch, platform: { mode: "tauri" } }), "proj");
  return { api, calls };
}
const D = "https://firestore.googleapis.com/v1/projects/proj/databases/(default)/documents";

describe("FirestoreApi URL building", () => {
  it("lists root collection ids with the documents:listCollectionIds form", async () => {
    const { api, calls } = setup(() => ({ json: { collectionIds: ["a", "b"] } }));
    expect(await api.listCollectionIds()).toEqual({ collectionIds: ["a", "b"], nextPageToken: undefined });
    expect(calls[0]).toMatchObject({ url: `${D}:listCollectionIds`, method: "POST", body: {} });
    expect(calls[0].url).not.toContain("/-/");
  });

  it("lists subcollection ids under a document and forwards paging", async () => {
    const { api, calls } = setup();
    await api.listCollectionIds("c/d", { pageSize: 5, pageToken: "tok" });
    expect(calls[0]).toMatchObject({ url: `${D}/c/d:listCollectionIds`, body: { pageSize: 5, pageToken: "tok" } });
  });

  it("follows nextPageToken when listing all collection ids", async () => {
    const { api, calls } = setup((c) =>
      (c.body as { pageToken?: string }).pageToken
        ? { json: { collectionIds: ["b"] } }
        : { json: { collectionIds: ["a"], nextPageToken: "n" } },
    );
    expect(await api.listAllCollectionIds()).toEqual(["a", "b"]);
    expect(calls).toHaveLength(2);
  });

  it("passes list options as query params", async () => {
    const { api, calls } = setup(() => ({ json: { documents: [{ name: "x" }], nextPageToken: "n2" } }));
    const page = await api.listDocs("c/d/sub", { pageSize: 10, pageToken: "p", orderBy: "name desc", showMissing: true });
    expect(page.nextPageToken).toBe("n2");
    expect(calls[0].url).toBe(`${D}/c/d/sub?pageSize=10&pageToken=p&orderBy=name%20desc&showMissing=true`);
    await api.listDocs("c");
    expect(calls[1].url).toBe(`${D}/c`);
  });

  it("get retains name/createTime/updateTime", async () => {
    const doc = { name: "n", createTime: "c", updateTime: "u", fields: {} };
    const { api } = setup(() => ({ json: doc }));
    expect(await api.getDoc("c/d")).toEqual(doc);
  });

  it("creates with an explicit documentId and propagates ALREADY_EXISTS", async () => {
    const { api, calls } = setup(() => ({
      status: 409,
      json: { error: { code: 409, message: "exists", status: "ALREADY_EXISTS" } },
    }));
    const err = await api.createDoc("c", "my id", { a: { stringValue: "x" } }).catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ http: 409, status: "ALREADY_EXISTS" });
    expect(calls[0]).toMatchObject({ url: `${D}/c?documentId=my%20id`, method: "POST", body: { fields: { a: { stringValue: "x" } } } });
  });

  it("upserts with an exact repeated updateMask and updateTime precondition", async () => {
    const { api, calls } = setup();
    await api.upsertDoc("c/d", { a: { nullValue: null } }, { updateMask: ["a", "b.c", "x"], updateTime: "2026-01-01T00:00:00.123456Z" });
    expect(calls[0].method).toBe("PATCH");
    expect(calls[0].url).toBe(
      `${D}/c/d?updateMask.fieldPaths=a&updateMask.fieldPaths=%60b.c%60&updateMask.fieldPaths=x&currentDocument.updateTime=2026-01-01T00%3A00%3A00.123456Z`,
    );
  });

  it("supports exists precondition and full replace (no mask)", async () => {
    const { api, calls } = setup();
    await api.upsertDoc("c/d", {}, { exists: false });
    expect(calls[0].url).toBe(`${D}/c/d?currentDocument.exists=false`);
  });

  it("refuses an empty mask and conflicting preconditions", async () => {
    const { api, calls } = setup();
    await expect(api.upsertDoc("c/d", {}, { updateMask: [] })).rejects.toThrow(/empty updateMask/);
    await expect(api.upsertDoc("c/d", {}, { exists: true, updateTime: "t" })).rejects.toThrow(/either/);
    expect(calls).toHaveLength(0);
  });

  it("deletes with an optional precondition", async () => {
    const { api, calls } = setup();
    await api.deleteDoc("c/d");
    await api.deleteDoc("c/d", { updateTime: "2026-01-01T00:00:00Z" });
    expect(calls.map((c) => [c.method, c.url])).toEqual([
      ["DELETE", `${D}/c/d`],
      ["DELETE", `${D}/c/d?currentDocument.updateTime=2026-01-01T00%3A00%3A00Z`],
    ]);
  });

  it("quotes only non-identifier field paths", () => {
    expect(fieldPath("abc_1")).toBe("abc_1");
    expect(fieldPath("a-b")).toBe("`a-b`");
    expect(fieldPath("1x")).toBe("`1x`");
    expect(fieldPath("a`b")).toBe("`a\\`b`");
  });
});

describe("FirestoreApi collection helpers", () => {
  it("deleteCollection re-lists from the first page until empty and never reuses page tokens", async () => {
    let remaining = ["a", "b", "c"];
    const { api, calls } = setup((c) => {
      if (c.method === "DELETE") {
        remaining = remaining.filter((id) => !c.url.endsWith(`/c/${id}`));
        return { json: {} };
      }
      return { json: { documents: remaining.slice(0, 2).map((id) => ({ name: `projects/proj/databases/(default)/documents/c/${id}` })), nextPageToken: "x" } };
    });
    expect(await api.deleteCollection("c")).toBe(3);
    expect(calls.filter((c) => c.method === "DELETE").map((c) => c.url.slice(D.length))).toEqual(["/c/a", "/c/b", "/c/c"]);
    expect(calls.every((c) => !c.url.includes("pageToken"))).toBe(true);
  });

  it("countDocs follows nextPageToken", async () => {
    const { api } = setup((c) =>
      c.url.includes("pageToken=n") ? { json: { documents: [{ name: "z" }] } } : { json: { documents: [{ name: "x" }, { name: "y" }], nextPageToken: "n" } },
    );
    expect(await api.countDocs("c")).toBe(3);
  });
});
