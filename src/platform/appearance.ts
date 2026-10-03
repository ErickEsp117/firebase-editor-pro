import { invoke, isTauri } from "@tauri-apps/api/core";
import type { ThemeMode } from "../store/settings";

export interface NativeAppearance { platform: string; vibrancy: boolean; accent: string | null }
const CACHE = "fbep:accent";
export const validAccent = (value: unknown): value is string => typeof value === "string" && /^#[\da-f]{6}$/i.test(value);

export async function getNativeAppearance(): Promise<NativeAppearance> {
  if (!isTauri()) return { platform: "browser", vibrancy: false, accent: null };
  return invoke<NativeAppearance>("native_appearance");
}

export async function refreshAppearance(): Promise<void> {
  if (!isTauri()) return;
  try {
    const appearance = await getNativeAppearance();
    const root = document.documentElement;
    root.classList.add("native", `platform-${appearance.platform}`);
    root.classList.toggle("vibrancy", appearance.vibrancy);
    if (validAccent(appearance.accent)) {
      root.style.setProperty("--accent", appearance.accent);
      try { localStorage.setItem(CACHE, appearance.accent); } catch { /* Optional cache. */ }
    } else {
      root.style.removeProperty("--accent");
      try { localStorage.removeItem(CACHE); } catch { /* Optional cache. */ }
    }
  } catch { /* Solid surfaces and CSS accent remain usable without native appearance. */ }
}

export function initNativeAppearance(): void {
  if (!isTauri()) return;
  document.documentElement.classList.add("native");
  try {
    const cached = localStorage.getItem(CACHE);
    if (validAccent(cached)) document.documentElement.style.setProperty("--accent", cached);
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
