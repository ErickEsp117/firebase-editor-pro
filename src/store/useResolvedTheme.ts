import { useSyncExternalStore } from "react";
import { useSettings } from "./settings";

function subscribe(onChange: () => void) {
  const media = window.matchMedia?.("(prefers-color-scheme: dark)");
  media?.addEventListener("change", onChange);
  return () => media?.removeEventListener("change", onChange);
}
const snapshot = () => window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;

/** One live system-theme source shared by the shell and both CodeMirror editors. */
export function useResolvedTheme(): "dark" | "light" {
  const theme = useSettings((s) => s.theme);
  const systemDark = useSyncExternalStore(subscribe, snapshot, () => false);
  return theme === "system" ? (systemDark ? "dark" : "light") : theme;
}
