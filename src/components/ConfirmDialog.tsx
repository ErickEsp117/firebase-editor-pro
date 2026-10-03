import { Modal } from "./Firestore/crud/Modal";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

interface ConfirmDialogProps {
  /** Test ids are derived: `${testId}-dialog`, `${testId}-cancel`, `${testId}-confirm`. */
  testId: string;
  title: string;
  children: ReactNode;
  confirmLabel: string;
  danger?: boolean;
  onCancel(): void;
  onConfirm(): void;
}

/** Shared localized confirmation dialog for destructive or draft-discarding account actions. */
export function ConfirmDialog({ testId, title, children, confirmLabel, danger, onCancel, onConfirm }: ConfirmDialogProps) {
  const { t } = useTranslation();
  return (
    <Modal titleId={`${testId}-title`} testId={`${testId}-dialog`} title={title} onClose={onCancel} role="dialog">
        <div className="space-y-2 text-sm">{children}</div>
        <div className="flex justify-end gap-2">
          <button type="button" data-testid={`${testId}-cancel`} className="rounded border border-line px-3 py-1 text-sm" onClick={onCancel}>
            {t("connection.cancel")}
          </button>
          <button
            type="button"
            data-testid={`${testId}-confirm`}
            className={`rounded px-3 py-1 text-sm ${danger ? "bg-danger/10 text-danger" : "bg-accent text-on-accent"}`}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
    </Modal>
  );
}

/** Highlighted line shown inside a confirmation dialog when unsaved drafts would be discarded. */
export function UnsavedWarning() {
  const { t } = useTranslation();
  return (
    <p data-testid="unsaved-warning" className="text-warning ">
      {t("accounts.unsavedWarning")}
    </p>
  );
}
