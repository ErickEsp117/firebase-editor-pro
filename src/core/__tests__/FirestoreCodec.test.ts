import { describe, expect, it } from "vitest";
import {
  CodecError,
  decodeDoc,
  decodeFields,
  encodeDoc,
  encodeFields,
  formatEditorJson,
  normalizeTimestamp,
  parseEditorJson,
  repairEditorJson,
  stringifyEditorJson,
} from "../FirestoreCodec";

const enc = (text: string, opts = {}) => encodeFields(parseEditorJson(text), opts);
const dec = (fields: object) => stringifyEditorJson(decodeFields(fields, ""));
const codecError = (fn: () => unknown): CodecError => {
  try {
    fn();
  } catch (e) {
    expect(e).toBeInstanceOf(CodecError);
    return e as CodecError;
  }
  throw new Error("expected CodecError");
};

/** editor text -> REST -> editor text must be the identity on canonical text. */
const roundTrip = (obj: unknown) => {
  const text = stringifyEditorJson(parseEditorJson(JSON.stringify(obj)));
  const rest = enc(text);
  expect(dec(rest)).toBe(text);
  return rest;
};

describe("FirestoreCodec round trips", () => {
  it("keeps int64 beyond MAX_SAFE_INTEGER exact in both directions", () => {
    const rest = enc('{"n": 9007199254740993}');
    expect(rest.n).toEqual({ integerValue: "9007199254740993" });
    expect(dec(rest)).toContain("9007199254740993");
    expect(dec({ n: { integerValue: "-9223372036854775808" } })).toContain("-9223372036854775808");
  });

  it("rejects integers outside int64 with a clear error", () => {
    const e = codecError(() => enc('{"n": 9223372036854775808}'));
    expect(e.code).toBe("invalidNumber");
    expect(e.path).toBe("n");
  });

  it("distinguishes integers from doubles, including whole-valued doubles", () => {
    const rest = enc('{"i": 42, "d": 1.5, "w": 3.0}');
    expect(rest.i).toEqual({ integerValue: "42" });
    expect(rest.d).toEqual({ doubleValue: 1.5 });
    expect(rest.w).toEqual({ doubleValue: 3 });
    expect(dec({ w: { doubleValue: 3 } })).toBe('{\n  "w": 3.0\n}');
    roundTrip({ i: 42, d: 1.5, w: 3.0, neg: -0.5, big: 1e21 });
  });

  it("round-trips NaN and +/-Infinity through tags", () => {
    const rest = roundTrip({
      a: { __type__: "nan" },
      b: { __type__: "infinity" },
      c: { __type__: "-infinity" },
    });
    expect(rest.a).toEqual({ doubleValue: "NaN" });
    expect(rest.b).toEqual({ doubleValue: "Infinity" });
    expect(rest.c).toEqual({ doubleValue: "-Infinity" });
  });

  it("round-trips timestamps with 0, 3 and 6 fractional digits", () => {
    for (const ts of ["2026-09-30T12:34:56Z", "2026-09-30T12:34:56.123Z", "2026-09-30T12:34:56.123456Z"]) {
      expect(roundTrip({ t: { __type__: "timestamp", __value__: ts } }).t).toEqual({ timestampValue: ts });
    }
  });

  it("truncates 9-digit timestamps to microseconds on save (documented behavior)", () => {
    const rest = enc('{"t": {"__type__": "timestamp", "__value__": "2014-10-02T15:01:23.045123456Z"}}');
    expect(rest.t).toEqual({ timestampValue: "2014-10-02T15:01:23.045123Z" });
    expect(normalizeTimestamp("2014-10-02T15:01:23.000000900Z")).toBe("2014-10-02T15:01:23Z");
  });

  it("decodes REST 9-digit timestamps untouched", () => {
    expect(dec({ t: { timestampValue: "2014-10-02T15:01:23.045123456Z" } })).toContain("2014-10-02T15:01:23.045123456Z");
  });

  it("round-trips reference, geopoint, bytes and null", () => {
    const full = "projects/p/databases/(default)/documents/coll/doc";
    const rest = roundTrip({
      r: { __type__: "reference", __value__: full },
      rel: { __type__: "reference", __value__: "fbep_test_io/doc" },
      g: { __type__: "geopoint", __value__: { latitude: 52.52, longitude: 13.4 } },
      b: { __type__: "bytes", __value__: "aGVsbG8=" },
      n: null,
      t: true,
      f: false,
      s: "héllo",
    });
    expect(rest.r).toEqual({ referenceValue: full });
    expect(rest.g).toEqual({ geoPointValue: { latitude: 52.52, longitude: 13.4 } });
    expect(rest.b).toEqual({ bytesValue: "aGVsbG8=" });
    expect(rest.n).toEqual({ nullValue: null });
  });

  it("round-trips empty arrays and maps and decodes REST's omitted-field quirks", () => {
    const rest = roundTrip({ a: [], m: {}, nested: { a: [], m: {} } });
    expect(rest.a).toEqual({ arrayValue: { values: [] } });
    expect(rest.m).toEqual({ mapValue: { fields: {} } });
    expect(dec({ a: { arrayValue: {} }, m: { mapValue: {} } })).toBe('{\n  "a": [],\n  "m": {}\n}');
  });

  it("round-trips deep nesting (12 levels) and mixed arrays", () => {
    let deep: unknown = { leaf: 9007199254740992 };
    for (let i = 0; i < 12; i++) deep = { [`l${i}`]: deep, arr: [1, "x", { k: [true, null] }] };
    roundTrip(deep as object);
  });

  it("accepts programmatic bigint/number values", () => {
    const rest = encodeFields({ a: 5n, b: 5, c: 0.25, d: NaN });
    expect(rest).toEqual({
      a: { integerValue: "5" },
      b: { integerValue: "5" },
      c: { doubleValue: 0.25 },
      d: { doubleValue: "NaN" },
    });
  });

  it("supports optional integer/double tags", () => {
    const rest = enc('{"i": {"__type__":"integer","__value__":9007199254740993}, "d": {"__type__":"double","__value__":3}}');
    expect(rest.i).toEqual({ integerValue: "9007199254740993" });
    expect(rest.d).toEqual({ doubleValue: 3 });
  });
});

describe("tag anti-collision rule", () => {
  it("(1) exact keys + known type + valid payload is a tag", () => {
    expect(enc('{"x": {"__type__": "bytes", "__value__": "AA=="}}').x).toEqual({ bytesValue: "AA==" });
  });

  it("(2) exact keys + unknown type is a clear error", () => {
    const e = codecError(() => enc('{"o": {"inner": {"__type__": "wat", "__value__": 1}}}'));
    expect(e.code).toBe("unknownType");
    expect(e.path).toBe("o.inner");
    expect(e.i18nKey).toBe("codec.errors.unknownType");
    expect(codecError(() => enc('{"x": {"__type__": "wat"}}')).code).toBe("unknownType");
    expect(codecError(() => enc('{"x": {"__type__": 5}}')).code).toBe("unknownType");
  });

  it("(2) exact keys + invalid payload is a clear error, never a map", () => {
    for (const bad of [
      '{"__type__":"timestamp","__value__":"yesterday"}',
      '{"__type__":"timestamp"}',
      '{"__type__":"geopoint","__value__":{"latitude":1}}',
      '{"__type__":"geopoint","__value__":{"latitude":91,"longitude":0}}',
      '{"__type__":"bytes","__value__":"not base64!"}',
      '{"__type__":"reference","__value__":""}',
      '{"__type__":"nan","__value__":1}',
      '{"__type__":"integer","__value__":1.5}',
    ]) {
      const e = codecError(() => enc(`{"f": ${bad}}`));
      expect(e.code).toBe("invalidPayload");
      expect(e.path).toBe("f");
    }
  });

  it("(2) write-only serverTimestamp sentinel is reported as unsupported", () => {
    expect(codecError(() => enc('{"f": {"__type__":"serverTimestamp"}}')).code).toBe("unsupportedType");
  });

  it("(3) __type__ plus extra keys is an ordinary user map", () => {
    const rest = enc('{"f": {"__type__": "wat", "__value__": 1, "other": "x"}, "g": {"__type__": "timestamp", "extra": 1}}');
    expect(rest.f).toEqual({
      mapValue: {
        fields: {
          __type__: { stringValue: "wat" },
          __value__: { integerValue: "1" },
          other: { stringValue: "x" },
        },
      },
    });
    expect((rest.g as { mapValue: unknown }).mapValue).toBeDefined();
    expect(dec(rest)).toContain('"other": "x"');
  });

  it("does not treat __value__ alone as a tag", () => {
    expect(enc('{"f": {"__value__": "x"}}').f).toEqual({ mapValue: { fields: { __value__: { stringValue: "x" } } } });
  });
});

describe("array-in-array", () => {
  it("is rejected with the path and a wrap-in-map hint", () => {
    const e = codecError(() => enc('{"a": {"b": [1, [2, 3]]}}'));
    expect(e.code).toBe("arrayInArray");
    expect(e.path).toBe("a.b[1]");
    expect(e.message).toMatch(/map/);
  });

  it("allows an array of maps that contain arrays", () => {
    expect(() => enc('{"a": [{"b": [1]}]}')).not.toThrow();
  });
});

describe("third-party import formats", () => {
  const imp = (text: string) => encodeFields(parseEditorJson(text), { acceptThirdParty: true });

  it("recognises Firefoo shapes", () => {
    const rest = imp(
      '{"t":{"__time__":"2021-11-23T23:13:52.000Z"},"g":{"__lat__":52.52,"__lon__":13.4},"r":{"__ref__":"countries/DE"},"b":{"__bytes__":"aGk="},"n":{"__double__":"NaN"},"i":{"__double__":"Infinity"}}',
    );
    expect(rest.t).toEqual({ timestampValue: "2021-11-23T23:13:52Z" });
    expect(rest.g).toEqual({ geoPointValue: { latitude: 52.52, longitude: 13.4 } });
    expect(rest.r).toEqual({ referenceValue: "countries/DE" });
    expect(rest.b).toEqual({ bytesValue: "aGk=" });
    expect(rest.n).toEqual({ doubleValue: "NaN" });
    expect(rest.i).toEqual({ doubleValue: "Infinity" });
  });

  it("recognises node-firestore-import-export shapes", () => {
    const rest = imp(
      '{"t":{"__datatype__":"timestamp","value":{"_seconds":1637709232,"_nanoseconds":5000000}},"g":{"__datatype__":"geopoint","value":{"_latitude":1.5,"_longitude":2.5}},"r":{"__datatype__":"documentReference","value":"a/b"}}',
    );
    expect(rest.t).toEqual({ timestampValue: "2021-11-23T23:13:52.005Z" });
    expect(rest.g).toEqual({ geoPointValue: { latitude: 1.5, longitude: 2.5 } });
    expect(rest.r).toEqual({ referenceValue: "a/b" });
  });

  it("treats those shapes as plain maps outside import mode", () => {
    expect(enc('{"t":{"__time__":"2021-11-23T23:13:52.000Z"}}').t).toHaveProperty("mapValue");
  });
});

describe("REST decoding", () => {
  it("rejects malformed envelopes with a path", () => {
    expect(codecError(() => decodeDoc({ fields: { a: { mapValue: { fields: { b: { wat: 1 } } } } } })).path).toBe("a.b");
    expect(codecError(() => decodeDoc({ fields: { a: { stringValue: 1 } } })).code).toBe("invalidEnvelope");
    expect(codecError(() => decodeDoc({ fields: { a: {} } })).code).toBe("invalidEnvelope");
  });

  it("decodes a document with no fields to an empty object", () => {
    expect(decodeDoc({ name: "projects/p/databases/(default)/documents/c/d" })).toEqual({});
  });

  it("decodes a full REST doc into canonical tagged JSON", () => {
    const text = stringifyEditorJson(
      decodeDoc({
        name: "x",
        fields: {
          when: { timestampValue: "2026-01-01T00:00:00Z" },
          pos: { geoPointValue: { latitude: 1, longitude: 2 } },
          n: { integerValue: "7" },
        },
      }),
    );
    expect(JSON.parse(text)).toEqual({
      when: { __type__: "timestamp", __value__: "2026-01-01T00:00:00Z" },
      pos: { __type__: "geopoint", __value__: { latitude: 1, longitude: 2 } },
      n: 7,
    });
    expect(text).toContain('"latitude": 1.0');
  });
});

describe("encodeDoc masks", () => {
  it("defaults the mask to the payload's top-level keys", () => {
    expect(encodeDoc(parseEditorJson('{"a":1,"b":{"c":2}}')).updateMask).toEqual(["a", "b"]);
  });

  it("keeps an explicit mask, including fields absent from the payload (deletions)", () => {
    const r = encodeDoc(parseEditorJson('{"a":1}'), { updateMask: ["a", "gone"] });
    expect(r.updateMask).toEqual(["a", "gone"]);
    expect(Object.keys(r.fields)).toEqual(["a"]);
  });

  it("omits the mask in full-document mode", () => {
    expect(encodeDoc(parseEditorJson('{"a":1}'), { fullDocument: true }).updateMask).toBeUndefined();
  });

  it("requires an object at the top level", () => {
    expect(codecError(() => encodeDoc(parseEditorJson("[1]"))).code).toBe("invalidValue");
  });
});

describe("editor text helpers", () => {
  it("formats with 2-space indent and preserves big integers", () => {
    expect(formatEditorJson('{"a":9007199254740993,"b":[1,2]}')).toBe(
      '{\n  "a": 9007199254740993,\n  "b": [\n    1,\n    2\n  ]\n}',
    );
  });

  it("reports invalid JSON as a CodecError", () => {
    expect(codecError(() => formatEditorJson("{a:")).code).toBe("invalidJson");
  });

  it("repairs common breakage (single quotes, trailing comma, comments)", () => {
    const fixed = repairEditorJson("{'a': 1, // note\n 'b': [1,2,],}");
    expect(JSON.parse(fixed)).toEqual({ a: 1, b: [1, 2] });
  });

  it("repair keeps big ints exact", () => {
    expect(repairEditorJson("{a: 9007199254740993,}")).toContain("9007199254740993");
  });
});

describe("documentsRoot option", () => {
  const ROOT = "projects/p/databases/(default)/documents";
  const ref = (v: string) => `{"r": {"__type__": "reference", "__value__": "${v}"}}`;

  it("qualifies relative references (nested too) and leaves full ones intact", () => {
    const f = encodeFields(parseEditorJson(`{"a": {"__type__":"reference","__value__":"x/y"}, "l": [{"__type__":"reference","__value__":"/c/d"}], "m": {"k": {"__type__":"reference","__value__":"${ROOT}/z/w"}}}`), { documentsRoot: ROOT });
    expect(f.a).toEqual({ referenceValue: `${ROOT}/x/y` });
    expect(JSON.stringify(f.l)).toContain(`${ROOT}/c/d`);
    expect(JSON.stringify(f.m)).toContain(`"${ROOT}/z/w"`);
    expect(JSON.stringify(f.m)).not.toContain(`${ROOT}/${ROOT}`);
  });

  it("keeps the previous behaviour without documentsRoot and does not touch the mask", () => {
    expect(encodeFields(parseEditorJson(ref("x/y")))).toEqual({ r: { referenceValue: "x/y" } });
    expect(encodeDoc(parseEditorJson(ref("x/y")), { documentsRoot: ROOT, updateMask: ["r", "gone"] }).updateMask).toEqual(["r", "gone"]);
    expect(encodeDoc(parseEditorJson(ref("x/y")), { documentsRoot: ROOT, fullDocument: true }).updateMask).toBeUndefined();
  });
});
