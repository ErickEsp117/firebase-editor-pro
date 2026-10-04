import { create } from "zustand";

export type Language = "es" | "en";
export type ThemeMode = "light" | "dark" | "system";
export type RcView = "json" | "table";

const KEY = "fbep:settings";

interface Persisted {
  language?: Language;
  theme?: ThemeMode;
  sidebarWidth?: number;
  rcView?: RcView;
}

function read(): Persisted {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Persisted) : {};
  } catch {
    return {};
  }
}

function write(p: Persisted): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    // Storage unavailable: settings simply do not persist.
  }
}

export function detectLanguage(): Language {
  const nav = typeof navigator !== "undefined" ? navigator.language : "";
  if (nav && !nav.toLowerCase().startsWith("es")) return "en";
  return "es";
}

interface SettingsState {
  language: Language;
  theme: ThemeMode;
  sidebarWidth: number;
  /** Remote Config editor view; JSON unless the user picked the table. */
  rcView: RcView;
  setRcView(view: RcView): void;
  setSidebarWidth(width: number): void;
  setLanguage(l: Language): void;
  setTheme(t: ThemeMode): void;
}

/** Sidebar width limits in CSS pixels; the default leaves room for project ids and emails. */
export const SIDEBAR_MIN = 230;
export const SIDEBAR_MAX = 440;
export const SIDEBAR_DEFAULT = 280;
export const clampSidebarWidth = (width: number) =>
  Number.isFinite(width) ? Math.round(Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, width))) : SIDEBAR_DEFAULT;

export const useSettings = create<SettingsState>((set, get) => {
  const saved = read();
  return {
    language: saved.language === "es" || saved.language === "en" ? saved.language : detectLanguage(),
    theme: saved.theme === "light" || saved.theme === "dark" || saved.theme === "system" ? saved.theme : "system",
    sidebarWidth: clampSidebarWidth(saved.sidebarWidth ?? SIDEBAR_DEFAULT),
    rcView: saved.rcView === "table" ? "table" : "json",
    setRcView: (rcView) => {
      set({ rcView });
      write({ ...read(), rcView });
    },
    setSidebarWidth: (width) => {
      const sidebarWidth = clampSidebarWidth(width);
      set({ sidebarWidth });
      write({ ...read(), sidebarWidth });
    },
    setLanguage: (language) => {
      set({ language });
      write({ ...read(), language, theme: get().theme });
    },
    setTheme: (theme) => {
      set({ theme });
      write({ ...read(), theme, language: get().language });
    },
  };
});
