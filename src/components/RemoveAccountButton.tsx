import { Trash2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { AccountMeta } from "../core/accounts";
import { useConnection } from "../store/connection";
import { hasUnsavedChanges } from "../store/unsavedChanges";
import { ConfirmDialog, UnsavedWarning } from "./ConfirmDialog";

/**
 * Per-account "Delete key" action with a confirmation dialog. Removing the active account while it has
 * unsaved drafts makes the dialog mention them; canceling never touches the index or the credential.
 */
export function RemoveAccountButton({ account, className }: { account: AccountMeta; className?: string }) {
  const { t } = useTranslation();
  const remove = useConnection((s) => s.remove);
  const activeId = useConnection((s) => s.activeId);
  const [confirming, setConfirming] = useState(false);
  const [dirty, setDirty] = useState(false);

  return (
    <>
      <button
        type="button"
        data-testid={`remove-account:${account.id}`}
        aria-label={t("accounts.removeFor", { project: account.projectId })}
        title={t("accounts.removeFor", { project: account.projectId })}
        onClick={() => {
          setDirty(account.id === activeId && hasUnsavedChanges());
          setConfirming(true);
        }}
        className={
          className ??
          "shrink-0 rounded px-2 py-1 text-xs text-danger hover:bg-danger/10 "
        }
      >
        <Trash2 size={14} aria-hidden="true" />
      </button>
      {confirming && (
        <ConfirmDialog
          testId="remove-account"
          danger
          title={t("accounts.removeTitle", { project: account.projectId })}
          confirmLabel={t("accounts.removeConfirm")}
          onCancel={() => setConfirming(false)}
          onConfirm={() => {
            setConfirming(false);
            void remove(account.id);
          }}
        >
          <p>{t("accounts.removeBody")}</p>
          {dirty && <UnsavedWarning />}
        </ConfirmDialog>
      )}
    </>
  );
}

/** Localized notice shown when an account was removed but its credential could not be deleted. */
export function OrphanedCredentialNotice() {
  const { t } = useTranslation();
  const orphaned = useConnection((s) => s.orphaned);
  const clearError = useConnection((s) => s.clearError);
  if (!orphaned) return null;
  return (
    <p
      role="status"
      data-testid="account-orphaned-notice"
      className="rounded border border-warning bg-warning/10 p-2 text-sm text-warning "
    >
      {t("accounts.orphaned")}{" "}
      <button type="button" className="underline" onClick={clearError}>
        {t("connection.dismiss")}
      </button>
    </p>
  );
}
