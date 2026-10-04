import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

interface Props {
  titleId: string;
  testId: string;
  title: string;
  children: ReactNode;
  onClose(): void;
  busy?: boolean;
  role?: "dialog" | "alertdialog";
  /** Where focus goes on close when the opener is gone or was disabled (e.g. the Save button while saving). */
  returnFocus?(): HTMLElement | null;
  /** "wide" for editors that need room (Remote Config parameter and condition dialogs). */
  size?: "default" | "wide";
}

/** Open dialogs, bottom first. Only the topmost one handles Escape, Tab and focus containment. */
const stack: HTMLElement[] = [];
/** The control that opened each open dialog, so a dialog that replaces another can return focus there. */
const openers = new WeakMap<HTMLElement, HTMLElement | null>();

const FOCUSABLE =
  'summary, button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [contenteditable="true"], [tabindex]:not([tabindex="-1"])';

function focusableIn(panel: HTMLElement): HTMLElement[] {
  return Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE))
    .filter((element) => {
      if (element.closest("[hidden], [inert]")) return false;
      // Content of a collapsed <details> cannot take focus; its own <summary> can.
      const closed = element.closest("details:not([open])");
      return !closed || (element.tagName === "SUMMARY" && element.parentElement === closed);
    })
    // Tab order is document order; not every DOM returns a selector list in that order.
    .sort((a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));
}

/** Shared modal: keep focus inside it and restore the invoking control on dismissal. */
export function Modal({ titleId, testId, title, children, onClose, busy = false, role = "alertdialog", returnFocus, size = "default" }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  // Read while rendering, before React applies autoFocus to a field inside the dialog. When this dialog
  // replaces one that is still open (publish -> conflict), that dialog's opener is the fallback.
  const [{ opener, inherited }] = useState(() => {
    const active = document.activeElement;
    const own = active instanceof HTMLElement && active !== document.body ? active : null;
    const host = own ? stack.find((panel) => panel.contains(own)) : undefined;
    return { opener: own, inherited: host ? (openers.get(host) ?? null) : null };
  });
  const current = useRef({ onClose, busy, returnFocus });
  useEffect(() => { current.current = { onClose, busy, returnFocus }; }, [onClose, busy, returnFocus]);
  useEffect(() => {
    const panel = ref.current!;
    stack.push(panel);
    openers.set(panel, inherited ?? opener);
    const isTop = () => stack.at(-1) === panel;
    if (!panel.contains(document.activeElement)) (focusableIn(panel)[0] ?? panel).focus();
    const keydown = (event: KeyboardEvent) => {
      if (!isTop()) return;
      if (event.key === "Escape") {
        // CodeMirror panels that close on Escape get it first, keeping the dialog and its edits: the search
        // panel (from the text or the panel), and the lint panel and go-to-line dialog (from inside them).
        const target = event.target instanceof Element ? event.target : null;
        if (target?.closest(".cm-editor")?.querySelector(".cm-search") || target?.closest(".cm-panel-lint, .cm-dialog")) return;
        event.preventDefault(); event.stopImmediatePropagation();
        if (!current.current.busy) current.current.onClose();
      } else if (event.key === "Tab") {
        const items = focusableIn(panel);
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
      if (isTop() && !panel.contains(event.target as Node)) (focusableIn(panel)[0] ?? panel).focus();
    };
    document.addEventListener("keydown", keydown, true);
    document.addEventListener("focusin", contain);
    return () => {
      document.removeEventListener("keydown", keydown, true);
      document.removeEventListener("focusin", contain);
      stack.splice(stack.indexOf(panel), 1);
      const usable = [opener, inherited].find((el) => el?.isConnected && !(el as HTMLButtonElement).disabled) ?? null;
      (usable ?? current.current.returnFocus?.())?.focus();
    };
  }, [opener, inherited]);
  return createPortal(
    <div role="presentation" className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div ref={ref} tabIndex={-1} role={role} aria-modal="true" aria-labelledby={titleId}
        data-testid={testId} className={`max-h-[90vh] w-full ${size === "wide" ? "max-w-3xl" : "max-w-lg"} space-y-4 overflow-auto rounded-xl border border-line bg-surface p-5 text-fg shadow-xl`}>
        <h3 id={titleId} className="text-base font-semibold">{title}</h3>
        {children}
      </div>
    </div>, document.body,
  );
}
export const BTN = "btn px-3 py-1.5 text-sm";
export const BTN_DANGER = "btn border-danger bg-danger/10 px-3 py-1.5 text-sm text-danger";
