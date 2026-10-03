// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import "../../i18n";
import { ApiError, classifyError } from "../../core";
import { useSettings } from "../../store/settings";
import { ErrorBanner } from "../ErrorBanner";

const RAW_403 = "Cloud Firestore API has not been used in project 123 before or it is disabled.";

afterEach(cleanup);

describe.each([
  ["es", "Permiso denegado", "rol IAM", "Detalles técnicos"],
  ["en", "Permission denied", "IAM role", "Technical details"],
] as const)("connection 403 (%s)", (lang, head, role, label) => {
  beforeEach(() => useSettings.getState().setLanguage(lang));

  it("explains the role/API problem without Google's raw text; the raw text stays in the technical details", () => {
    render(<ErrorBanner error={classifyError(new ApiError(403, "PERMISSION_DENIED", RAW_403))} onDismiss={() => {}} />);
    const main = screen.getByTestId("connection-error-message").textContent!;
    expect(main).toContain(head);
    expect(main).toContain(role);
    expect(main).not.toContain(RAW_403);
    const tech = screen.getByTestId("connection-error-technical");
    expect(tech.textContent).toContain(label);
    expect(tech.textContent).toContain(RAW_403);
  });
});

describe("other connection failures", () => {
  beforeEach(() => useSettings.getState().setLanguage("es"));

  it.each([
    ["offline", new ApiError(0, "UNAVAILABLE", "Failed to fetch")],
    ["rejected", new ApiError(400, "INVALID_ARGUMENT", "Request contains an invalid argument")],
    ["unknown", new Error("Something broke in the engine")],
  ])("%s keeps the raw cause out of the main message", (_kind, e) => {
    render(<ErrorBanner error={classifyError(e)} onDismiss={() => {}} />);
    const raw = (e as Error).message;
    expect(screen.getByTestId("connection-error-message").textContent).not.toContain(raw);
    expect(screen.getByTestId("connection-error-technical").textContent).toContain(raw);
  });

  it("re-renders the main message when the language changes", () => {
    render(<ErrorBanner error={classifyError(new ApiError(403, "PERMISSION_DENIED", RAW_403))} onDismiss={() => {}} />);
    expect(screen.getByTestId("connection-error-message").textContent).toContain("Permiso denegado");
    act(() => useSettings.getState().setLanguage("en"));
    expect(screen.getByTestId("connection-error-message").textContent).toContain("Permission denied");
  });
});
