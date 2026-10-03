import { describe, expect, it } from "vitest";
import { ApiError, CodecError, ImportError } from "../../../core";
import { diagnosticText, technicalText } from "../describeError";

describe("diagnosticText", () => {
  it("keeps the API line for ApiError", () => {
    const e = new ApiError(409, "ALREADY_EXISTS", "Document already exists");
    expect(diagnosticText(e)).toBe(technicalText(e));
  });

  it("returns the parser text for CodecError and ImportError", () => {
    expect(diagnosticText(new CodecError("invalidJson", "", "Unexpected end of JSON at position 5"))).toBe("Unexpected end of JSON at position 5");
    expect(diagnosticText(new ImportError("badPath", { path: "a" }))).toContain("badPath");
  });

  it("sanitizes control characters and bounds the length", () => {
    const out = diagnosticText(new Error(`line1\n\u0007line2 ${"x".repeat(900)}`)) ?? "";
    expect(out.startsWith("line1 line2 x")).toBe(true);
    expect([...out].some((c) => c.charCodeAt(0) < 32)).toBe(false);
    expect(out.length).toBeLessThanOrEqual(501);
  });

  it("returns null for non-errors and empty messages", () => {
    expect(diagnosticText("boom")).toBeNull();
    expect(diagnosticText(undefined)).toBeNull();
    expect(diagnosticText(new Error("  "))).toBeNull();
  });
});
