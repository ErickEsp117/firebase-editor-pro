import { ApiError, CodecError, decodeDoc, encodeFields, parseEditorJson, stringifyEditorJson, type FirestoreDocument, type RestFields } from "../../core";
import { isObj, type Obj } from "./valueTypes";

export type SaveMode = "modified" | "full";

export interface DraftError {
  /** i18n key plus interpolation params, resolved by the UI with t(). */
  key: string;
  params: Record<string, string>;
}

export type Draft = { ok: true; value: Obj } | { ok: false; error: DraftError };

/** Parses editor text and checks that it is encodable, so an invalid draft never reaches the network. */
export function parseDraft(text: string): Draft {
  try {
    const value = parseEditorJson(text);
    if (!isObj(value)) return { ok: false, error: { key: "codec.errors.invalidValue", params: { path: "" } } };
    encodeFields(value);
    return { ok: true, value };
  } catch (e) {
    if (e instanceof CodecError) {
      return { ok: false, error: { key: e.i18nKey, params: { ...e.params, detail: e.message } } };
    }
    return { ok: false, error: { key: "codec.errors.invalidJson", params: { path: "", detail: String(e) } } };
  }
}

export function docToText(doc: FirestoreDocument): string {
  return stringifyEditorJson(decodeDoc(doc));
}

export interface FieldDiff {
  changed: Obj;
  deleted: string[];
}

/** Top-level diff: fields added/modified (with their new value) and fields removed. */
export function diffFields(base: Obj, current: Obj): FieldDiff {
  const changed: Obj = {};
  const deleted: string[] = [];
  for (const k of Object.keys(current)) {
    if (!(k in base) || stringifyEditorJson(base[k]) !== stringifyEditorJson(current[k])) {
      Object.defineProperty(changed, k, { value: current[k], enumerable: true, writable: true, configurable: true });
    }
  }
  for (const k of Object.keys(base)) if (!(k in current)) deleted.push(k);
  return { changed, deleted };
}

export interface SavePlan {
  fields: RestFields;
  /** undefined = full replace (no mask). */
  updateMask: string[] | undefined;
}

/**
 * "modified": mask = fields present in the payload (changed ones) plus deleted ones, which are absent from the payload so Firestore removes them.
 * "full": whole editor content, no mask.
 */
export function buildSavePlan(base: Obj, current: Obj, mode: SaveMode, documentsRoot?: string): SavePlan {
  const opts = { documentsRoot };
  if (mode === "full") return { fields: encodeFields(current, opts), updateMask: undefined };
  const { changed, deleted } = diffFields(base, current);
  return { fields: encodeFields(changed, opts), updateMask: [...Object.keys(changed), ...deleted] };
}

export function hasChanges(base: Obj, current: Obj): boolean {
  const { changed, deleted } = diffFields(base, current);
  return Object.keys(changed).length > 0 || deleted.length > 0;
}

/** A failed precondition (stale updateTime) or a doc deleted underneath us. */
export function isConflict(e: unknown): boolean {
  if (!(e instanceof ApiError)) return false;
  return e.http === 409 || e.http === 412 || e.http === 404 || e.status === "ABORTED" || e.status === "FAILED_PRECONDITION" || e.status === "NOT_FOUND";
}
