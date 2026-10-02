import { ApiError, parseApiError } from "./ApiError";
import type { ServiceAccountAuth } from "./ServiceAccountAuth";
import { createTransport, type FetchFn, type Transport } from "./transport";
import type { Platform } from "../platform/types";

export interface ApiRequest {
  method?: string;
  headers?: Record<string, string>;
  /** Objects are JSON-encoded; strings are sent verbatim. */
  body?: unknown;
}

export interface ApiResponse<T = unknown> {
  status: number;
  headers: Headers;
  data: T;
  text: string;
}

export interface ApiClientOptions {
  platform?: Pick<Platform, "mode">;
  fetch?: FetchFn;
  useProxy?: boolean;
}

export class ApiClient {
  private readonly transport: Transport;

  constructor(
    private readonly auth: Pick<ServiceAccountAuth, "getAccessToken" | "refresh">,
    opts: ApiClientOptions = {},
  ) {
    this.transport = createTransport(opts);
  }

  async request<T = unknown>(url: string, req: ApiRequest = {}): Promise<ApiResponse<T>> {
    let res = await this.send(url, req, await this.auth.getAccessToken());
    if (res.status === 401) {
      res = await this.send(url, req, await this.auth.refresh());
    }
    const text = await res.text();
    if (!res.ok) throw parseApiError(res.status, text);
    let data: unknown = undefined;
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = text;
      }
    }
    return { status: res.status, headers: res.headers, data: data as T, text };
  }

  private async send(url: string, req: ApiRequest, token: string): Promise<Response> {
    const headers: Record<string, string> = { ...req.headers, Authorization: `Bearer ${token}` };
    let body: string | undefined;
    if (req.body !== undefined) {
      if (typeof req.body === "string") body = req.body;
      else {
        body = JSON.stringify(req.body);
        headers["Content-Type"] ??= "application/json";
      }
    }
    try {
      return await this.transport.fetch(url, { method: req.method ?? "GET", headers, body });
    } catch (e) {
      throw new ApiError(0, "UNAVAILABLE", e instanceof Error ? e.message : "network error");
    }
  }
}
