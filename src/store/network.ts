import { useSyncExternalStore } from "react";
import { isReachable, subscribeReachable } from "../core";

/** OS connectivity as last announced by the online/offline events (navigator.onLine at startup). */
let osOnline = typeof navigator === "undefined" || navigator.onLine !== false;
const osListeners = new Set<() => void>();
if (typeof window !== "undefined") {
  const update = (online: boolean) => () => {
    osOnline = online;
    for (const listener of [...osListeners]) listener();
  };
  window.addEventListener("online", update(true));
  window.addEventListener("offline", update(false));
}

function subscribeOs(onChange: () => void) {
  osListeners.add(onChange);
  return () => {
    osListeners.delete(onChange);
  };
}

/** Offline when the OS reports no network or the last request to Google got no response. */
export function useOffline(): boolean {
  const online = useSyncExternalStore(subscribeOs, () => osOnline, () => true);
  const reachable = useSyncExternalStore(subscribeReachable, isReachable, () => true);
  return !online || !reachable;
}
