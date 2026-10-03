import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useConnection } from "../store/connection";
import { ErrorBanner } from "./ErrorBanner";

/**
 * Account selector for the connected state: lists the saved accounts, marks the active one, switches in
 * one click and offers "Add key", reusing the same verified import flow as the welcome screen.
 */
export function AccountSwitcher() {
  const { t } = useTranslation();
  const { phase, accounts, activeId, error, duplicateOf, switchTo, addFromPicker, clearError } = useConnection();
  const [open, setOpen] = useState(false);
  const busy = phase === "verifying";
  const active = accounts.find((a) => a.id === activeId);
  const duplicate = duplicateOf ? accounts.find((a) => a.id === duplicateOf) : undefined;

  return (
    <div data-testid="account-switcher" className="relative text-sm">
      <button
        type="button"
        data-testid="account-switcher-toggle"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 rounded border border-slate-300 px-2 py-1 hover:bg-slate-100 dark:border-slate-600 dark:hover:bg-slate-800"
      >
        <span className="font-medium">{active ? active.projectId : t("accounts.title")}</span>
        <span aria-hidden="true">{open ? "▴" : "▾"}</span>
      </button>
      {open && (
        <div
          role="menu"
          aria-label={t("accounts.title")}
          className="absolute right-0 z-20 mt-1 w-80 rounded border border-slate-200 bg-white p-2 shadow-lg dark:border-slate-700 dark:bg-slate-800"
        >
          <ul className="flex flex-col gap-1">
            {accounts.map((a) => {
              const isActive = a.id === activeId;
              return (
                <li key={a.id}>
                  <button
                    type="button"
                    role="menuitem"
                    data-testid={`account-item:${a.id}`}
                    aria-current={isActive ? "true" : undefined}
                    aria-label={isActive ? undefined : t("accounts.switchTo", { project: a.projectId })}
                    disabled={busy || isActive}
                    onClick={() => {
                      setOpen(false);
                      void switchTo(a.id);
                    }}
                    className="flex w-full items-center justify-between gap-2 rounded px-2 py-1.5 text-left hover:bg-slate-100 disabled:opacity-70 dark:hover:bg-slate-700"
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{a.projectId}</span>
                      <span className="block truncate text-xs text-slate-500 dark:text-slate-400">{a.clientEmail}</span>
                    </span>
                    {isActive && (
                      <span
                        data-testid="account-active-badge"
                        className="shrink-0 rounded bg-blue-100 px-1.5 py-0.5 text-xs font-medium text-blue-800 dark:bg-blue-900 dark:text-blue-200"
                      >
                        {t("accounts.active")}
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
          <button
            type="button"
            data-testid="add-account"
            disabled={busy}
            onClick={() => void addFromPicker()}
            className="mt-2 w-full rounded border border-dashed border-slate-400 px-2 py-1.5 text-center hover:bg-slate-100 disabled:opacity-50 dark:hover:bg-slate-700"
          >
            {busy ? t("connection.importing") : t("accounts.add")}
          </button>
        </div>
      )}
      {duplicate && (
        <p
          role="status"
          data-testid="account-duplicate-notice"
          className="absolute right-0 z-20 mt-1 w-80 rounded border border-amber-300 bg-amber-50 p-2 text-amber-900 shadow-lg dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100"
        >
          {t("accounts.duplicate", { project: duplicate.projectId })}{" "}
          <button type="button" className="underline" onClick={clearError}>
            {t("connection.dismiss")}
          </button>
        </p>
      )}
      {error && (
        <div className="absolute right-0 z-20 mt-1 w-96">
          <ErrorBanner error={error} onDismiss={clearError} />
        </div>
      )}
    </div>
  );
}
