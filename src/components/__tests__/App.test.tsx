// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const store = new Map<string, string>();
vi.mock("../../platform", () => ({
  getPlatform: () => ({
    mode: "browser",
    secureStore: {
      get: async (k: string) => store.get(k) ?? null,
      set: async (k: string, v: string) => void store.set(k, v),
      delete: async (k: string) => void store.delete(k),
    },
    pickJsonFile: async () => ({ name: "k.json", contents: "{bad" }),
  }),
}));

import "../../i18n";
import App from "../../App";
import { useConnection } from "../../store/connection";
import { useSettings } from "../../store/settings";

beforeEach(() => {
  store.clear();
  localStorage.clear();
  window.matchMedia ??= ((q: string) => ({
    matches: false,
    media: q,
    addEventListener() {},
    removeEventListener() {},
  })) as unknown as typeof window.matchMedia;
  useConnection.setState({ phase: "restoring", connection: null, error: null });
  useSettings.getState().setLanguage("es");
});
afterEach(cleanup);

describe("App", () => {
  it("shows the welcome screen with no credential", async () => {
    render(<App />);
    await screen.findByTestId("welcome");
    expect(screen.getByTestId("import-key").textContent).toBe("Importar key.json");
    expect(screen.queryByTestId("connected")).toBeNull();
  });

  it("shows a clear local error for a malformed key and stays usable", async () => {
    render(<App />);
    fireEvent.click(await screen.findByTestId("import-key"));
    const alert = await screen.findByTestId("connection-error");
    expect(alert.textContent).toContain("no es válido");
    expect(store.size).toBe(0);
    expect((screen.getByTestId("import-key") as HTMLButtonElement).disabled).toBe(false);
  });

  it("switches language and persists it", async () => {
    render(<App />);
    await screen.findByTestId("welcome");
    fireEvent.change(screen.getByTestId("language-select"), { target: { value: "en" } });
    await waitFor(() => expect(screen.getByTestId("import-key").textContent).toBe("Import key.json"));
    expect(JSON.parse(localStorage.getItem("fbep:settings")!).language).toBe("en");
  });
});
