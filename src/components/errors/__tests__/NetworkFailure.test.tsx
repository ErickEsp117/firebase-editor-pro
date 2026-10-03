// @vitest-environment jsdom
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "../../../i18n";
import { createTransport } from "../../../core/transport";
import { isReachable, reportReachable } from "../../../core";
import { useConnection } from "../../../store/connection";
import { useSettings } from "../../../store/settings";
import { StatusBar } from "../../StatusBar";
import { OfflineBanner } from "../OfflineBanner";

beforeEach(() => {
  reportReachable(true);
  useSettings.getState().setLanguage("en");
  useConnection.setState({ phase: "connected", connection: { projectId: "demo-store" } as never });
});
afterEach(() => {
  cleanup();
  reportReachable(true);
});

describe("a request that gets no response (VAL-UI-008, VAL-CROSS-012)", () => {
  it("marks Google unreachable; any later response clears it; an abort does not count", async () => {
    let down = true;
    const transport = createTransport({
      useProxy: false,
      fetch: async () => {
        if (down) throw new TypeError("Failed to fetch");
        return new Response("{}", { status: 200 });
      },
    });
    await expect(transport.fetch("https://firestore.googleapis.com/v1/x")).rejects.toThrow(TypeError);
    expect(isReachable()).toBe(false);
    down = false;
    await transport.fetch("https://firestore.googleapis.com/v1/x");
    expect(isReachable()).toBe(true);
    const aborting = createTransport({ useProxy: false, fetch: async () => { throw new DOMException("aborted", "AbortError"); } });
    await expect(aborting.fetch("https://firestore.googleapis.com/v1/x")).rejects.toThrow();
    expect(isReachable()).toBe(true);
  });

  it("shows the offline banner and the status bar state, and Retry re-runs failed queries", async () => {
    let fail = true;
    const queryFn = vi.fn(async () => {
      if (fail) {
        reportReachable(false);
        throw new TypeError("Failed to fetch");
      }
      reportReachable(true);
      return "ok";
    });
    function Probe() {
      const q = useQuery({ queryKey: ["probe"], queryFn, retry: false });
      return <p data-testid="probe">{q.data ?? q.status}</p>;
    }
    render(
      <QueryClientProvider client={new QueryClient()}>
        <OfflineBanner />
        <Probe />
        <StatusBar />
      </QueryClientProvider>,
    );
    await screen.findByTestId("offline-banner");
    expect(screen.getByTestId("status-connection").textContent).toBe("Offline · demo-store");
    act(() => useSettings.getState().setLanguage("es"));
    expect(screen.getByTestId("status-connection").textContent).toBe("Sin conexión · demo-store");
    fail = false;
    fireEvent.click(screen.getByTestId("offline-retry"));
    await waitFor(() => expect(screen.getByTestId("probe").textContent).toBe("ok"));
    expect(screen.queryByTestId("offline-banner")).toBeNull();
    expect(screen.getByTestId("status-connection").textContent).toBe("Conectado · demo-store");
  });
});
