import { LosslessNumber } from "lossless-json";
import { describe, expect, it } from "vitest";
import { parseEditorJson, stringifyEditorJson } from "../../../core";
import { ApiError } from "../../../core";
import { buildSavePlan, diffFields, hasChanges, isConflict, parseDraft } from "../editorModel";
import { addAt, deleteAt, setAt, typeOf, type Obj } from "../valueTypes";

const js = (v: unknown) => stringifyEditorJson(v).replace(/\s+/g, "");
const parse = (s: string) => parseEditorJson(s) as Obj;

describe("buildSavePlan", () => {
  const base = parse('{"a":"1","b":2,"c":true}');

  it("modified mode masks only changed and deleted fields, deleted ones absent from the payload", () => {
    const current = parse('{"a":"changed","b":2}');
    const plan = buildSavePlan(base, current, "modified");
    expect(plan.updateMask).toEqual(["a", "c"]);
    expect(Object.keys(plan.fields)).toEqual(["a"]);
  });

  it("full mode sends everything with no mask", () => {
    const plan = buildSavePlan(base, parse('{"a":"1","b":2}'), "full");
    expect(plan.updateMask).toBeUndefined();
    expect(Object.keys(plan.fields)).toEqual(["a", "b"]);
  });

  it("a key reorder alone is not a change", () => {
    const d = diffFields(base, parse('{"c":true,"b":2,"a":"1"}'));
    expect(Object.keys(d.changed)).toEqual([]);
    expect(d.deleted).toEqual([]);
  });

  it("keeps int64 exact", () => {
    const plan = buildSavePlan({}, parse('{"n":9007199254740993}'), "modified");
    expect(plan.fields.n).toEqual({ integerValue: "9007199254740993" });
  });
});

describe("parseDraft", () => {
  it("rejects malformed JSON, non-objects and array-in-array", () => {
    expect(parseDraft("{").ok).toBe(false);
    expect(parseDraft("[1]").ok).toBe(false);
    const r = parseDraft('{"x":[[1]]}');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.key).toBe("codec.errors.arrayInArray");
  });
});

describe("valueTypes", () => {
  it("identifies every type", () => {
    const doc = parse(
      '{"s":"x","i":1,"d":1.5,"b":true,"n":null,"t":{"__type__":"timestamp","__value__":"2026-01-01T00:00:00Z"},"r":{"__type__":"reference","__value__":"a/b"},"g":{"__type__":"geopoint","__value__":{"latitude":1.0,"longitude":2.0}},"y":{"__type__":"bytes","__value__":"aGVsbG8="},"a":[1],"m":{"k":1},"x":{"__type__":"timestamp","__value__":"z","extra":1}}',
    );
    expect(Object.fromEntries(Object.entries(doc).map(([k, v]) => [k, typeOf(v)]))).toEqual({
      s: "string", i: "integer", d: "double", b: "boolean", n: "null", t: "timestamp", r: "reference", g: "geopoint", y: "bytes", a: "array", m: "map", x: "map",
    });
  });

  it("immutable nested set/add/delete", () => {
    const doc = parse('{"m":{"a":1},"l":[1,2]}');
    const set = setAt(doc, ["m", "a"], new LosslessNumber("5")) as Obj;
    expect(js(set)).toBe('{"m":{"a":5},"l":[1,2]}');
    expect(js(doc)).toBe('{"m":{"a":1},"l":[1,2]}');
    expect(js(addAt(doc, ["l"], undefined, "x"))).toBe('{"m":{"a":1},"l":[1,2,"x"]}');
    expect(js(deleteAt(doc, ["l", 0]))).toBe('{"m":{"a":1},"l":[2]}');
    expect(js(deleteAt(doc, ["m"]))).toBe('{"l":[1,2]}');
  });
});

describe("isConflict", () => {
  it("flags precondition failures and missing docs, not other errors", () => {
    expect(isConflict(new ApiError(409, "ABORTED", ""))).toBe(true);
    expect(isConflict(new ApiError(400, "FAILED_PRECONDITION", ""))).toBe(true);
    expect(isConflict(new ApiError(404, "NOT_FOUND", ""))).toBe(true);
    expect(isConflict(new ApiError(403, "PERMISSION_DENIED", ""))).toBe(false);
    expect(isConflict(new ApiError(0, "UNAVAILABLE", ""))).toBe(false);
  });
});

describe("inherited property names as field names", () => {
  const own = (o: Record<string, unknown>) => parseEditorJson(JSON.stringify(o)) as Obj;

  it("diffs added, changed and deleted fields named like Object.prototype members", () => {
    const base = own({ keep: 1 });
    const added = diffFields(base, own({ keep: 1, constructor: "x", toString: 2, hasOwnProperty: 3 }));
    expect(Object.keys(added.changed).sort()).toEqual(["constructor", "hasOwnProperty", "toString"]);
    const removed = diffFields(own({ constructor: "x", toString: 2, hasOwnProperty: 3 }), own({}));
    expect(removed.deleted.sort()).toEqual(["constructor", "hasOwnProperty", "toString"]);
    expect(hasChanges(own({}), own({ constructor: 1 }))).toBe(true);
  });
});
