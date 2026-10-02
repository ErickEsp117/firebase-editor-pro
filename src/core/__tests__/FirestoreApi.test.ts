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
  /** In-memory tree: docs listed via showMissing; missing parents have subcollections only. */
  function tree(existing: string[]) {
    const docs = new Set(existing);
    const allPaths = () => {
      const all = new Set<string>();
      for (const d of docs) {
        const parts = d.split("/");
        for (let n = 2; n <= parts.length; n += 2) all.add(parts.slice(0, n).join("/"));
      }
      return all;
    };
    const order: string[] = [];
    const t = setup((c) => {
      const rel = decodeURIComponent(c.url.slice(D.length)).replace(/\?.*$/, "");
      if (c.method === "DELETE") {
        order.push(rel.slice(1));
        docs.delete(rel.slice(1));
        return { json: {} };
      }
      if (rel.endsWith(":listCollectionIds")) {
        const parent = rel.slice(1, -":listCollectionIds".length);
        const ids = new Set<string>();
        for (const p of allPaths()) if (p.startsWith(`${parent}/`) && p.split("/").length === parent.split("/").length + 2) ids.add(p.split("/").slice(-2, -1)[0]);
        return { json: { collectionIds: [...ids] } };
      }
      if (!c.url.includes("showMissing=true")) throw new Error("listing must use showMissing=true");
      const coll = rel.slice(1);
      const names = [...allPaths()].filter((p) => p.startsWith(`${coll}/`) && p.split("/").length === coll.split("/").length + 1);
      return { json: { documents: names.map((n) => ({ name: `projects/proj/databases/(default)/documents/${n}` })) } };
    });
    return { ...t, docs, order };
  }

  it("countDocs includes direct docs, missing parents and every descendant", async () => {
    const { api } = tree(["c/a", "c/ghost/s/x", "c/ghost/s/y/t/z"]);
    // a, ghost, x, y(missing), z
    expect(await api.countDocs("c")).toBe(5);
  });

  it("deleteCollection deletes descendants before parents, depth-first, leaving nothing behind", async () => {
    const { api, docs, order } = tree(["c/a", "c/ghost/s/x", "c/ghost/s/y/t/z"]);
    expect(await api.deleteCollection("c")).toBe(5);
    expect(docs.size).toBe(0);
    for (const parent of ["c/ghost", "c/ghost/s/y"]) {
      const children = order.filter((p) => p.startsWith(`${parent}/`));
      expect(children.length).toBeGreaterThan(0);
      expect(Math.max(...children.map((p) => order.indexOf(p)))).toBeLessThan(order.indexOf(parent));
    }
  });
});
