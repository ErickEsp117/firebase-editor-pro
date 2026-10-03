import type { Platform } from "../platform/types";
import { reportReachable } from "./networkStatus";

export type FetchFn = (input: string, init?: RequestInit) => Promise<Response>;

const PROXY_PREFIX: Record<string, string> = {
  "firestore.googleapis.com": "/g/firestore",
  "firebaseremoteconfig.googleapis.com": "/g/remoteconfig",
  "oauth2.googleapis.com": "/g/oauth2",
};

export interface TransportOptions {
  /** Defaults to the platform mode: Tauri uses plugin-http, browser uses same-origin proxy. */
  platform?: Pick<Platform, "mode">;
  fetch?: FetchFn;
  /** Map Google hosts to the Vite `/g/*` proxy. Defaults to browser mode with a window. */
  useProxy?: boolean;
}

export function mapUrl(url: string, useProxy: boolean): string {
  if (!useProxy) return url;
  const u = new URL(url);
  const prefix = PROXY_PREFIX[u.host];
  return prefix ? `${prefix}${u.pathname}${u.search}` : url;
}

export interface Transport {
  fetch: FetchFn;
}

export function createTransport(opts: TransportOptions = {}): Transport {
  const mode = opts.platform?.mode ?? "browser";
  const useProxy = opts.useProxy ?? (mode === "browser" && typeof window !== "undefined");
  const send: FetchFn = async (target, init) => {
    if (opts.fetch) return opts.fetch(target, init);
    if (mode === "tauri") {
      const { fetch: tauriFetch } = await import("@tauri-apps/plugin-http");
      return tauriFetch(target, init);
    }
    return globalThis.fetch(target, init);
  };
  return {
    fetch: async (url, init) => {
      try {
        const res = await send(mapUrl(url, useProxy), init);
        reportReachable(true);
        return res;
      } catch (e) {
        // An aborted request says nothing about the network (DOMException is not always an Error subclass).
        if ((e as { name?: unknown } | null)?.name !== "AbortError") reportReachable(false);
        throw e;
      }
    },
  };
}
