import { getPlatform } from "../platform";
import type { Platform } from "../platform/types";
import { ApiError, parseApiError } from "./ApiError";
import { createTransport, type FetchFn, type Transport } from "./transport";

export const SCOPES =
  "https://www.googleapis.com/auth/datastore https://www.googleapis.com/auth/firebase.remoteconfig";
const GRANT_TYPE = "urn:ietf:params:oauth:grant-type:jwt-bearer";
const JWT_TTL_S = 3600;
const REFRESH_MARGIN_MS = 60_000;

export interface ServiceAccountKey {
  type: "service_account";
  project_id: string;
  private_key: string;
  private_key_id?: string;
  client_email: string;
  token_uri: string;
}

export type KeyFileReason = "notJson" | "notObject" | "badType" | "badField" | "badPem";

export class KeyFileError extends Error {
  constructor(
    message: string,
    readonly reason: KeyFileReason,
    readonly field?: string,
  ) {
    super(message);
    this.name = "KeyFileError";
  }
}

/** private_key_id is optional and untrusted JSON: only a non-empty string counts as a key id. */
export function normalizeKeyId(value: unknown): string | undefined {
  return typeof value === "string" && value !== "" ? value : undefined;
}

/** Validates locally; error messages name fields only, never values. */
export function parseKeyJson(text: string): ServiceAccountKey {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new KeyFileError("key file is not valid JSON", "notJson");
  }
  if (typeof raw !== "object" || raw === null) throw new KeyFileError("key file must be a JSON object", "notObject");
  const o = raw as Record<string, unknown>;
  if (o.type !== "service_account") throw new KeyFileError('field "type" must be "service_account"', "badType", "type");
  for (const f of ["project_id", "private_key", "client_email", "token_uri"] as const) {
    if (typeof o[f] !== "string" || o[f] === "") throw new KeyFileError(`missing or invalid field "${f}"`, "badField", f);
  }
  if (!(o.private_key as string).includes("BEGIN PRIVATE KEY")) {
    throw new KeyFileError('field "private_key" is not a PEM PKCS#8 key', "badPem", "private_key");
  }
  const key = o as unknown as ServiceAccountKey;
  key.private_key_id = normalizeKeyId(o.private_key_id);
  return key;
}

export function buildJwtParts(key: ServiceAccountKey, nowMs: number) {
  const iat = Math.floor(nowMs / 1000);
  const header: Record<string, unknown> = { alg: "RS256", typ: "JWT" };
  const kid = normalizeKeyId(key.private_key_id);
  if (kid) header.kid = kid;
  const claims = {
    iss: key.client_email,
    scope: SCOPES,
    aud: key.token_uri,
    iat,
    exp: iat + JWT_TTL_S,
  };
  return { header, claims };
}

export interface AuthOptions {
  platform?: Platform;
  fetch?: FetchFn;
  useProxy?: boolean;
  /** Injectable clock (ms) so expiry can be simulated. */
  now?: () => number;
}

export class ServiceAccountAuth {
  readonly key: ServiceAccountKey;
  private readonly platform: Platform;
  private readonly transport: Transport;
  private readonly now: () => number;
  private cached: { token: string; expiresAtMs: number } | null = null;
  private inflight: Promise<string> | null = null;

  constructor(key: ServiceAccountKey, opts: AuthOptions = {}) {
    this.key = key;
    this.platform = opts.platform ?? getPlatform();
    this.transport = createTransport({
      platform: this.platform,
      fetch: opts.fetch,
      useProxy: opts.useProxy,
    });
    this.now = opts.now ?? Date.now;
  }

  static fromKeyJson(text: string, opts: AuthOptions = {}): ServiceAccountAuth {
    return new ServiceAccountAuth(parseKeyJson(text), opts);
  }

  get projectId(): string {
    return this.key.project_id;
  }

  /** Returns a cached token, re-minting when fewer than 60 s remain. */
  async getAccessToken(): Promise<string> {
    if (this.cached && this.now() < this.cached.expiresAtMs - REFRESH_MARGIN_MS) {
      return this.cached.token;
    }
    return this.mint();
  }

  /** Marks the cached token as expired; the next getAccessToken() re-mints. */
  invalidate(): void {
    this.cached = null;
  }

  /** Drops the cached token and mints a new one (used after a 401). */
  async refresh(): Promise<string> {
    this.cached = null;
    return this.mint();
  }

  private mint(): Promise<string> {
    this.inflight ??= this.doMint().finally(() => {
      this.inflight = null;
    });
    return this.inflight;
  }

  private async doMint(): Promise<string> {
    const startedMs = this.now();
    const { header, claims } = buildJwtParts(this.key, startedMs);
    const assertion = await this.platform.signJwtRsa(this.key.private_key, header, claims);
    let res: Response;
    try {
      res = await this.transport.fetch(this.key.token_uri, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ grant_type: GRANT_TYPE, assertion }).toString(),
      });
    } catch (e) {
      throw new ApiError(0, "UNAVAILABLE", e instanceof Error ? e.message : "network error");
    }
    const text = await res.text();
    if (!res.ok) throw parseApiError(res.status, text);
    let body: { access_token?: unknown; expires_in?: unknown };
    try {
      body = JSON.parse(text);
    } catch {
      throw new ApiError(res.status, "INTERNAL", "token endpoint returned invalid JSON");
    }
    if (typeof body.access_token !== "string") {
      throw new ApiError(res.status, "INTERNAL", "token response missing access_token");
    }
    const ttl = typeof body.expires_in === "number" ? body.expires_in : JWT_TTL_S;
    this.cached = { token: body.access_token, expiresAtMs: startedMs + ttl * 1000 };
    return body.access_token;
  }
}
