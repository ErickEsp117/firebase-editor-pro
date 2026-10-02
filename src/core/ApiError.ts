export class ApiError extends Error {
  readonly http: number;
  readonly status: string;

  constructor(http: number, status: string, message: string) {
    super(message);
    this.name = "ApiError";
    this.http = http;
    this.status = status;
  }
}

const HTTP_TO_STATUS: Record<number, string> = {
  0: "UNAVAILABLE",
  400: "INVALID_ARGUMENT",
  401: "UNAUTHENTICATED",
  403: "PERMISSION_DENIED",
  404: "NOT_FOUND",
  409: "ABORTED",
  412: "FAILED_PRECONDITION",
  429: "RESOURCE_EXHAUSTED",
  500: "INTERNAL",
  503: "UNAVAILABLE",
};

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** Builds an ApiError from a non-2xx response body; never matches on message text. */
export function parseApiError(http: number, bodyText: string): ApiError {
  const fallback = HTTP_TO_STATUS[http] ?? "UNKNOWN";
  let parsed: unknown;
  try {
    parsed = bodyText ? JSON.parse(bodyText) : undefined;
  } catch {
    parsed = undefined;
  }
  // Some Google endpoints wrap the error in a single-element array.
  if (Array.isArray(parsed)) parsed = parsed[0];

  if (isObj(parsed)) {
    const err = parsed.error;
    // google.rpc.Status: {"error":{"code","message","status"}}
    if (isObj(err)) {
      const status = typeof err.status === "string" ? err.status : fallback;
      const message = typeof err.message === "string" ? err.message : `HTTP ${http}`;
      return new ApiError(http, status, message);
    }
    // OAuth: {"error":"invalid_grant","error_description":"..."}
    if (typeof err === "string") {
      const desc = typeof parsed.error_description === "string" ? parsed.error_description : err;
      return new ApiError(http, err, desc);
    }
  }
  const text = bodyText.trim();
  return new ApiError(http, fallback, text ? text.slice(0, 500) : `HTTP ${http}`);
}
