// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import "../../../i18n";
import { useConnection } from "../../../store/connection";
import { useRcEditor } from "../../../store/rcEditor";
import { useSettings } from "../../../store/settings";
import { OfflineBanner } from "../../errors/OfflineBanner";
import { RemoteConfigView } from "../RemoteConfigView";

Range.prototype.getClientRects ??= () => [] as unknown as DOMRectList;
Range.prototype.getBoundingClientRect ??= () => new DOMRect();

const RAW = "Remote Config response had no ETag header";
const request = async () => ({ status: 200, data: { version: { versionNumber: "1" } }, text: "{}", headers: new Headers() });

beforeEach(() => {
  useRcEditor.getState().reset();
  useConnection.setState({ phase: "connected", connection: { client: { request }, projectId: "p", clientEmail: "x" } as never });
});
afterEach(cleanup);

describe.each([
  ["es", "no devolvió el ETag", "Sin conexión", "Detalles técnicos"],
  ["en", "did not return the template ETag", "No connection", "Technical details"],
] as const)("Remote Config template loaded without ETag (%s)", (lang, specific, offline, label) => {
  beforeEach(() => useSettings.getState().setLanguage(lang));

  it("shows the specific message, not the offline one; the raw text lives in the technical details", async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <OfflineBanner />
        <RemoteConfigView />
      </QueryClientProvider>,
    );
    const alert = await screen.findByTestId("rc-load-error");
    expect(alert.getAttribute("data-error-kind")).toBe("unexpectedResponse");
    const main = screen.getByTestId("rc-load-error-message").textContent!;
    expect(main).toContain(specific);
    expect(main).not.toContain(offline);
    expect(main).not.toContain(RAW);
    const tech = screen.getByTestId("rc-load-error-technical");
    expect(tech.textContent).toContain(RAW);
    expect(tech.textContent).toContain("MISSING_ETAG");
    expect(alert.textContent).toContain(label);
    expect(screen.queryByTestId("offline-banner")).toBeNull();
    expect(document.body.textContent).not.toContain(offline);
  });
});
