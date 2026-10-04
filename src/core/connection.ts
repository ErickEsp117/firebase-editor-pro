import { getPlatform } from "../platform";
import type { Platform } from "../platform/types";
import { ApiClient } from "./ApiClient";
import { ApiError } from "./ApiError";
import { KeyFileError, ServiceAccountAuth, normalizeKeyId, type KeyFileReason } from "./ServiceAccountAuth";

export interface Connection {
  auth: ServiceAccountAuth;
  client: ApiClient;
  projectId: string;
  clientEmail: string;
}

export type ConnectionErrorKind =
  | "keyInvalid"
  | "keyUnreadable"
  | "rejected"
  | "offline"
  | "forbidden"
  | "fileRead"
  | "keychainDenied"
  | "unknown";

/** Non-secret identifiers that tell a wrong file apart from a revoked key. */
export interface ConnectionErrorContext {
  fileName?: string;
  keyId?: string;
}

export class ConnectionError extends Error {
  constructor(
    readonly kind: ConnectionErrorKind,
    readonly detail: string,
    readonly reason?: { code: KeyFileReason; field?: string },
    readonly fileName?: string,
    readonly keyId?: string,
  ) {
    super(detail);
    this.name = "ConnectionError";
  }

  withContext(ctx: ConnectionErrorContext): ConnectionError {
    return new ConnectionError(this.kind, this.detail, this.reason, ctx.fileName ?? this.fileName, ctx.keyId ?? this.keyId);
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
  // Stable code from the native store when the user answered "Deny" in the macOS keychain prompt.
  if (msg.startsWith("KEYCHAIN_DENIED")) return new ConnectionError("keychainDenied", msg);
  if (/private key/i.test(msg)) return new ConnectionError("keyUnreadable", msg);
  return new ConnectionError("unknown", msg);
}

/** Parses locally, then proves the key works with a real token + root listCollectionIds. Nothing is stored. */
export async function verifyKey(
  keyText: string,
  platform: Platform = getPlatform(),
  fileName?: string,
): Promise<Connection> {
  let keyId: string | undefined;
  try {
    const auth = ServiceAccountAuth.fromKeyJson(keyText, { platform });
    keyId = normalizeKeyId(auth.key.private_key_id);
    const client = new ApiClient(auth, { platform });
    const conn = { auth, client, projectId: auth.projectId, clientEmail: auth.key.client_email };
    await listRootCollections(conn);
    return conn;
  } catch (e) {
    throw classifyError(e).withContext({ fileName: fileName || undefined, keyId });
  }
}

/** Offline: builds the clients from a stored key.json without verifying it with Google. */
export function connectionFromKeyText(keyText: string, platform: Platform = getPlatform()): Connection {
  const auth = ServiceAccountAuth.fromKeyJson(keyText, { platform });
  return {
    auth,
    client: new ApiClient(auth, { platform }),
    projectId: auth.projectId,
    clientEmail: auth.key.client_email,
  };
}
