// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "../../../i18n";
import { ApiError, apiErrorKind } from "../../../core";
import { useSettings } from "../../../store/settings";
import { ErrorNotice } from "../ErrorNotice";
import { OfflineBanner } from "../OfflineBanner";

beforeEach(() => useSettings.getState().setLanguage("es"));
afterEach(cleanup);

const forbidden = () => new ApiError(403, "PERMISSION_DENIED", "Cloud Firestore API has not been used in project 123 before or it is disabled.");

describe("apiErrorKind", () => {
  it("classifies by HTTP code and Google status, never by message", () => {
    expect(apiErrorKind(new ApiError(0, "UNAVAILABLE", "Failed to fetch"))).toBe("offline");
    expect(apiErrorKind(new ApiError(401, "UNAUTHENTICATED", "x"))).toBe("unauthenticated");
    expect(apiErrorKind(forbidden())).toBe("forbidden");
    expect(apiErrorKind(new ApiError(200, "PERMISSION_DENIED", "x"))).toBe("forbidden");
    expect(apiErrorKind(new ApiError(404, "NOT_FOUND", "x"))).toBe("notFound");
    expect(apiErrorKind(new ApiError(429, "RESOURCE_EXHAUSTED", "x"))).toBe("rateLimited");
    expect(apiErrorKind(new ApiError(503, "UNAVAILABLE", "x"))).toBe("server");
    expect(apiErrorKind(new ApiError(400, "INVALID_ARGUMENT", "permission denied 403"))).toBe("other");
    expect(apiErrorKind(new Error("403"))).toBe("other");
  });
});

describe("ErrorNotice", () => {
  it("explains a 403 as a missing role or disabled API in Spanish, without a stack trace", () => {
    const err = forbidden();
    err.stack = "Error: boom\n    at secretFunction (/src/internal.ts:1:1)";
    render(<ErrorNotice error={err} summary="No se pudo cargar" />);
    const alert = screen.getByTestId("error-notice");
    expect(alert.getAttribute("data-error-kind")).toBe("forbidden");
    const msg = screen.getByTestId("error-notice-message").textContent!;
    expect(msg).toContain("Permiso denegado");
    expect(msg).toMatch(/rol IAM/);
    expect(msg).toMatch(/API no está habilitada/);
    expect(alert.textContent).not.toContain("secretFunction");
    expect(alert.textContent).not.toMatch(/\bat \S+ \(/);
    expect(screen.getByTestId("error-notice-technical").textContent).toContain("HTTP 403 PERMISSION_DENIED");
  });

  it("explains a 403 in English when the language is EN", () => {
    useSettings.getState().setLanguage("en");
    render(<ErrorNotice error={forbidden()} />);
    const msg = screen.getByTestId("error-notice-message").textContent!;
    expect(msg).toContain("Permission denied");
    expect(msg).toMatch(/IAM role/);
    expect(msg).toMatch(/API is not enabled/);
    expect(msg).not.toMatch(/Permiso|rol IAM/);
  });

  it.each([
    ["es", new ApiError(0, "UNAVAILABLE", "Failed to fetch"), "Sin conexión"],
    ["en", new ApiError(0, "UNAVAILABLE", "Failed to fetch"), "No connection"],
    ["es", new ApiError(404, "NOT_FOUND", "gone"), "No encontrado"],
    ["en", new ApiError(404, "NOT_FOUND", "gone"), "Not found"],
    ["es", new ApiError(401, "UNAUTHENTICATED", "x"), "rechazó la credencial"],
    ["en", new ApiError(401, "UNAUTHENTICATED", "x"), "rejected the credential"],
  ] as const)("renders %s text for %s", (lang, error, expected) => {
    useSettings.getState().setLanguage(lang);
    render(<ErrorNotice error={error} />);
    expect(screen.getByTestId("error-notice-message").textContent).toContain(expected);
  });

  it("shows only the message of non-API errors and offers a working retry", () => {
    const onRetry = vi.fn();
    const err = new Error("something odd");
    err.stack = "Error: something odd\n    at hidden (file.ts:1:1)";
    render(<ErrorNotice error={err} onRetry={onRetry} />);
    const alert = screen.getByTestId("error-notice");
    expect(alert.textContent).toContain("something odd");
    expect(alert.textContent).not.toContain("hidden");
    expect(screen.queryByTestId("error-notice-technical")).toBeNull();
    fireEvent.click(screen.getByTestId("error-notice-retry"));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});

describe("OfflineBanner", () => {
  it("appears on the offline event in the active language and disappears when back online", () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <OfflineBanner />
      </QueryClientProvider>,
    );
    expect(screen.queryByTestId("offline-banner")).toBeNull();
    act(() => void window.dispatchEvent(new Event("offline")));
    expect(screen.getByTestId("offline-banner").textContent).toContain("Sin conexión");
    act(() => useSettings.getState().setLanguage("en"));
    expect(screen.getByTestId("offline-banner").textContent).toContain("You are offline");
    act(() => void window.dispatchEvent(new Event("online")));
    expect(screen.queryByTestId("offline-banner")).toBeNull();
  });

  it("re-runs failed queries when the connection returns", async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    let fail = true;
    const fn = vi.fn(async () => {
      if (fail) throw new ApiError(0, "UNAVAILABLE", "Failed to fetch");
      return "ok";
    });
    const { useQuery } = await import("@tanstack/react-query");
    function Probe() {
      const q = useQuery({ queryKey: ["probe"], queryFn: fn });
      return <p data-testid="probe">{q.data ?? q.status}</p>;
    }
    render(
      <QueryClientProvider client={qc}>
        <OfflineBanner />
        <Probe />
      </QueryClientProvider>,
    );
    await screen.findByText("error");
    fail = false;
    await act(async () => {
      window.dispatchEvent(new Event("online"));
    });
    await screen.findByText("ok");
  });
});
