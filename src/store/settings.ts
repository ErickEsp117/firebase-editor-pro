import { create } from "zustand";

export type Language = "es" | "en";
export type ThemeMode = "light" | "dark" | "system";

const KEY = "fbep:settings";

interface Persisted {
  language?: Language;
  theme?: ThemeMode;
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
  setLanguage(l: Language): void;
  setTheme(t: ThemeMode): void;
}

export const useSettings = create<SettingsState>((set, get) => {
  const saved = read();
  return {
    language: saved.language === "es" || saved.language === "en" ? saved.language : detectLanguage(),
    theme: saved.theme === "light" || saved.theme === "dark" || saved.theme === "system" ? saved.theme : "system",
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
