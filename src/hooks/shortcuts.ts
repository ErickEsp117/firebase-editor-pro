import { useEffect, useRef } from "react";
import { useConnection } from "../store/connection";
import { useArea, type Area } from "../store/rcEditor";

export type ShortcutAction = "save" | "reload" | "format" | Area;
type Key = { key: string; code?: string; metaKey?: boolean; ctrlKey?: boolean; shiftKey?: boolean; altKey?: boolean };
export const isMac = () => /Mac|iPhone|iPad/.test(navigator.platform);
export function shortcutAction(event: Key, mac: boolean): ShortcutAction | null {
  if (event.altKey || !(mac ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey)) return null;
  const key = event.key.toLowerCase();
  if (event.shiftKey) return key === "f" ? "format" : null;
  // Layouts such as AZERTY type "&" and "é" on the digit row; the physical key still selects the area.
  const digit = /^Digit([12])$/.exec(event.code ?? "")?.[1];
  const name = digit && !/^\d$/.test(key) ? digit : key;
  return ({ s: "save", r: "reload", "1": "firestore", "2": "remoteConfig" } as const)[name as "s"] ?? null;
}
export function shortcutLabel(action: ShortcutAction, mac = isMac()): string {
  const key = { save: "S", reload: "R", format: "F", firestore: "1", remoteConfig: "2" }[action];
  return `${mac ? "⌘" : "Ctrl+"}${action === "format" ? (mac ? "⇧" : "Shift+") : ""}${key}`;
}
/** Tooltip text: the localized label followed by the platform shortcut, e.g. "Guardar (⌘S)". */
export const withShortcut = (label: string, action: ShortcutAction) => `${label} (${shortcutLabel(action)})`;

type Actions = Partial<Record<ShortcutAction, () => void>>;
type Scope = Area | "navigation";
const registry = new Map<Scope, Set<{ current: Actions }>>();

/**
 * Registers commands for a scope. Several views may register in the same scope (the Firestore tree and the
 * open document both reload); every registered handler for the action runs, always with its latest closure.
 */
export function useShortcutActions(scope: Scope, actions: Actions) {
  const ref = useRef(actions);
  useEffect(() => {
    ref.current = actions;
  });
  useEffect(() => {
    const entries = registry.get(scope) ?? new Set();
    registry.set(scope, entries);
    entries.add(ref);
    return () => {
      entries.delete(ref);
    };
  }, [scope]);
}

export function runShortcut(action: ShortcutAction): void {
  const scope: Scope = action === "firestore" || action === "remoteConfig" ? "navigation" : useArea.getState().area;
  for (const entry of [...(registry.get(scope) ?? [])]) entry.current[action]?.();
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
      // The connected view is inert while an account action runs; its commands must stay inert too.
      if (useConnection.getState().phase === "verifying") return;
      const focused = document.activeElement;
      if (focused instanceof HTMLElement && focused.dataset.commitInput !== undefined) {
        // A table cell commits on blur. Commit it first so a save includes it and a reload sees it as a
        // change, then run the command once React has applied the commit.
        focused.blur();
        setTimeout(() => {
          runShortcut(action);
          if (action !== "firestore" && action !== "remoteConfig" && focused.isConnected) focused.focus();
        }, 0);
        return;
      }
      runShortcut(action);
    };
    window.addEventListener("keydown", listener, true);
    return () => window.removeEventListener("keydown", listener, true);
  }, []);
}
