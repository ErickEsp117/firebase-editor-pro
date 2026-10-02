import { isLosslessNumber, LosslessNumber } from "lossless-json";

export type Obj = Record<string, unknown>;
export type PathSeg = string | number;

export type ValueType =
  | "string"
  | "integer"
  | "double"
  | "boolean"
  | "null"
  | "timestamp"
  | "reference"
  | "geopoint"
  | "bytes"
  | "array"
  | "map";

export const VALUE_TYPES: ValueType[] = [
  "string",
  "integer",
  "double",
  "boolean",
  "null",
  "timestamp",
  "reference",
  "geopoint",
  "bytes",
  "array",
  "map",
];

const TAG_TYPES = new Set(["timestamp", "geopoint", "reference", "bytes", "nan", "infinity", "-infinity", "integer", "double", "serverTimestamp"]);

export const isObj = (v: unknown): v is Obj =>
  typeof v === "object" && v !== null && !Array.isArray(v) && !isLosslessNumber(v);

/** A tag is an object with exactly `__type__` (+ optional `__value__`) and a known type; anything else is a plain map. */
export function asTag(v: unknown): { type: string; value: unknown } | null {
  if (!isObj(v)) return null;
  const keys = Object.keys(v);
  if (!keys.includes("__type__") || keys.some((k) => k !== "__type__" && k !== "__value__")) return null;
  const type = v.__type__;
  if (typeof type !== "string" || !TAG_TYPES.has(type)) return null;
  return { type, value: v.__value__ };
}

export function typeOf(v: unknown): ValueType {
  if (v === null) return "null";
  if (typeof v === "boolean") return "boolean";
  if (typeof v === "string") return "string";
  if (isLosslessNumber(v)) return /^-?\d+$/.test(v.value) ? "integer" : "double";
  if (typeof v === "number") return Number.isInteger(v) ? "integer" : "double";
  if (Array.isArray(v)) return "array";
  const tag = asTag(v);
  if (tag) {
    switch (tag.type) {
      case "nan":
      case "infinity":
      case "-infinity":
      case "double":
        return "double";
      case "integer":
        return "integer";
      case "serverTimestamp":
        return "timestamp";
      default:
        return tag.type as ValueType;
    }
  }
  return "map";
}

export function defaultValue(type: ValueType): unknown {
  switch (type) {
    case "string":
      return "";
    case "integer":
      return new LosslessNumber("0");
    case "double":
      return new LosslessNumber("0.0");
    case "boolean":
      return false;
    case "null":
      return null;
    case "timestamp":
      return { __type__: "timestamp", __value__: new Date().toISOString().replace(/\.\d+Z$/, "Z") };
    case "reference":
      return { __type__: "reference", __value__: "" };
    case "geopoint":
      return { __type__: "geopoint", __value__: { latitude: new LosslessNumber("0.0"), longitude: new LosslessNumber("0.0") } };
    case "bytes":
      return { __type__: "bytes", __value__: "" };
    case "array":
      return [];
    case "map":
      return {};
  }
}

export function getAt(root: unknown, path: PathSeg[]): unknown {
  let cur = root;
  for (const seg of path) {
    if (Array.isArray(cur)) cur = cur[seg as number];
    else if (isObj(cur)) cur = cur[seg as string];
    else return undefined;
  }
  return cur;
}

function defineKey(target: Obj, key: string, value: unknown): void {
  Object.defineProperty(target, key, { value, enumerable: true, writable: true, configurable: true });
}

function cloneContainer(c: unknown): unknown {
  if (Array.isArray(c)) return [...c];
  const out: Obj = {};
  for (const k of Object.keys(c as Obj)) defineKey(out, k, (c as Obj)[k]);
  return out;
}

/** Immutable update: `update` receives the container at `path` and returns its replacement. */
function updateAt(root: unknown, path: PathSeg[], update: (container: unknown) => unknown): unknown {
  if (path.length === 0) return update(root);
  const [head, ...rest] = path;
  const copy = cloneContainer(root);
  const child = Array.isArray(root) ? (root as unknown[])[head as number] : (root as Obj)[head as string];
  const next = updateAt(child, rest, update);
  if (Array.isArray(copy)) copy[head as number] = next;
  else defineKey(copy as Obj, head as string, next);
  return copy;
}

export function setAt(root: unknown, path: PathSeg[], value: unknown): unknown {
  if (path.length === 0) return value;
  const parent = path.slice(0, -1);
  const last = path[path.length - 1];
  return updateAt(root, parent, (c) => {
    const copy = cloneContainer(c);
    if (Array.isArray(copy)) copy[last as number] = value;
    else defineKey(copy as Obj, last as string, value);
    return copy;
  });
}

export function deleteAt(root: unknown, path: PathSeg[]): unknown {
  const parent = path.slice(0, -1);
  const last = path[path.length - 1];
  return updateAt(root, parent, (c) => {
    if (Array.isArray(c)) return c.filter((_, i) => i !== last);
    const copy: Obj = {};
    for (const k of Object.keys(c as Obj)) if (k !== last) defineKey(copy, k, (c as Obj)[k]);
    return copy;
  });
}

/** Adds a map entry (`key` required) or appends to an array (`key` undefined). */
export function addAt(root: unknown, path: PathSeg[], key: string | undefined, value: unknown): unknown {
  return updateAt(root, path, (c) => {
    if (Array.isArray(c)) return [...c, value];
    const copy = cloneContainer(c) as Obj;
    defineKey(copy, key as string, value);
    return copy;
  });
}
