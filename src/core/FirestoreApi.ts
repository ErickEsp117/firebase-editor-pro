import type { ApiClient } from "./ApiClient";
import type { RestFields } from "./FirestoreCodec";

const BASE = "https://firestore.googleapis.com/v1";

export interface FirestoreDocument {
  /** Full resource name: projects/{p}/databases/(default)/documents/{path}. */
  name: string;
  fields?: RestFields;
  createTime?: string;
  updateTime?: string;
}

export interface Page {
  nextPageToken?: string;
}
export interface CollectionIdsPage extends Page {
  collectionIds: string[];
}
export interface DocsPage extends Page {
  documents: FirestoreDocument[];
}

export interface ListOptions {
  pageSize?: number;
  pageToken?: string;
  orderBy?: string;
  showMissing?: boolean;
}

export interface Precondition {
  exists?: boolean;
  updateTime?: string;
}

export interface UpsertOptions extends Precondition {
  /** Top-level field names; undefined replaces the whole document. An empty array is rejected. */
  updateMask?: string[];
}

type Requester = Pick<ApiClient, "request">;

/** Quotes a field name for use in `updateMask.fieldPaths` when it is not a simple identifier. */
export function fieldPath(name: string): string {
  return /^[A-Za-z_][A-Za-z_0-9]*$/.test(name) ? name : `\`${name.replace(/[\\`]/g, "\\$&")}\``;
}

function query(params: [string, string | number | boolean | undefined][]): string {
  const parts = params
    .filter((p): p is [string, string | number | boolean] => p[1] !== undefined && p[1] !== "")
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
  return parts.length ? `?${parts.join("&")}` : "";
}

function preconditionParams(p: Precondition): [string, string | boolean | undefined][] {
  if (p.exists !== undefined && p.updateTime !== undefined) {
    throw new Error("A precondition takes either exists or updateTime, not both");
  }
  return [
    ["currentDocument.exists", p.exists],
    ["currentDocument.updateTime", p.updateTime],
  ];
}

export class FirestoreApi {
  private readonly docs: string;

  constructor(
    private readonly client: Requester,
    readonly projectId: string,
  ) {
    this.docs = `projects/${projectId}/databases/(default)/documents`;
  }

  /** Relative path ("coll/doc") -> URL path under the documents root; each segment is escaped. */
  private path(relative: string): string {
    const segments = relative.split("/").filter(Boolean);
    return segments.length ? `${this.docs}/${segments.map(encodeURIComponent).join("/")}` : this.docs;
  }

  private url(relative: string, suffix = "", qs = ""): string {
    return `${BASE}/${this.path(relative)}${suffix}${qs}`;
  }

  /** Root collections when `docPath` is omitted, otherwise the subcollections of that document. */
  async listCollectionIds(docPath?: string, opts: Pick<ListOptions, "pageSize" | "pageToken"> = {}): Promise<CollectionIdsPage> {
    const body: Record<string, unknown> = {};
    if (opts.pageSize !== undefined) body.pageSize = opts.pageSize;
    if (opts.pageToken) body.pageToken = opts.pageToken;
    const res = await this.client.request<{ collectionIds?: string[]; nextPageToken?: string }>(
      this.url(docPath ?? "", ":listCollectionIds"),
      { method: "POST", body },
    );
    return { collectionIds: res.data.collectionIds ?? [], nextPageToken: res.data.nextPageToken || undefined };
  }

  async listAllCollectionIds(docPath?: string): Promise<string[]> {
    const all: string[] = [];
    let pageToken: string | undefined;
    do {
      const page = await this.listCollectionIds(docPath, { pageToken });
      all.push(...page.collectionIds);
      pageToken = page.nextPageToken;
    } while (pageToken);
    return all;
  }

  async listDocs(collectionPath: string, opts: ListOptions = {}): Promise<DocsPage> {
    const qs = query([
      ["pageSize", opts.pageSize],
      ["pageToken", opts.pageToken],
      ["orderBy", opts.orderBy],
      ["showMissing", opts.showMissing],
    ]);
    const res = await this.client.request<{ documents?: FirestoreDocument[]; nextPageToken?: string }>(this.url(collectionPath, "", qs));
    return { documents: res.data.documents ?? [], nextPageToken: res.data.nextPageToken || undefined };
  }

  async getDoc(docPath: string): Promise<FirestoreDocument> {
    return (await this.client.request<FirestoreDocument>(this.url(docPath))).data;
  }

  /** Creates with an explicit id; an existing id surfaces as ApiError{status:"ALREADY_EXISTS"}. */
  async createDoc(collectionPath: string, documentId: string, fields: RestFields): Promise<FirestoreDocument> {
    if (!documentId) throw new Error("documentId is required");
    const res = await this.client.request<FirestoreDocument>(this.url(collectionPath, "", query([["documentId", documentId]])), {
      method: "POST",
      body: { fields },
    });
    return res.data;
  }

  /** PATCH. Without `updateMask` the whole document is replaced. */
  async upsertDoc(docPath: string, fields: RestFields, opts: UpsertOptions = {}): Promise<FirestoreDocument> {
    if (opts.updateMask && opts.updateMask.length === 0) {
      throw new Error("An empty updateMask would replace the whole document; pass undefined for that or at least one field");
    }
    const mask = (opts.updateMask ?? []).map((f): [string, string] => ["updateMask.fieldPaths", fieldPath(f)]);
    const qs = query([...mask, ...preconditionParams(opts)]);
    const res = await this.client.request<FirestoreDocument>(this.url(docPath, "", qs), { method: "PATCH", body: { fields } });
    return res.data;
  }

  async deleteDoc(docPath: string, precondition: Precondition = {}): Promise<void> {
    await this.client.request(this.url(docPath, "", query(preconditionParams(precondition))), { method: "DELETE" });
  }

  /** Counts existing documents (not "missing" parents) of a collection by paging through it. */
  async countDocs(collectionPath: string): Promise<number> {
    let count = 0;
    let pageToken: string | undefined;
    do {
      const page = await this.listDocs(collectionPath, { pageSize: 300, pageToken });
      count += page.documents.length;
      pageToken = page.nextPageToken;
    } while (pageToken);
    return count;
  }

  /**
   * Deletes every document directly in the collection (subcollections of those documents are left alone).
   * Always re-lists from the first page after deleting, so page tokens are never reused across mutations.
   */
  async deleteCollection(collectionPath: string, onProgress?: (deleted: number) => void): Promise<number> {
    let deleted = 0;
    for (;;) {
      const page = await this.listDocs(collectionPath, { pageSize: 100 });
      if (page.documents.length === 0) return deleted;
      for (const d of page.documents) {
        const i = d.name.indexOf("/documents/");
        await this.deleteDoc(i >= 0 ? d.name.slice(i + "/documents/".length) : d.name);
        deleted += 1;
        onProgress?.(deleted);
      }
    }
  }
}
