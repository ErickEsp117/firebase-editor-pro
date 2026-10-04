// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// A keychain read that never answers keeps the app on the "connecting" screen, like a pending macOS prompt.
vi.mock("../../platform", () => ({
  getPlatform: () => ({
    mode: "tauri",
    secureStore: { get: () => new Promise(() => {}), set: async () => {}, delete: async () => {} },
    pickJsonFile: async () => null,
  }),
}));

import "../../i18n";
import App from "../../App";
import { useConnection } from "../../store/connection";
import { useSettings } from "../../store/settings";

const setPlatform = (value: string) => Object.defineProperty(navigator, "platform", { value, configurable: true });

beforeEach(() => {
  window.matchMedia ??= ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;
  useConnection.setState({ phase: "restoring", connection: null, error: null });
  useSettings.getState().setLanguage("es");
});
afterEach(() => {
  cleanup();
  setPlatform("");
});

describe("keychain hint while connecting", () => {
  it("explains the macOS keychain prompt on macOS", async () => {
    setPlatform("MacIntel");
    render(<App />);
    expect((await screen.findByTestId("keychain-hint")).textContent).toContain("llavero");
  });

  it("is not shown on Windows, where Credential Manager never asks for a password", async () => {
    setPlatform("Win32");
    render(<App />);
    await screen.findByText(/Conectando/i);
    expect(screen.queryByTestId("keychain-hint")).toBeNull();
  });
});
