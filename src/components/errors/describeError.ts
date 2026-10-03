import type { TFunction } from "i18next";
import { apiErrorKind } from "../../core";

/** User-facing text for any thrown value. Only the message is used, never a stack trace. */
export function describeError(t: TFunction, e: unknown): string {
  const kind = apiErrorKind(e);
  if (kind !== "other") return t(`errors.api.${kind}`);
  return e instanceof Error ? e.message : String(e);
}
