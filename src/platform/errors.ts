/** Mirrors MAX_IMPORT_FILE_BYTES in src-tauri/src/files.rs. */
export const MAX_FILE_BYTES = 32 * 1024 * 1024;

export const FILE_ERROR_CODES = [
  "file_read_failed",
  "file_write_failed",
  "file_not_regular",
  "file_too_large",
  "file_not_utf8",
] as const;

export type FileErrorCode = (typeof FILE_ERROR_CODES)[number];

/** A file operation failed for a reason the UI translates by `code`; the message is never shown. */
export class PlatformFileError extends Error {
  constructor(readonly code: FileErrorCode) {
    super(code);
    this.name = "PlatformFileError";
  }
}

export function isFileErrorCode(v: unknown): v is FileErrorCode {
  return typeof v === "string" && (FILE_ERROR_CODES as readonly string[]).includes(v);
}

/** Native commands reject with the bare code string; anything unrecognised is rethrown as is. */
export function toPlatformFileError(e: unknown): unknown {
  return isFileErrorCode(e) ? new PlatformFileError(e) : e;
}

export function assertWithinFileLimit(contents: string): void {
  // A UTF-16 length of limit/3 cannot exceed the limit in UTF-8 (max 3 bytes per unit), so skip encoding for small payloads.
  if (contents.length * 3 <= MAX_FILE_BYTES) return;
  if (new TextEncoder().encode(contents).length > MAX_FILE_BYTES) {
    throw new PlatformFileError("file_too_large");
  }
}
