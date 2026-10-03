import { useEffect } from "react";
import { useArea, type Area } from "../store/rcEditor";

export type ShortcutAction = "save" | "reload" | "format" | Area;
type Key = { key: string; metaKey?: boolean; ctrlKey?: boolean; shiftKey?: boolean; altKey?: boolean };
export const isMac = () => /Mac|iPhone|iPad/.test(navigator.platform);
export function shortcutAction(event: Key, mac: boolean): ShortcutAction | null {
  if (event.altKey || !(mac ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey)) return null;
  const key = event.key.toLowerCase();
  if (event.shiftKey) return key === "f" ? "format" : null;
  return ({ s: "save", r: "reload", "1": "firestore", "2": "remoteConfig" } as const)[key as "s"] ?? null;
}
export function shortcutLabel(action: ShortcutAction): string {
  const key = { save: "S", reload: "R", format: "F", firestore: "1", remoteConfig: "2" }[action];
  return `${isMac() ? "⌘" : "Ctrl+"}${action === "format" ? (isMac() ? "⇧" : "Shift+") : ""}${key}`;
}

type Actions = Partial<Record<ShortcutAction, () => void>>;
const registry = new Map<Area | "navigation", Actions>();
export function useShortcutActions(area: Area | "navigation", actions: Actions) {
  useEffect(() => {
    registry.set(area, actions);
    return () => { if (registry.get(area) === actions) registry.delete(area); };
  }, [area, actions]);
}
/** One listener; views register commands and the active area selects the recipient. */
export function useKeyboardShortcuts() {
  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      if (event.isComposing) return;
      const action = shortcutAction(event, isMac());
      if (!action) return;
      event.preventDefault();
      if (event.repeat || document.querySelector('[aria-modal="true"]')) return;
      const area = action === "firestore" || action === "remoteConfig" ? "navigation" : useArea.getState().area;
      registry.get(area)?.[action]?.();
    };
    window.addEventListener("keydown", listener, true);
    return () => window.removeEventListener("keydown", listener, true);
  }, []);
}
