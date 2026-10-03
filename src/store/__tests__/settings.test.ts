// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

function withSystemLanguage(lang: string) {
  vi.spyOn(window.navigator, "language", "get").mockReturnValue(lang);
}

async function freshSettings() {
  vi.resetModules();
  return (await import("../settings")).useSettings;
}

beforeEach(() => localStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe("first-run language", () => {
  it.each([
    ["es-ES", "es"],
    ["es-MX", "es"],
    ["en-US", "en"],
    ["fr-FR", "en"],
    ["", "es"],
  ])("system language %j starts the app in %s", async (system, expected) => {
    withSystemLanguage(system);
    expect((await freshSettings()).getState().language).toBe(expected);
  });

  it("a saved choice wins over the system language and persists changes", async () => {
    withSystemLanguage("es-ES");
    localStorage.setItem("fbep:settings", JSON.stringify({ language: "en" }));
    const settings = await freshSettings();
    expect(settings.getState().language).toBe("en");
    settings.getState().setLanguage("es");
    expect(JSON.parse(localStorage.getItem("fbep:settings")!).language).toBe("es");
  });
});
