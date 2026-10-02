import { describe, expect, it, vi } from "vitest";
import { CodecError } from "../FirestoreCodec";
import { exportCollection, exportDocumentText, ImportError, planCollectionImport, planDocumentImport, runImport } from "../FirestoreIO";

const ROOT = "projects/p/databases/(default)/documents";
const TS = "2024-01-01T00:00:00Z";

describe("document import/export", () => {
  it("exports tagged JSON and re-imports to identical REST fields", () => {
    const fields = {
      big: { integerValue: "9007199254740993" },
      nan: { doubleValue: "NaN" },
      inf: { doubleValue: "Infinity" },
      ts: { timestampValue: "2026-01-02T03:04:05.123456Z" },
      ref: { referenceValue: `${ROOT}/a/b` },
      geo: { geoPointValue: { latitude: 52.5, longitude: 13.4 } },
      bytes: { bytesValue: "aGVsbG8=" },
      nested: { mapValue: { fields: { list: { arrayValue: { values: [{ doubleValue: 1.5 }] } } } } },
    };
    const text = exportDocumentText({ fields });
    expect(text).toContain('"__type__": "timestamp"');
    expect(text).toContain("9007199254740993");
    const [entry] = planDocumentImport(text, "x/y");
    expect(entry.path).toBe("x/y");
    expect(entry.fields).toEqual(expect.objectContaining({ big: fields.big, nan: fields.nan, inf: fields.inf, ts: fields.ts, ref: fields.ref, bytes: fields.bytes }));
    expect(entry.fields.geo).toEqual(fields.geo);
  });

  it("recognises Firefoo and jloosli shapes", () => {
    const text = JSON.stringify({
      a: { __datatype__: "timestamp", value: { _seconds: 1700000000, _nanoseconds: 5000 } },
      b: { __datatype__: "geopoint", value: { _latitude: 1, _longitude: 2 } },
      c: { __datatype__: "documentReference", value: "x/y" },
      d: { __double__: "NaN" },
    });
    const [e] = planDocumentImport(text, "x/y");
    expect(e.fields.a).toEqual({ timestampValue: "2023-11-14T22:13:20.000005Z" });
    expect(e.fields.c).toEqual({ referenceValue: "projects/-/databases/(default)/documents/x/y" });
    expect(e.fields.d).toEqual({ doubleValue: "NaN" });
  });

  it("rejects invalid JSON and bad payloads before anything is written", () => {
    expect(() => planDocumentImport("{bad", "x/y")).toThrow(CodecError);
    expect(() => planDocumentImport('{"a":{"__type__":"nope"}}', "x/y")).toThrow(CodecError);
    expect(() => planDocumentImport("[1]", "x/y")).toThrow(ImportError);
    expect(() => planDocumentImport("{}", "x")).toThrow(ImportError);
  });

  it("qualifies relative reference paths with the project's documents root", () => {
    const [e] = planDocumentImport('{"r":{"__type__":"reference","__value__":"a/b"},"l":[{"__type__":"reference","__value__":"projects/q/databases/(default)/documents/z/y"}]}', "x/y", "proj");
    expect(e.fields.r).toEqual({ referenceValue: "projects/proj/databases/(default)/documents/a/b" });
    expect(JSON.stringify(e.fields.l)).toContain("projects/q/databases/(default)/documents/z/y");
  });

  it("qualifies a relative path whose first segment is 'projects'", () => {
    const [e] = planDocumentImport('{"r":{"__type__":"reference","__value__":"projects/team"}}', "x/y", "proj");
    expect(e.fields.r).toEqual({ referenceValue: "projects/proj/databases/(default)/documents/projects/team" });
  });

  it("rejects a top-level __collections__ in a document import", () => {
    const run = () => planDocumentImport('{"a":1,"__collections__":{"sub":{"d1":{"b":2}}}}', "x/y");
    expect(run).toThrow(ImportError);
    expect(run).toThrow(expect.objectContaining({ code: "reservedKey", i18nKey: "io.errors.reservedKey" }));
  });

  it("does not reinterpret nested __collections__ keys in document imports", () => {
    const [e] = planDocumentImport('{"m":{"__collections__":{"k":1}}}', "x/y");
    expect(e.fields.m).toEqual({ mapValue: { fields: { __collections__: { mapValue: { fields: { k: { integerValue: "1" } } } } } } });
  });
});

describe("collection import/export", () => {
  it("plans collection imports with subcollections and validates ids", () => {
    const entries = planCollectionImport('{"d1":{"a":1,"__collections__":{"s":{"e":{"b":true}}}},"d2":{}}', "c");
    expect(entries.map((e) => e.path)).toEqual(["c/d1", "c/d1/s/e", "c/d2"]);
    expect(() => planCollectionImport('{"a/b":{}}', "c")).toThrow(ImportError);
    expect(() => planCollectionImport("{}", "c/d")).toThrow(ImportError);
    expect(() => planCollectionImport('{"d1":{"a":{"__type__":"x"}}}', "c")).toThrow(CodecError);
  });

  it("runImport writes sequentially without a mask", async () => {
    const upsertDoc = vi.fn().mockResolvedValue({});
    const entries = planCollectionImport('{"d1":{"a":1},"d2":{"a":2}}', "c");
    await expect(runImport({ upsertDoc }, entries)).resolves.toBe(2);
    expect(upsertDoc).toHaveBeenNthCalledWith(1, "c/d1", { a: { integerValue: "1" } });
  });

  it("exports documents with nested subcollections and skips empty missing docs", async () => {
    const docs: Record<string, { name: string; fields?: Record<string, Record<string, unknown>>; createTime?: string }[]> = {
      c: [
        { name: `${ROOT}/c/d1`, fields: { a: { stringValue: "x" } }, createTime: TS },
        { name: `${ROOT}/c/d2`, fields: {}, createTime: TS },
        { name: `${ROOT}/c/ghost` },
      ],
      "c/d1/s": [{ name: `${ROOT}/c/d1/s/e`, fields: { b: { booleanValue: true } }, createTime: TS }],
    };
    const api = {
      listDocs: vi.fn(async (p: string) => ({ documents: docs[p] ?? [] })),
      listAllCollectionIds: vi.fn(async (p?: string) => (p === "c/d1" ? ["s"] : [])),
    };
    const { text, docs: count } = await exportCollection(api, "c");
    expect(count).toBe(3);
    expect(JSON.parse(text)).toEqual({
      d1: { a: "x", __collections__: { s: { e: { b: true } } } },
      d2: {},
    });
  });
});
