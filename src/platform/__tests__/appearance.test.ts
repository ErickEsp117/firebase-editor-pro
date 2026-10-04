// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const native = vi.hoisted(() => ({ tauri: false, appearance: { platform: "macos", vibrancy: true, accent: "#FF2D55" as string | null } }));
vi.mock("@tauri-apps/api/core", () => ({
  isTauri: () => native.tauri,
  invoke: vi.fn(async () => native.appearance),
}));

import { accentContrast, applyAccent, initNativeAppearance, refreshAppearance } from "../appearance";

const root = document.documentElement;
const accent = () => root.style.getPropertyValue("--accent");

beforeEach(() => {
  native.tauri = false;
  native.appearance = { platform: "macos", vibrancy: true, accent: "#FF2D55" };
  root.removeAttribute("style");
  root.className = "";
  localStorage.clear();
});
afterEach(() => vi.restoreAllMocks());

describe("system accent resolution", () => {
  it("uses the color the platform provides, with readable text on it", async () => {
    native.tauri = true;
    await refreshAppearance();
    expect(accent()).toBe("#FF2D55");
    expect(root.style.getPropertyValue("--accent-contrast")).toBe("#ffffff");
    expect(root.classList.contains("platform-macos")).toBe(true);
    expect(root.classList.contains("vibrancy")).toBe(true);
    expect(localStorage.getItem("fbep:accent")).toBe("#FF2D55");
  });

  it("falls back to the CSS default (macOS blue) when the platform gives no accent", async () => {
    native.tauri = true;
    applyAccent("#123456");
    native.appearance = { platform: "windows", vibrancy: false, accent: null };
    await refreshAppearance();
    expect(accent()).toBe("");
    expect(root.style.getPropertyValue("--accent-contrast")).toBe("");
    expect(root.classList.contains("platform-windows")).toBe(true);
    expect(root.classList.contains("platform-macos")).toBe(false);
    expect(localStorage.getItem("fbep:accent")).toBeNull();
  });

  it("never touches the page in browser mode", async () => {
    await refreshAppearance();
    initNativeAppearance();
    expect(accent()).toBe("");
    expect(root.classList.contains("native")).toBe(false);
  });

  it("applies the cached platform layout, vibrancy and accent before the first render", () => {
    native.tauri = true;
    vi.spyOn(navigator, "userAgent", "get").mockReturnValue("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)");
    localStorage.setItem("fbep:accent", "#FFCC00");
    localStorage.setItem("fbep:vibrancy", "1");
    initNativeAppearance();
    expect(root.classList.contains("native")).toBe(true);
    expect(root.classList.contains("platform-macos")).toBe(true);
    expect(root.classList.contains("vibrancy")).toBe(true);
    expect(accent()).toBe("#FFCC00");
    expect(root.style.getPropertyValue("--accent-contrast")).toBe("#000000");
  });

  it("picks dark text for light accents and white for dark ones", () => {
    expect(accentContrast("#FFCC00")).toBe("#000000");
    expect(accentContrast("#007AFF")).toBe("#ffffff");
    expect(accentContrast("#8E8E93")).toBe("#ffffff");
    expect(accentContrast("#FF9500")).toBe("#000000");
    expect(accentContrast("#28CD41")).toBe("#000000");
    // The actual macOS orange and green controlAccentColor values.
    expect(accentContrast("#F7821B")).toBe("#000000");
    expect(accentContrast("#62BA46")).toBe("#000000");
    expect(accentContrast("#0A84FF")).toBe("#ffffff");
    expect(accentContrast("#953D96")).toBe("#ffffff");
  });
});
