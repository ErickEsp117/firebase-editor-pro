import { describe, expect, it } from "vitest";
import { parseApiError } from "../ApiError";

describe("parseApiError", () => {
  it("parses google.rpc.Status bodies", () => {
    const e = parseApiError(404, JSON.stringify({ error: { code: 404, message: "no doc", status: "NOT_FOUND" } }));
    expect([e.http, e.status, e.message]).toEqual([404, "NOT_FOUND", "no doc"]);
  });
  it("parses array-wrapped errors", () => {
    const e = parseApiError(409, JSON.stringify([{ error: { code: 409, message: "x", status: "ALREADY_EXISTS" } }]));
    expect(e.status).toBe("ALREADY_EXISTS");
  });
  it("parses OAuth error bodies", () => {
    const e = parseApiError(400, JSON.stringify({ error: "invalid_grant", error_description: "Invalid JWT Signature." }));
    expect([e.status, e.message]).toEqual(["invalid_grant", "Invalid JWT Signature."]);
  });
  it("falls back to HTTP-derived status when status is missing", () => {
    const e = parseApiError(403, JSON.stringify({ error: { code: 403, message: "denied" } }));
    expect(e.status).toBe("PERMISSION_DENIED");
  });
  it("handles non-JSON bodies", () => {
    const e = parseApiError(502, "<html>Bad gateway</html>");
    expect([e.http, e.status, e.message]).toEqual([502, "UNKNOWN", "<html>Bad gateway</html>"]);
  });
  it("handles empty bodies", () => {
    const e = parseApiError(401, "");
    expect([e.status, e.message]).toEqual(["UNAUTHENTICATED", "HTTP 401"]);
  });
});
