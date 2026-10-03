import { invoke, isTauri } from "@tauri-apps/api/core";
import type { ThemeMode } from "../store/settings";

export interface NativeAppearance { platform: string; vibrancy: boolean; accent: string | null }
const CACHE = "fbep:accent";
const VIBRANCY_CACHE = "fbep:vibrancy";
export const validAccent = (value: unknown): value is string => typeof value === "string" && /^#[\da-f]{6}$/i.test(value);

/** Text color for a filled accent surface: dark text on light accents (e.g. yellow), white otherwise. */
export function accentContrast(hex: string): "#000000" | "#ffffff" {
  const channel = (i: number) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const luminance = 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
  // macOS draws white text on its saturated accents (blue, purple, pink, red, graphite); only the light
  // ones (yellow, orange, green) would leave white text below 2.5:1, so they get dark text.
  return luminance > 0.4 ? "#000000" : "#ffffff";
}

/** Writes the system accent (and its readable text color) as tokens, or falls back to the CSS defaults. */
export function applyAccent(accent: string | null, root: HTMLElement = document.documentElement): void {
  if (validAccent(accent)) {
    root.style.setProperty("--accent", accent);
    root.style.setProperty("--accent-contrast", accentContrast(accent));
  } else {
    root.style.removeProperty("--accent");
    root.style.removeProperty("--accent-contrast");
  }
}

function setPlatformClass(root: HTMLElement, platform: string): void {
  for (const name of [...root.classList]) if (name.startsWith("platform-") && name !== `platform-${platform}`) root.classList.remove(name);
  root.classList.add(`platform-${platform}`);
}

export async function getNativeAppearance(): Promise<NativeAppearance> {
  if (!isTauri()) return { platform: "browser", vibrancy: false, accent: null };
  return invoke<NativeAppearance>("native_appearance");
}

export async function refreshAppearance(): Promise<void> {
  if (!isTauri()) return;
  try {
    const appearance = await getNativeAppearance();
    const root = document.documentElement;
    root.classList.add("native");
    setPlatformClass(root, appearance.platform);
    root.classList.toggle("vibrancy", appearance.vibrancy);
    applyAccent(appearance.accent, root);
    try {
      localStorage.setItem(VIBRANCY_CACHE, appearance.vibrancy ? "1" : "0");
      if (validAccent(appearance.accent)) localStorage.setItem(CACHE, appearance.accent);
      else localStorage.removeItem(CACHE);
    } catch { /* Optional cache. */ }
  } catch { /* Solid surfaces and CSS accent remain usable without native appearance. */ }
}

/**
 * Runs before the first render. The platform class (traffic-light reservation), the last known vibrancy
 * and accent are applied synchronously so the first frame already has the native layout; the IPC result
 * then corrects them.
 */
export function initNativeAppearance(): void {
  if (!isTauri()) return;
  const root = document.documentElement;
  root.classList.add("native");
  const ua = navigator.userAgent;
  if (/Mac/i.test(ua)) setPlatformClass(root, "macos");
  else if (/Win/i.test(ua)) setPlatformClass(root, "windows");
  try {
    if (localStorage.getItem(VIBRANCY_CACHE) === "1") root.classList.add("vibrancy");
    const cached = localStorage.getItem(CACHE);
    if (validAccent(cached)) applyAccent(cached, root);
  } catch { /* Optional cache. */ }
  void refreshAppearance();
  window.addEventListener("focus", () => void refreshAppearance());
}

export async function syncWindowTheme(theme: ThemeMode): Promise<void> {
  if (!isTauri()) return;
  try {
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    await getCurrentWindow().setTheme(theme === "system" ? null : theme);
    await refreshAppearance();
  } catch { /* Browser fallback also works if a native capability is unavailable. */ }
}
