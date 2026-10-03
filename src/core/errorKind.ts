import { ApiError } from "./ApiError";

export type ApiErrorKind = "offline" | "unauthenticated" | "forbidden" | "notFound" | "rateLimited" | "server" | "other";

/** Classifies by HTTP code and Google `status`, never by message text. Non-API errors are "other". */
export function apiErrorKind(e: unknown): ApiErrorKind {
  if (!(e instanceof ApiError)) return "other";
  if (e.http === 0) return "offline";
  if (e.http === 401 || e.status === "UNAUTHENTICATED") return "unauthenticated";
  if (e.http === 403 || e.status === "PERMISSION_DENIED") return "forbidden";
  if (e.http === 404 || e.status === "NOT_FOUND") return "notFound";
  if (e.http === 429 || e.status === "RESOURCE_EXHAUSTED") return "rateLimited";
  if (e.http >= 500) return "server";
  return "other";
}
