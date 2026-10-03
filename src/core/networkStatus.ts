/**
 * Whether Google answered the last request. A fetch that throws (no response at all) marks the network
 * unreachable even while the OS still reports a connection; any later response clears it.
 */
type Listener = () => void;

let reachable = true;
const listeners = new Set<Listener>();

export const isReachable = (): boolean => reachable;

export function reportReachable(next: boolean): void {
  if (next === reachable) return;
  reachable = next;
  for (const listener of [...listeners]) listener();
}

export function subscribeReachable(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
