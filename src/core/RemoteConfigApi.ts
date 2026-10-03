import { ApiError } from "./ApiError";
import type { ApiClient } from "./ApiClient";

const BASE = "https://firebaseremoteconfig.googleapis.com/v1";
const MAX_DESCRIPTION = 1024;

/** Whole Remote Config template; unknown keys must survive a round trip, so only the known ones are typed. */
export type RemoteConfigTemplate = Record<string, unknown>;

export interface TemplateWithEtag {
  template: RemoteConfigTemplate;
  etag: string;
}

export interface RemoteConfigVersion {
  versionNumber: string;
  updateTime?: string;
  updateOrigin?: string;
  updateType?: string;
  updateUser?: { email?: string; name?: string; imageUrl?: string };
  description?: string;
  rollbackSource?: string;
  isLegacy?: boolean;
}

export interface VersionsPage {
  versions: RemoteConfigVersion[];
  nextPageToken?: string;
}

export interface PublishOptions {
  /** Sends `If-Match: *`; use only after an explicit user confirmation. */
  force?: boolean;
}

export type DefaultsFormat = "JSON" | "PLIST" | "XML";

/**
 * The ETag the user holds is stale. Subclass of ApiError so generic handlers still work; the UI
 * checks it (or `isRemoteConfigConflict`) to offer reload / force instead of a validation message.
 */
export class RemoteConfigConflictError extends ApiError {
  constructor(source: ApiError) {
    super(source.http, source.status, source.message);
    this.name = "RemoteConfigConflictError";
  }
}

export function isRemoteConfigConflict(e: unknown): e is RemoteConfigConflictError {
  return e instanceof RemoteConfigConflictError;
}

type Requester = Pick<ApiClient, "request">;

const CONFLICT_STATUSES = new Set(["ABORTED", "FAILED_PRECONDITION"]);

export class RemoteConfigApi {
  private readonly url: string;

  constructor(
    private readonly client: Requester,
    readonly projectId: string,
  ) {
    this.url = `${BASE}/projects/${projectId}/remoteConfig`;
  }

  async getTemplate(): Promise<TemplateWithEtag> {
    const res = await this.client.request<RemoteConfigTemplate | undefined>(this.url);
    return { template: asTemplate(res.data), etag: requireEtag(res.headers) };
  }

  /**
   * Validates without writing (PUT ?validate_only=true). The ETag of a successful validation ends in
   * "-0" and does not match the live template, so it is deliberately not returned: keep using the
   * ETag from getTemplate/publish. The live API accepts a well-formed but outdated ETag here, so a
   * stale template is only detected on publish. Precondition failures (409/412/ABORTED/FAILED_PRECONDITION)
   * still raise RemoteConfigConflictError; any other 400 is a plain ApiError describing the template problem.
   */
  async validate(template: RemoteConfigTemplate, etag: string): Promise<void> {
    try {
      await this.client.request(`${this.url}?validate_only=true`, {
        method: "PUT",
        headers: { "If-Match": etag },
        body: template,
      });
    } catch (e) {
      throw e instanceof ApiError && isPreconditionFailure(e) ? new RemoteConfigConflictError(e) : e;
    }
  }

  /**
   * Replaces the whole template and creates a new version. `version` is replaced by `{description}`
   * (the GET value is read-only metadata); every other key is sent untouched. Without `force`, a
   * 400/409/412 means the ETag is stale: the caller is expected to have validated the template first.
   */
  async publish(
    template: RemoteConfigTemplate,
    etag: string,
    description: string,
    opts: PublishOptions = {},
  ): Promise<TemplateWithEtag> {
    if (description.length > MAX_DESCRIPTION) {
      throw new Error(`Version description exceeds ${MAX_DESCRIPTION} characters`);
    }
    const force = opts.force === true;
    try {
      const res = await this.client.request<RemoteConfigTemplate | undefined>(this.url, {
        method: "PUT",
        headers: { "If-Match": force ? "*" : etag },
        body: { ...template, version: { description } },
      });
      return { template: asTemplate(res.data), etag: requireEtag(res.headers) };
    } catch (e) {
      if (!force && e instanceof ApiError && (e.http === 400 || isPreconditionFailure(e))) {
        throw new RemoteConfigConflictError(e);
      }
      throw e;
    }
  }

  async listVersions(opts: { pageSize?: number; pageToken?: string } = {}): Promise<VersionsPage> {
    const params = new URLSearchParams();
    if (opts.pageSize !== undefined) params.set("pageSize", String(opts.pageSize));
    if (opts.pageToken) params.set("pageToken", opts.pageToken);
    const qs = params.toString();
    const res = await this.client.request<{ versions?: RemoteConfigVersion[]; nextPageToken?: string } | undefined>(
      `${this.url}:listVersions${qs ? `?${qs}` : ""}`,
    );
    return { versions: res.data?.versions ?? [], nextPageToken: res.data?.nextPageToken || undefined };
  }

  /** Restores a previous version as a new one; the API wants the number as a string. */
  async rollback(versionNumber: string | number): Promise<TemplateWithEtag> {
    const res = await this.client.request<RemoteConfigTemplate | undefined>(`${this.url}:rollback`, {
      method: "POST",
      body: { versionNumber: String(versionNumber) },
    });
    return { template: asTemplate(res.data), etag: requireEtag(res.headers) };
  }

  /** Raw file contents, ready to save. */
  async downloadDefaults(format: DefaultsFormat = "JSON"): Promise<string> {
    const res = await this.client.request(`${this.url}:downloadDefaults?format=${format}`);
    return res.text;
  }
}

function isPreconditionFailure(e: ApiError): boolean {
  return e.http === 409 || e.http === 412 || CONFLICT_STATUSES.has(e.status);
}

function asTemplate(data: unknown): RemoteConfigTemplate {
  return typeof data === "object" && data !== null && !Array.isArray(data) ? (data as RemoteConfigTemplate) : {};
}

function requireEtag(headers: Headers): string {
  const etag = headers.get("ETag");
  if (!etag) throw new ApiError(0, "UNAVAILABLE", "Remote Config response had no ETag header");
  return etag;
}
