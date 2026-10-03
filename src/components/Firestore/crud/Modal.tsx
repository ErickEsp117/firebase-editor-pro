import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";

interface Props {
  titleId: string;
  testId: string;
  title: string;
  children: ReactNode;
  onClose(): void;
  busy?: boolean;
  role?: "dialog" | "alertdialog";
}

/** Shared modal: keep focus inside it and restore the invoking control on dismissal. */
export function Modal({ titleId, testId, title, children, onClose, busy = false, role = "alertdialog" }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const current = useRef({ onClose, busy });
  useEffect(() => { current.current = { onClose, busy }; }, [onClose, busy]);
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const panel = ref.current!;
    const focusable = () => Array.from(panel.querySelectorAll<HTMLElement>(
      'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex]:not([tabindex="-1"])',
    )).filter((element) => !element.closest('[hidden], [inert]'));
    (focusable()[0] ?? panel).focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault(); event.stopImmediatePropagation();
        if (!current.current.busy) current.current.onClose();
      } else if (event.key === "Tab") {
        const items = focusable();
        const first = items[0] ?? panel;
        const last = items.at(-1) ?? panel;
        if (event.shiftKey && (document.activeElement === first || document.activeElement === panel)) {
          event.preventDefault(); last.focus();
        } else if (!event.shiftKey && (document.activeElement === last || document.activeElement === panel)) {
          event.preventDefault(); first.focus();
        }
      }
    };
    const contain = (event: FocusEvent) => {
      if (!panel.contains(event.target as Node)) (focusable()[0] ?? panel).focus();
    };
    document.addEventListener("keydown", keydown, true);
    document.addEventListener("focusin", contain);
    return () => {
      document.removeEventListener("keydown", keydown, true);
      document.removeEventListener("focusin", contain);
      if (previous?.isConnected) previous.focus();
    };
  }, []);
  return createPortal(
    <div role="presentation" className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div ref={ref} tabIndex={-1} role={role} aria-modal="true" aria-labelledby={titleId}
        data-testid={testId} className="max-h-[90vh] w-full max-w-lg space-y-4 overflow-auto rounded-xl border border-line bg-surface p-5 text-fg shadow-xl">
        <h3 id={titleId} className="text-base font-semibold">{title}</h3>
        {children}
      </div>
    </div>, document.body,
  );
}
export const BTN = "rounded-md border border-line bg-panel px-3 py-1.5 text-sm disabled:opacity-50";
export const BTN_DANGER = "rounded-md border border-danger bg-danger/10 px-3 py-1.5 text-sm text-danger disabled:opacity-50";
