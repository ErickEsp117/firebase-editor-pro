import type { TFunction } from "i18next";
import { ApiError, apiErrorKind } from "../../core";

/**
 * User-facing text for any thrown value, always in the active language for API failures. The service's own
 * wording is never part of it; read it with `technicalText` and show it in a labeled disclosure.
 */
export function describeError(t: TFunction, e: unknown): string {
  const kind = apiErrorKind(e);
  if (kind !== "other") return t(`errors.api.${kind}`);
  if (e instanceof ApiError) return t("errors.api.other", { http: e.http, status: e.status });
  return e instanceof Error ? e.message : String(e);
}

/** Raw diagnostic line for an API failure (HTTP code, Google status, message), or null when there is none. */
export function technicalText(e: unknown): string | null {
  if (!(e instanceof ApiError)) return null;
  return `${e.http > 0 ? `HTTP ${e.http} ` : ""}${e.status}: ${e.message}`;
}
