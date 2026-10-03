import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useConnection } from "../store/connection";
import { hasUnsavedChanges } from "../store/unsavedChanges";
import { ConfirmDialog } from "./ConfirmDialog";
import { ErrorBanner } from "./ErrorBanner";
import { OrphanedCredentialNotice, RemoveAccountButton } from "./RemoveAccountButton";

/**
 * Account selector for the connected state: lists the saved accounts, marks the active one, switches in
 * one click and offers "Add key", reusing the same verified import flow as the welcome screen.
 * Switching with unsaved drafts (document or Remote Config) asks for confirmation first.
 */
export function AccountSwitcher({ sidebar = false }: { sidebar?: boolean }) {
  const { t } = useTranslation();
  const { phase, accounts, activeId, error, duplicateOf, switchTo, addFromPicker, clearError } = useConnection();
  const [open, setOpen] = useState(false);
  const [pendingAdd, setPendingAdd] = useState(false);
  const [pendingSwitch, setPendingSwitch] = useState<string | null>(null);
  const busy = phase === "verifying";
  const active = accounts.find((a) => a.id === activeId);
  const duplicate = duplicateOf ? accounts.find((a) => a.id === duplicateOf) : undefined;

  const requestSwitch = (id: string) => {
    setOpen(false);
    if (hasUnsavedChanges()) setPendingSwitch(id);
    else void switchTo(id);
  };

  return (
    <div data-testid="account-switcher" className="relative text-sm">
      <button
        type="button"
        data-testid="account-switcher-toggle"
        hidden={sidebar}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 rounded border border-line px-2 py-1 hover:bg-hover "
      >
        <span className="font-medium">{active ? active.projectId : t("accounts.title")}</span>
        <span aria-hidden="true">{open ? "▴" : "▾"}</span>
      </button>
      {(open || sidebar) && (
        <div
          role="menu"
          aria-label={t("accounts.title")}
          className={sidebar ? "mt-2" : "absolute left-0 z-20 mt-1 w-80 rounded border border-line bg-surface p-2 shadow-lg"}
        >
          <ul className="flex flex-col gap-1">
            {accounts.map((a) => {
              const isActive = a.id === activeId;
              return (
                <li key={a.id} className="flex items-stretch gap-1">
                  <button
                    type="button"
                    role="menuitem"
                    data-testid={`account-item:${a.id}`}
                    aria-current={isActive ? "true" : undefined}
                    aria-label={isActive ? undefined : t("accounts.switchTo", { project: a.projectId })}
                    disabled={busy || isActive}
                    onClick={() => requestSwitch(a.id)}
                    className={`flex min-w-0 w-full items-center justify-between gap-2 rounded-md px-2 py-2 text-left ${isActive ? "bg-selection" : "hover:bg-hover"}`}
                  >
                    <span aria-hidden="true" className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-accent text-on-accent">{a.projectId.slice(0, 1).toUpperCase()}</span>
                    <span className="min-w-0 flex-1" title={`${a.projectId} · ${a.clientEmail}`}>
                      <span className="block truncate font-medium">{a.projectId}</span>
                      <span className="block truncate text-xs text-fg-muted ">{a.clientEmail}</span>
                    </span>
                    {isActive && (
                      <span
                        data-testid="account-active-badge"
                        className="sr-only"
                      >
                        {t("accounts.active")}
                      </span>
                    )}
                  </button>
                  <RemoveAccountButton account={a} />
                </li>
              );
            })}
          </ul>
          <button
            type="button"
            data-testid="add-account"
            disabled={busy}
            onClick={() => hasUnsavedChanges() ? setPendingAdd(true) : void addFromPicker()}
            className="mt-2 w-full rounded border border-dashed border-line px-2 py-1.5 text-center hover:bg-hover disabled:opacity-50 "
          >
            {busy ? t("connection.importing") : t("accounts.add")}
          </button>
        </div>
      )}
      {pendingAdd && (
        <ConfirmDialog testId="add-account" danger title={t("accounts.unsavedTitle")}
          confirmLabel={t("accounts.unsavedConfirm")} onCancel={() => setPendingAdd(false)}
          onConfirm={() => { setPendingAdd(false); void addFromPicker(); }}>
          <p>{t("accounts.unsavedBody")}</p>
        </ConfirmDialog>
      )}
      {pendingSwitch && (
        <ConfirmDialog
          testId="switch-account"
          danger
          title={t("accounts.unsavedTitle")}
          confirmLabel={t("accounts.unsavedConfirm")}
          onCancel={() => setPendingSwitch(null)}
          onConfirm={() => {
            const id = pendingSwitch;
            setPendingSwitch(null);
            void switchTo(id);
          }}
        >
          <p>{t("accounts.unsavedBody")}</p>
        </ConfirmDialog>
      )}
      <OrphanedCredentialNotice />
      {duplicate && (
        <p
          role="status"
          data-testid="account-duplicate-notice"
          className="absolute right-0 z-20 mt-1 w-80 rounded border border-warning bg-warning/10 p-2 text-warning shadow-lg "
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
