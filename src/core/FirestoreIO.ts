import { isLosslessNumber } from "lossless-json";
import { decodeDoc, documentsRootOf, encodeFields, parseEditorJson, stringifyEditorJson } from "./FirestoreCodec";
import type { RestFields } from "./FirestoreCodec";
import type { FirestoreApi, FirestoreDocument } from "./FirestoreApi";

/** Key under which a document lists its subcollections in collection exports (app and Firefoo). */
export const COLLECTIONS_KEY = "__collections__";

export type ImportErrorCode = "notObject" | "badId" | "badPath" | "badCollections";

export class ImportError extends Error {
  readonly i18nKey: string;
  readonly params: Record<string, string>;
  constructor(
    readonly code: ImportErrorCode,
    params: Record<string, string> = {},
  ) {
    super(`${code}: ${JSON.stringify(params)}`);
    this.name = "ImportError";
    this.i18nKey = `io.errors.${code}`;
    this.params = params;
  }
}

export interface ImportEntry {
  /** Relative document path, e.g. `coll/doc/sub/doc2`. */
  path: string;
  fields: RestFields;
}

type Obj = Record<string, unknown>;
const isPlainObject = (v: unknown): v is Obj =>
  typeof v === "object" && v !== null && !Array.isArray(v) && !isLosslessNumber(v);

const segments = (p: string) => p.split("/").filter(Boolean);

function checkId(id: string, at: string): void {
  if (!id || id.includes("/") || id === "." || id === ".." || /^__.*__$/.test(id)) {
    throw new ImportError("badId", { id, path: at });
  }
}

function collect(docPath: string, doc: unknown, out: ImportEntry[], root: string): void {
  if (!isPlainObject(doc)) throw new ImportError("notObject", { path: docPath });
  const { [COLLECTIONS_KEY]: subs, ...data } = doc;
  out.push({ path: docPath, fields: encodeFields(data, { acceptThirdParty: true, documentsRoot: root }) });
  if (subs === undefined) return;
  if (!isPlainObject(subs)) throw new ImportError("badCollections", { path: docPath });
  for (const [name, docs] of Object.entries(subs)) {
    checkId(name, docPath);
    collectCollection(`${docPath}/${name}`, docs, out, root);
  }
}

function collectCollection(collectionPath: string, docs: unknown, out: ImportEntry[], root: string): void {
  if (!isPlainObject(docs)) throw new ImportError("notObject", { path: collectionPath });
  for (const [id, doc] of Object.entries(docs)) {
    checkId(id, collectionPath);
    collect(`${collectionPath}/${id}`, doc, out, root);
  }
}

/**
 * Parses and fully encodes an import before anything is written, so invalid input never
 * leaves a partial result. Throws CodecError (syntax / type problems) or ImportError.
 */
export function planDocumentImport(text: string, docPath: string, projectId = "-"): ImportEntry[] {
  if (segments(docPath).length === 0 || segments(docPath).length % 2 !== 0) throw new ImportError("badPath", { path: docPath });
  const out: ImportEntry[] = [];
  collect(segments(docPath).join("/"), parseEditorJson(text), out, documentsRootOf(projectId));
  return out;
}

export function planCollectionImport(text: string, collectionPath: string, projectId = "-"): ImportEntry[] {
  if (segments(collectionPath).length % 2 !== 1) throw new ImportError("badPath", { path: collectionPath });
  const out: ImportEntry[] = [];
  collectCollection(segments(collectionPath).join("/"), parseEditorJson(text), out, documentsRootOf(projectId));
  return out;
}

/** Writes entries sequentially (parents first); returns how many were written. */
export async function runImport(
  api: Pick<FirestoreApi, "upsertDoc">,
  entries: ImportEntry[],
  onProgress?: (written: number) => void,
): Promise<number> {
  let written = 0;
  for (const e of entries) {
    await api.upsertDoc(e.path, e.fields);
    written += 1;
    onProgress?.(written);
  }
  return written;
}

export function exportDocumentText(doc: Pick<FirestoreDocument, "fields">): string {
  return stringifyEditorJson(decodeDoc(doc));
}

export async function exportDocument(api: Pick<FirestoreApi, "getDoc">, docPath: string): Promise<string> {
  return exportDocumentText(await api.getDoc(docPath));
}

const relative = (name: string) => {
  const i = name.indexOf("/documents/");
  return i >= 0 ? name.slice(i + "/documents/".length) : name;
};

async function exportCollectionTree(
  api: Pick<FirestoreApi, "listDocs" | "listAllCollectionIds">,
  collectionPath: string,
  counter: { docs: number },
  onProgress?: (docs: number) => void,
): Promise<Obj> {
  const result: Obj = {};
  let pageToken: string | undefined;
  do {
    const page = await api.listDocs(collectionPath, { pageSize: 100, pageToken, showMissing: true });
    for (const d of page.documents) {
      const docPath = relative(d.name);
      const id = docPath.slice(docPath.lastIndexOf("/") + 1);
      const subNames = await api.listAllCollectionIds(docPath);
      // A "missing" document (no timestamps) only matters as the parent of subcollections.
      const missing = !d.createTime && !d.updateTime;
      if (missing && subNames.length === 0) continue;
      const entry: Obj = decodeDoc(d);
      if (subNames.length > 0) {
        const subs: Obj = {};
        for (const name of subNames) subs[name] = await exportCollectionTree(api, `${docPath}/${name}`, counter, onProgress);
        entry[COLLECTIONS_KEY] = subs;
      }
      result[id] = entry;
      if (!missing) {
        counter.docs += 1;
        onProgress?.(counter.docs);
      }
    }
    pageToken = page.nextPageToken;
  } while (pageToken);
  return result;
}

export async function exportCollection(
  api: Pick<FirestoreApi, "listDocs" | "listAllCollectionIds">,
  collectionPath: string,
  onProgress?: (docs: number) => void,
): Promise<{ text: string; docs: number }> {
  const counter = { docs: 0 };
  const tree = await exportCollectionTree(api, collectionPath, counter, onProgress);
  return { text: stringifyEditorJson(tree), docs: counter.docs };
}
