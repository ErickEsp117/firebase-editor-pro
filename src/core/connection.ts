import { getPlatform } from "../platform";
import type { Platform } from "../platform/types";
import { ApiClient } from "./ApiClient";
import { ApiError } from "./ApiError";
import { KeyFileError, ServiceAccountAuth, type KeyFileReason } from "./ServiceAccountAuth";

export const CREDENTIAL_KEY = "service-account";

export interface Connection {
  auth: ServiceAccountAuth;
  client: ApiClient;
  projectId: string;
  clientEmail: string;
}

export type ConnectionErrorKind = "keyInvalid" | "keyUnreadable" | "rejected" | "offline" | "forbidden" | "fileRead" | "unknown";

export class ConnectionError extends Error {
  constructor(
    readonly kind: ConnectionErrorKind,
    readonly detail: string,
    readonly reason?: { code: KeyFileReason; field?: string },
  ) {
    super(detail);
    this.name = "ConnectionError";
  }
}

export function rootCollectionsUrl(projectId: string): string {
  return `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents:listCollectionIds`;
}

export async function listRootCollections(conn: Pick<Connection, "client" | "projectId">): Promise<string[]> {
  const ids: string[] = [];
  let pageToken: string | undefined;
  do {
    const res = await conn.client.request<{ collectionIds?: string[]; nextPageToken?: string }>(
      rootCollectionsUrl(conn.projectId),
      { method: "POST", body: pageToken ? { pageToken } : {} },
    );
    ids.push(...(res.data.collectionIds ?? []));
    pageToken = res.data.nextPageToken || undefined;
  } while (pageToken);
  return ids;
}

export function classifyError(e: unknown): ConnectionError {
  if (e instanceof ConnectionError) return e;
  if (e instanceof KeyFileError) return new ConnectionError("keyInvalid", e.message, { code: e.reason, field: e.field });
  if (e instanceof ApiError) {
    if (e.http === 0) return new ConnectionError("offline", e.message);
    if (e.http === 403 || e.status === "PERMISSION_DENIED") return new ConnectionError("forbidden", e.message);
    return new ConnectionError("rejected", `${e.status}: ${e.message}`);
  }
  const msg = e instanceof Error ? e.message : String(e);
  if (/private key/i.test(msg)) return new ConnectionError("keyUnreadable", msg);
  return new ConnectionError("unknown", msg);
}

/** Parses locally, then proves the key works with a real token + root listCollectionIds. Nothing is stored. */
export async function verifyKey(keyText: string, platform: Platform = getPlatform()): Promise<Connection> {
  try {
    const auth = ServiceAccountAuth.fromKeyJson(keyText, { platform });
    const client = new ApiClient(auth, { platform });
    const conn = { auth, client, projectId: auth.projectId, clientEmail: auth.key.client_email };
    await listRootCollections(conn);
    return conn;
  } catch (e) {
    throw classifyError(e);
  }
}

export async function importKey(keyText: string, platform: Platform = getPlatform()): Promise<Connection> {
  const conn = await verifyKey(keyText, platform);
  await platform.secureStore.set(CREDENTIAL_KEY, keyText);
  return conn;
}

/** Read-only: returns null when nothing is stored; a stored but unusable credential raises. */
export async function restoreConnection(platform: Platform = getPlatform()): Promise<Connection | null> {
  const stored = await platform.secureStore.get(CREDENTIAL_KEY);
  if (!stored) return null;
  const auth = ServiceAccountAuth.fromKeyJson(stored, { platform });
  return {
    auth,
    client: new ApiClient(auth, { platform }),
    projectId: auth.projectId,
    clientEmail: auth.key.client_email,
  };
}

export async function forgetConnection(platform: Platform = getPlatform()): Promise<void> {
  await platform.secureStore.delete(CREDENTIAL_KEY);
}
