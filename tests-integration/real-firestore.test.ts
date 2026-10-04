import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { diffFields } from "../src/components/DocumentEditor/editorModel";
import { ApiClient } from "../src/core/ApiClient";
import { FirestoreApi } from "../src/core/FirestoreApi";
import { decodeDoc, encodeDoc, encodeFields, parseEditorJson, stringifyEditorJson } from "../src/core/FirestoreCodec";
import { ServiceAccountAuth } from "../src/core/ServiceAccountAuth";
import { BrowserPlatform } from "../src/platform/BrowserPlatform";

const root = resolve(__dirname, "..");
const keyPath = resolve(root, "dev-secrets/test-key.json");
const PREFIX = "fbep_test_";

// Writes go only to a unique fbep_test_* collection; every created doc is deleted in afterAll.
describe.skipIf(!existsSync(keyPath))("real Firestore CRUD (project of dev-secrets/test-key.json)", () => {
  const run = Date.now().toString(36);
  const coll = `${PREFIX}fsapi_${run}`;
  const created = new Set<string>();
  let api: FirestoreApi;
  let projectId: string;

  const guarded = (path: string) => {
    if (!path.startsWith(PREFIX)) throw new Error(`refusing to touch ${path}`);
    return path;
  };

  beforeAll(() => {
    const auth = ServiceAccountAuth.fromKeyJson(readFileSync(keyPath, "utf8"), { platform: new BrowserPlatform() });
    projectId = auth.projectId;
    api = new FirestoreApi(new ApiClient(auth, { platform: { mode: "browser" } }), projectId);
  });

  afterAll(async () => {
    // Children first so no "missing" parents remain.
    for (const path of [...created].sort((a, b) => b.split("/").length - a.split("/").length)) {
      await api.deleteDoc(guarded(path)).catch(() => undefined);
    }
  });


  async function countByWalk(collectionPath: string): Promise<number> {
    let n = 0;
    const docs = (await api.listDocs(collectionPath, { showMissing: true, pageSize: 300 })).documents;
    for (const d of docs) {
      n += 1;
      const rel = d.name.slice(d.name.indexOf("/documents/") + "/documents/".length);
      for (const sub of (await api.listCollectionIds(rel)).collectionIds) n += await countByWalk(`${rel}/${sub}`);
    }
    return n;
  }

  const source = `{
    "int64": 9007199254740993,
    "double": 1.5,
    "whole": 3.0,
    "text": "héllo",
    "yes": true,
    "nothing": null,
    "nan": {"__type__": "nan"},
    "inf": {"__type__": "-infinity"},
    "when": {"__type__": "timestamp", "__value__": "2026-09-30T12:34:56.123456789Z"},
    "geo": {"__type__": "geopoint", "__value__": {"latitude": 52.52, "longitude": 13.4}},
    "bytes": {"__type__": "bytes", "__value__": "aGVsbG8="},
    "emptyArr": [],
    "emptyMap": {},
    "nested": {"list": [1, "a", {"deep": [true]}]}
  }`;

  it("create -> get returns the exact values (and a timestamp truncated to microseconds)", async () => {
    const id = "doc1";
    const path = guarded(`${coll}/${id}`);
    created.add(path);
    const fullRef = `projects/${projectId}/databases/(default)/documents/${path}`;
    const editor = parseEditorJson(source) as Record<string, unknown>;
    editor.ref = { __type__: "reference", __value__: fullRef };

    const doc = await api.createDoc(guarded(coll), id, encodeFields(editor));
    expect(doc.name).toBe(fullRef);
    expect(doc.createTime).toBeTruthy();
    expect(doc.updateTime).toBeTruthy();

    const got = await api.getDoc(path);
    expect(got.updateTime).toBe(doc.updateTime);
    const back = JSON.parse(stringifyEditorJson(decodeDoc(got)));
    const text = stringifyEditorJson(decodeDoc(got));
    expect(text).toContain('"int64": 9007199254740993');
    expect(back).toMatchObject({
      double: 1.5,
      whole: 3,
      text: "héllo",
      yes: true,
      nothing: null,
      nan: { __type__: "nan" },
      inf: { __type__: "-infinity" },
      when: { __type__: "timestamp", __value__: "2026-09-30T12:34:56.123456Z" },
      geo: { __type__: "geopoint", __value__: { latitude: 52.52, longitude: 13.4 } },
      bytes: { __type__: "bytes", __value__: "aGVsbG8=" },
      emptyArr: [],
      emptyMap: {},
      nested: { list: [1, "a", { deep: [true] }] },
      ref: { __type__: "reference", __value__: fullRef },
    });
    expect(text).toContain('"whole": 3.0');
  });

  it("Firestore itself rejects reserved __x__ field names, so a tag-lookalike map cannot be stored", async () => {
    const fields = encodeFields(parseEditorJson('{"look": {"__type__": "wat", "__value__": 1, "other": "x"}}'));
    await expect(api.createDoc(guarded(coll), "lookalike", fields)).rejects.toMatchObject({ http: 400, status: "INVALID_ARGUMENT" });
  });

  it("fields named like inherited Object members round-trip through create, masked PATCH and delete", async () => {
    const path = guarded(`${coll}/inherited`);
    created.add(path);
    const doc = await api.createDoc(guarded(coll), "inherited", encodeFields(parseEditorJson('{"constructor":"c","toString":1,"hasOwnProperty":true,"keep":"k"}')));
    expect(JSON.parse(stringifyEditorJson(decodeDoc(doc)))).toEqual({ constructor: "c", toString: 1, hasOwnProperty: true, keep: "k" });
    const base = decodeDoc(doc);
    const next = parseEditorJson('{"constructor":"c2","keep":"k"}') as Record<string, unknown>;
    const { changed, deleted } = diffFields(base as never, next as never);
    const after = await api.upsertDoc(path, encodeFields(changed), { updateMask: [...Object.keys(changed), ...deleted], updateTime: doc.updateTime });
    const back = decodeDoc(after);
    expect(back.constructor).toBe("c2");
    expect(Object.prototype.hasOwnProperty.call(back, "toString")).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(back, "hasOwnProperty")).toBe(false);
    expect(back.keep).toBe("k");
  });

  it("relative references qualified via documentsRoot persist on create and PATCH and reopen as references", async () => {
    const root = `projects/${projectId}/databases/(default)/documents`;
    const path = guarded(`${coll}/relref`);
    created.add(path);
    const tag = (v: string) => ({ __type__: "reference", __value__: v });
    const doc = await api.createDoc(guarded(coll), "relref", encodeFields({ r: tag(`${coll}/doc1`) }, { documentsRoot: root }));
    expect(decodeDoc(doc).r).toEqual(tag(`${root}/${coll}/doc1`));
    const { fields, updateMask } = encodeDoc({ r2: tag(`${coll}/relref`) }, { documentsRoot: root });
    const after = await api.upsertDoc(path, fields, { updateMask, updateTime: doc.updateTime });
    expect(decodeDoc(after)).toMatchObject({ r: tag(`${root}/${coll}/doc1`), r2: tag(`${root}/${coll}/relref`) });
  });

  it("create with an existing id surfaces ALREADY_EXISTS", async () => {
    await expect(api.createDoc(coll, "doc1", {})).rejects.toMatchObject({ http: 409, status: "ALREADY_EXISTS" });
  });

  it("PATCH with a mask updates listed fields, deletes absent ones and leaves the rest", async () => {
    const path = guarded(`${coll}/doc1`);
    const before = await api.getDoc(path);
    const { fields, updateMask } = encodeDoc(parseEditorJson('{"text": "changed", "double": 2.5}'), {
      updateMask: ["text", "double", "yes"],
    });
    const after = await api.upsertDoc(path, fields, { updateMask, updateTime: before.updateTime });
    expect(after.updateTime).not.toBe(before.updateTime);

    const got = JSON.parse(stringifyEditorJson(decodeDoc(await api.getDoc(path))));
    expect(got.text).toBe("changed");
    expect(got.double).toBe(2.5);
    expect(got.yes).toBeUndefined();
    expect(got.nothing).toBeNull();
    expect(got.nested).toEqual({ list: [1, "a", { deep: [true] }] });
  });

  it("a stale updateTime precondition is rejected and nothing is overwritten", async () => {
    const path = guarded(`${coll}/doc1`);
    const stale = (await api.getDoc(path)).updateTime;
    await api.upsertDoc(path, encodeFields({ text: "newer" }), { updateMask: ["text"] });
    const err = await api
      .upsertDoc(path, encodeFields({ text: "stale write" }), { updateMask: ["text"], updateTime: stale })
      .catch((e) => e);
    expect([400, 404, 409]).toContain(err.http);
    expect(["FAILED_PRECONDITION", "ABORTED", "NOT_FOUND"]).toContain(err.status);
    const got = decodeDoc(await api.getDoc(path)) as { text: string };
    expect(got.text).toBe("newer");
  });

  it("fs-touch.mjs changes updateTime and keeps other fields", async () => {
    const path = guarded(`${coll}/doc1`);
    const before = await api.getDoc(path);
    const out = execFileSync("node", [resolve(root, "scripts/fs-touch.mjs"), path], { encoding: "utf8" });
    expect(out).toContain("touched");
    const after = await api.getDoc(path);
    expect(after.updateTime).not.toBe(before.updateTime);
    expect(after.fields?.fbep_touch).toBeDefined();
    expect(after.fields?.text).toEqual(before.fields?.text);
  });

  it("fs-touch.mjs refuses paths outside fbep_test_*", () => {
    expect(() => execFileSync("node", [resolve(root, "scripts/fs-touch.mjs"), "users/someone"], { stdio: "pipe" })).toThrow();
  });

  it("subcollections: listCollectionIds under a doc, listDocs and showMissing", async () => {
    const sub = guarded(`${coll}/doc1/subc`);
    created.add(`${sub}/s1`);
    created.add(`${sub}/s2`);
    await api.createDoc(sub, "s1", encodeFields({ n: 1 }));
    await api.createDoc(sub, "s2", encodeFields({ n: 2 }));
    expect((await api.listCollectionIds(`${coll}/doc1`)).collectionIds).toEqual(["subc"]);

    const page1 = await api.listDocs(sub, { pageSize: 1, orderBy: "__name__ asc" });
    expect(page1.documents).toHaveLength(1);
    expect(page1.documents[0].name.endsWith("/s1")).toBe(true);
    expect(page1.nextPageToken).toBeTruthy();
    const page2 = await api.listDocs(sub, { pageSize: 1, orderBy: "__name__ asc", pageToken: page1.nextPageToken });
    expect(page2.documents[0].name.endsWith("/s2")).toBe(true);

    // A document that exists only as the parent of a subcollection is "missing".
    created.add(`${coll}/ghost/inner/x`);
    await api.createDoc(`${coll}/ghost/inner`, "x", encodeFields({ a: 1 }));
    const names = (page: { documents: { name: string }[] }) => page.documents.map((d) => d.name.split("/").pop());
    expect(names(await api.listDocs(coll))).not.toContain("ghost");
    const withMissing = await api.listDocs(coll, { showMissing: true });
    expect(names(withMissing)).toContain("ghost");
    expect(withMissing.documents.find((d) => d.name.endsWith("/ghost"))?.fields).toBeUndefined();
  });

  it("lists root collections including the test collection", async () => {
    expect(await api.listAllCollectionIds()).toEqual(expect.arrayContaining([coll]));
  });

  it("deleteCollection removes the whole subtree: direct docs, missing parents and nested subcollections", async () => {
    const deep = guarded(`${PREFIX}fsdeep_${run}`);
    const leaves = [`${deep}/direct`, `${deep}/ghost/inner/leaf`, `${deep}/parent/sub/mid/deeper/leaf2`, `${deep}/parent/sub/mid2`];
    for (const leaf of leaves) {
      const i = leaf.lastIndexOf("/");
      await api.createDoc(leaf.slice(0, i), leaf.slice(i + 1), encodeFields({ n: 1 }));
    }
    try {
      // direct + ghost(missing) + parent(missing: only has sub) + mid(missing) + mid2 + inner leaf + deeper leaf2 ... counted via showMissing
      const expected = (await countByWalk(deep)) as number;
      expect(await api.countDocs(deep)).toBe(expected);
      expect(expected).toBeGreaterThanOrEqual(leaves.length + 3);
      expect(await api.deleteCollection(deep)).toBe(expected);
      expect((await api.listDocs(deep, { showMissing: true })).documents).toHaveLength(0);
      expect(await api.listAllCollectionIds(`${deep}/ghost`)).toEqual([]);
      expect(await api.listAllCollectionIds(`${deep}/parent/sub/mid`)).toEqual([]);
      expect(await api.listAllCollectionIds()).not.toContain(deep);
    } finally {
      await api.deleteCollection(deep).catch(() => undefined);
    }
  }, 60_000);

  it("delete honours a stale precondition, then deletes and 404s afterwards", async () => {
    const path = guarded(`${coll}/doc1`);
    const current = await api.getDoc(path);
    await expect(api.deleteDoc(path, { updateTime: "2020-01-01T00:00:00Z" })).rejects.toBeDefined();
    await api.deleteDoc(path, { updateTime: current.updateTime });
    await expect(api.getDoc(path)).rejects.toMatchObject({ http: 404, status: "NOT_FOUND" });
  });
});
