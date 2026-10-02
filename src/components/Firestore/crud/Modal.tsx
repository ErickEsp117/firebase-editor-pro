import type { ReactNode } from "react";

interface Props {
  titleId: string;
  testId: string;
  title: string;
  children: ReactNode;
}

export function Modal({ titleId, testId, title, children }: Props) {
  return (
    <div role="presentation" className="fixed inset-0 z-20 flex items-center justify-center bg-black/40">
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        data-testid={testId}
        className="w-full max-w-lg space-y-3 rounded-lg bg-white p-5 shadow-xl dark:bg-slate-800"
      >
        <h3 id={titleId} className="text-lg font-semibold">
          {title}
        </h3>
        {children}
      </div>
    </div>
  );
}

export const BTN = "rounded border border-slate-300 px-3 py-1 text-sm disabled:opacity-50 dark:border-slate-600";
export const BTN_DANGER = "rounded bg-red-700 px-3 py-1 text-sm text-white disabled:opacity-50";
