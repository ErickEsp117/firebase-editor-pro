import type { TFunction } from "i18next";
import { CodecError, ImportError } from "../../../core";
import { PlatformFileError } from "../../../platform/errors";
import { errorMessage } from "../TreeNodes";

export function ioErrorMessage(t: TFunction, e: unknown): string {
  if (e instanceof CodecError || e instanceof ImportError) return t(e.i18nKey, e.params);
  if (e instanceof PlatformFileError) return t(`io.fileErrors.${e.code}`);
  return errorMessage(e);
}
