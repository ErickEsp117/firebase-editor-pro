// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useResolvedTheme } from "../useResolvedTheme";
import { clampSidebarWidth, useSettings } from "../settings";
import { validAccent, getNativeAppearance } from "../../platform/appearance";
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
it("updates all subscribers when the system changes and respects a manual override", () => {
  let dark = false;
  const listeners = new Set<() => void>();
  vi.stubGlobal("matchMedia", () => ({ matches: dark, addEventListener: (_: string, fn: () => void) => listeners.add(fn), removeEventListener: (_: string, fn: () => void) => listeners.delete(fn) }));
  useSettings.setState({ theme: "system" });
  function View() { return <span>{useResolvedTheme()}</span>; }
  render(<><View /><View /></>);
  expect(screen.getAllByText("light")).toHaveLength(2);
  act(() => { dark = true; listeners.forEach((fn) => fn()); });
  expect(screen.getAllByText("dark")).toHaveLength(2);
  act(() => { useSettings.getState().setTheme("light"); });
  expect(screen.getAllByText("light")).toHaveLength(2);
  cleanup(); expect(listeners.size).toBe(0);
});
it("uses safe browser appearance and validates cached accent values", async () => {
  expect(await getNativeAppearance()).toEqual({ platform: "browser", vibrancy: false, accent: null });
  expect(validAccent("#12AbFF")).toBe(true);
  expect(validAccent("red; background:url(x)")).toBe(false);
  expect(validAccent(null)).toBe(false);
});
it("bounds sidebar width and persists a valid size", () => {
  expect(clampSidebarWidth(-1)).toBe(220);
  expect(clampSidebarWidth(1000)).toBe(420);
  expect(clampSidebarWidth(NaN)).toBe(264);
  useSettings.getState().setSidebarWidth(320);
  expect(JSON.parse(localStorage.getItem("fbep:settings")!).sidebarWidth).toBe(320);
});
