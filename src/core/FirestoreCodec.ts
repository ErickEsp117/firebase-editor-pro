import { isLosslessNumber, LosslessNumber, parse, stringify } from "lossless-json";
import { jsonrepair } from "jsonrepair";

/**
 * Bidirectional codec between the tagged-JSON editor model and Firestore REST `Value` envelopes.
 * Editor numbers are `LosslessNumber`s (what lossless-json parses), so int64 never loses precision
 * and `3.0` stays a double while `3` stays an integer. See library/codec-format.md.
 */

export type RestValue = Record<string, unknown>;
export type RestFields = Record<string, RestValue>;

export interface EncodedDoc {
  fields: RestFields;
  /** Top-level field paths for PATCH, or undefined for a full-document replace. */
  updateMask: string[] | undefined;
}

export interface EncodeOptions {
  /** Explicit mask (may list fields absent from the payload so they are deleted). Defaults to the payload's top-level keys. */
  updateMask?: string[];
  /** Produce no mask: PATCH replaces the whole document. */
  fullDocument?: boolean;
  /** Also recognise Firefoo / node-firestore-import-export shapes (import only). */
  acceptThirdParty?: boolean;
}

export type CodecErrorCode =
  | "arrayInArray"
  | "unknownType"
  | "unsupportedType"
  | "invalidPayload"
  | "invalidNumber"
  | "invalidValue"
  | "invalidEnvelope"
  | "invalidMask"
  | "invalidJson";

export class CodecError extends Error {
  /** i18n key; `params` carries `path` and any extra interpolation values. */
  readonly i18nKey: string;
  constructor(
    readonly code: CodecErrorCode,
    readonly path: string,
    message: string,
    readonly params: Record<string, string> = {},
  ) {
    super(`${path ? `${path}: ` : ""}${message}`);
    this.name = "CodecError";
    this.i18nKey = `codec.errors.${code}`;
    this.params = { path, ...params };
  }
}

type Obj = Record<string, unknown>;

const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v) && !isLosslessNumber(v);
const hasOwn = (o: object, k: string) => Object.prototype.hasOwnProperty.call(o, k);

const INT64_MIN = -(2n ** 63n);
const INT64_MAX = 2n ** 63n - 1n;
const INT_LITERAL = /^-?\d+$/;
const RFC3339 = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d+))?(Z|[+-]\d{2}:\d{2})$/;
const BASE64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

const join = (path: string, key: string) => (path ? `${path}.${key}` : key);

function setKey(target: Obj, key: string, value: unknown): void {
  Object.defineProperty(target, key, { value, enumerable: true, writable: true, configurable: true });
}

// ---------------------------------------------------------------- numbers

/** Renders a finite double as a JSON literal that always reads back as a double (`3` -> `3.0`). */
function doubleLiteral(n: number): string {
  if (Object.is(n, -0)) return "-0.0";
  const s = String(n);
  return /[.eE]/.test(s) ? s : `${s}.0`;
}

const doubleNumber = (n: number) => new LosslessNumber(doubleLiteral(n));

function numberLiteral(v: unknown): string | undefined {
  if (isLosslessNumber(v)) return v.value;
  if (typeof v === "bigint") return v.toString();
  if (typeof v === "number") return Number.isFinite(v) ? (Number.isInteger(v) && !Object.is(v, -0) ? String(v) : doubleLiteral(v)) : undefined;
  return undefined;
}

function encodeNumber(v: unknown, path: string): RestValue {
  if (typeof v === "number" && Number.isNaN(v)) return { doubleValue: "NaN" };
  const lit = numberLiteral(v);
  if (lit === undefined) throw new CodecError("invalidNumber", path, `number ${String(v)} is not representable`);
  if (INT_LITERAL.test(lit)) {
    const big = BigInt(lit);
    if (big < INT64_MIN || big > INT64_MAX) {
      throw new CodecError("invalidNumber", path, `integer ${lit} is outside the int64 range; use a decimal point for a double`);
    }
    return { integerValue: big.toString() };
  }
  const d = Number(lit);
  if (!Number.isFinite(d)) throw new CodecError("invalidNumber", path, `number ${lit} is not a finite double`);
  return { doubleValue: d };
}

// ---------------------------------------------------------------- tags (editor -> REST)

const KNOWN_TYPES = new Set([
  "timestamp",
  "geopoint",
  "reference",
  "bytes",
  "nan",
  "infinity",
  "-infinity",
  "integer",
  "double",
  "serverTimestamp",
]);

const invalidPayload = (path: string, type: string, expected: string) =>
  new CodecError("invalidPayload", path, `invalid payload for "${type}" tag: expected ${expected}`, { type, expected });

/** Truncates fractional seconds to microseconds (Firestore's precision) and validates the instant. */
export function normalizeTimestamp(s: string): string | undefined {
  const m = RFC3339.exec(s);
  if (!m || Number.isNaN(Date.parse(`${m[1]}${m[3]}`))) return undefined;
  const frac = m[2] ? m[2].slice(0, 6).replace(/0+$/, "") : "";
  return `${m[1]}${frac ? `.${frac}` : ""}${m[3]}`;
}

function encodeTag(type: string, payload: unknown, hasPayload: boolean, path: string): RestValue {
  switch (type) {
    case "timestamp": {
      const ts = typeof payload === "string" ? normalizeTimestamp(payload) : undefined;
      if (ts === undefined) throw invalidPayload(path, type, "an RFC3339 string such as 2026-09-30T12:34:56.123456Z");
      return { timestampValue: ts };
    }
    case "geopoint": {
      if (!isObj(payload) || Object.keys(payload).sort().join() !== "latitude,longitude") {
        throw invalidPayload(path, type, '{"latitude": number, "longitude": number}');
      }
      const lat = Number(numberLiteral(payload.latitude));
      const lon = Number(numberLiteral(payload.longitude));
      if (!(Math.abs(lat) <= 90) || !(Math.abs(lon) <= 180)) {
        throw invalidPayload(path, type, "latitude within [-90, 90] and longitude within [-180, 180]");
      }
      return { geoPointValue: { latitude: lat, longitude: lon } };
    }
    case "reference":
      if (typeof payload !== "string" || payload.length === 0) throw invalidPayload(path, type, "a non-empty document path string");
      return { referenceValue: payload };
    case "bytes":
      if (typeof payload !== "string" || !BASE64.test(payload)) throw invalidPayload(path, type, "a standard base64 string");
      return { bytesValue: payload };
    case "nan":
    case "infinity":
    case "-infinity":
      if (hasPayload) throw invalidPayload(path, type, "no __value__");
      return { doubleValue: type === "nan" ? "NaN" : type === "infinity" ? "Infinity" : "-Infinity" };
    case "integer": {
      const lit = numberLiteral(payload) ?? (typeof payload === "string" && INT_LITERAL.test(payload) ? payload : undefined);
      if (lit === undefined || !INT_LITERAL.test(lit)) throw invalidPayload(path, type, "an integer number");
      return encodeNumber(new LosslessNumber(lit), path);
    }
    case "double": {
      const lit = typeof payload === "string" && /^-?\d+(\.\d+)?([eE][+-]?\d+)?$/.test(payload) ? payload : numberLiteral(payload);
      const d = lit === undefined ? NaN : Number(lit);
      if (!Number.isFinite(d)) throw invalidPayload(path, type, "a finite number");
      return { doubleValue: d };
    }
    default:
      throw new CodecError("unsupportedType", path, `tag "${type}" is write-only and cannot be stored through this editor`, { type });
  }
}

// ---------------------------------------------------------------- third-party shapes (import only)

function thirdPartyTag(o: Obj, path: string): { type: string; value?: unknown } | undefined {
  const keys = Object.keys(o).sort().join();
  const bad = (what: string, expected: string) => invalidPayload(path, what, expected);
  switch (keys) {
    case "__time__":
      return { type: "timestamp", value: o.__time__ };
    case "__ref__":
      return { type: "reference", value: o.__ref__ };
    case "__bytes__":
      return { type: "bytes", value: o.__bytes__ };
    case "__lat__,__lon__":
      return { type: "geopoint", value: { latitude: o.__lat__, longitude: o.__lon__ } };
    case "__double__": {
      const v = o.__double__;
      if (v === "NaN") return { type: "nan" };
      if (v === "Infinity") return { type: "infinity" };
      if (v === "-Infinity") return { type: "-infinity" };
      const lit = numberLiteral(v);
      if (lit === undefined) throw bad("__double__", '"NaN", "Infinity", "-Infinity" or a number');
      return { type: "double", value: v };
    }
    case "__datatype__,value": {
      const dt = o.__datatype__;
      const v = o.value;
      if (dt === "documentReference") return { type: "reference", value: v };
      if (dt === "geopoint" && isObj(v)) return { type: "geopoint", value: { latitude: v._latitude, longitude: v._longitude } };
      if (dt === "timestamp" && isObj(v) && v._seconds !== undefined) {
        const sec = numberLiteral(v._seconds);
        const ns = numberLiteral(v._nanoseconds ?? 0);
        if (sec === undefined || ns === undefined || !INT_LITERAL.test(sec) || !INT_LITERAL.test(ns)) {
          throw bad("timestamp", "{_seconds, _nanoseconds} integers");
        }
        const d = new Date(Number(sec) * 1000);
        if (Number.isNaN(d.getTime())) throw bad("timestamp", "valid _seconds");
        const nanos = String(BigInt(ns)).padStart(9, "0").slice(0, 9);
        return { type: "timestamp", value: `${d.toISOString().slice(0, 19)}.${nanos}Z` };
      }
      return undefined;
    }
    default:
      return undefined;
  }
}

// ---------------------------------------------------------------- editor -> REST

function encodeValue(v: unknown, path: string, opts: EncodeOptions): RestValue {
  if (v === null) return { nullValue: null };
  switch (typeof v) {
    case "boolean":
      return { booleanValue: v };
    case "string":
      return { stringValue: v };
    case "bigint":
    case "number":
      return encodeNumber(v, path);
    case "object":
      break;
    default:
      throw new CodecError("invalidValue", path, `unsupported value of type ${typeof v}`);
  }
  if (isLosslessNumber(v)) return encodeNumber(v, path);
  if (Array.isArray(v)) {
    const values = v.map((item, i) => {
      const p = `${path}[${i}]`;
      if (Array.isArray(item)) {
        throw new CodecError("arrayInArray", p, "Firestore does not support an array directly inside an array; wrap the inner array in a map");
      }
      return encodeValue(item, p, opts);
    });
    return { arrayValue: { values } };
  }
  const o = v as Obj;
  const keys = Object.keys(o);
  if (hasOwn(o, "__type__")) {
    // Anti-collision rule: exact tag shape -> tag (or clear error); extra keys -> ordinary user map.
    const exact = keys.length === 1 || (keys.length === 2 && hasOwn(o, "__value__"));
    if (exact) {
      const type = o.__type__;
      if (typeof type !== "string" || !KNOWN_TYPES.has(type)) {
        throw new CodecError("unknownType", path, `unknown __type__ ${stringify(type) ?? "undefined"}`, { type: String(stringify(type)) });
      }
      return encodeTag(type, o.__value__, hasOwn(o, "__value__"), path);
    }
  } else if (opts.acceptThirdParty) {
    const t = thirdPartyTag(o, path);
    if (t) return encodeTag(t.type, t.value, t.value !== undefined, path);
  }
  const fields: RestFields = {};
  for (const k of keys) setKey(fields, k, encodeValue(o[k], join(path, k), opts));
  return { mapValue: { fields } };
}

export function encodeFields(editorJson: unknown, opts: EncodeOptions = {}): RestFields {
  if (!isObj(editorJson)) throw new CodecError("invalidValue", "", "a document must be a JSON object");
  const fields: RestFields = {};
  for (const k of Object.keys(editorJson)) setKey(fields, k, encodeValue(editorJson[k], k, opts));
  return fields;
}

export function encodeDoc(editorJson: unknown, opts: EncodeOptions = {}): EncodedDoc {
  const fields = encodeFields(editorJson, opts);
  if (opts.fullDocument) return { fields, updateMask: undefined };
  const updateMask = opts.updateMask ?? Object.keys(fields);
  if (updateMask.some((p) => typeof p !== "string" || p.length === 0)) {
    throw new CodecError("invalidMask", "", "update mask entries must be non-empty field names");
  }
  return { fields, updateMask };
}

// ---------------------------------------------------------------- REST -> editor

const tag = (type: string, value?: unknown): Obj => {
  const t: Obj = { __type__: type };
  if (value !== undefined) t.__value__ = value;
  return t;
};

function decodeValue(v: unknown, path: string): unknown {
  if (!isObj(v)) throw new CodecError("invalidEnvelope", path, "a Value envelope must be an object");
  const keys = Object.keys(v);
  if (keys.length !== 1) throw new CodecError("invalidEnvelope", path, `a Value envelope needs exactly one type key, got [${keys.join(", ")}]`);
  const key = keys[0];
  const raw = v[key];
  switch (key) {
    case "nullValue":
      return null;
    case "booleanValue":
      if (typeof raw !== "boolean") break;
      return raw;
    case "integerValue": {
      const s = typeof raw === "number" ? String(raw) : raw;
      if (typeof s !== "string" || !INT_LITERAL.test(s)) break;
      return new LosslessNumber(BigInt(s).toString());
    }
    case "doubleValue":
      if (raw === "NaN") return tag("nan");
      if (raw === "Infinity") return tag("infinity");
      if (raw === "-Infinity") return tag("-infinity");
      if (typeof raw !== "number" || !Number.isFinite(raw)) break;
      return doubleNumber(raw);
    case "stringValue":
      if (typeof raw !== "string") break;
      return raw;
    case "timestampValue":
      if (typeof raw !== "string") break;
      return tag("timestamp", raw);
    case "bytesValue":
      if (typeof raw !== "string") break;
      return tag("bytes", raw);
    case "referenceValue":
      if (typeof raw !== "string") break;
      return tag("reference", raw);
    case "geoPointValue":
      if (!isObj(raw)) break;
      return tag("geopoint", {
        latitude: doubleNumber(Number(raw.latitude ?? 0)),
        longitude: doubleNumber(Number(raw.longitude ?? 0)),
      });
    case "arrayValue": {
      if (!isObj(raw)) break;
      const values = raw.values ?? [];
      if (!Array.isArray(values)) break;
      return values.map((item, i) => decodeValue(item, `${path}[${i}]`));
    }
    case "mapValue": {
      if (!isObj(raw)) break;
      return decodeFields(raw.fields ?? {}, path);
    }
    default:
      throw new CodecError("invalidEnvelope", path, `unknown Value type "${key}"`);
  }
  throw new CodecError("invalidEnvelope", path, `malformed ${key}`);
}

function decodeFields(fields: unknown, path: string): Obj {
  if (!isObj(fields)) throw new CodecError("invalidEnvelope", path, "fields must be an object");
  const out: Obj = {};
  for (const k of Object.keys(fields)) setKey(out, k, decodeValue(fields[k], join(path, k)));
  return out;
}

/** Decodes a REST Document; a missing `fields` (empty or "missing" doc) decodes to `{}`. */
export function decodeDoc(restDocument: unknown): Obj {
  if (!isObj(restDocument)) throw new CodecError("invalidEnvelope", "", "document must be an object");
  return decodeFields(restDocument.fields ?? {}, "");
}

/** Decodes a bare `fields` map (as produced by `encodeFields`). */
export { decodeFields };

// ---------------------------------------------------------------- editor text

export function parseEditorJson(text: string): unknown {
  try {
    return parse(text);
  } catch (e) {
    throw new CodecError("invalidJson", "", e instanceof Error ? e.message : "invalid JSON");
  }
}

export function stringifyEditorJson(value: unknown): string {
  return stringify(value, undefined, 2) ?? "null";
}

/** "Format": parse then re-stringify with 2-space indent (validates as a side effect). */
export function formatEditorJson(text: string): string {
  return stringifyEditorJson(parseEditorJson(text));
}

/** "Repair": jsonrepair then parse; still-invalid input raises an `invalidJson` CodecError. */
export function repairEditorJson(text: string): string {
  let repaired: string;
  try {
    repaired = jsonrepair(text);
  } catch (e) {
    throw new CodecError("invalidJson", "", e instanceof Error ? e.message : "cannot repair JSON");
  }
  return formatEditorJson(repaired);
}
