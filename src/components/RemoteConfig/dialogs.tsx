import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { BTN, BTN_DANGER, Modal } from "../Firestore/crud/Modal";

export const MAX_DESCRIPTION = 1024;

interface PublishProps {
  busy: boolean;
  error: ReactNode;
  initial: string;
  onPublish(description: string): void;
  onCancel(): void;
}

export function PublishDialog({ busy, error, initial, onPublish, onCancel }: PublishProps) {
  const { t } = useTranslation();
  const [description, setDescription] = useState(initial);
  return (
    <Modal onClose={onCancel} busy={busy} titleId="rc-publish-title" testId="rc-publish-dialog" title={t("rc.publishTitle")}>
      <p className="text-sm">{t("rc.publishBody")}</p>
      <label className="block text-sm">
        {t("rc.descriptionLabel")}
        <textarea
          data-testid="rc-description"
          value={description}
          maxLength={MAX_DESCRIPTION}
          rows={3}
          onChange={(e) => setDescription(e.target.value)}
          className="mt-1 w-full rounded-md border border-line bg-surface p-2 text-sm"
        />
      </label>
      {error && (
        <div role="alert" data-testid="rc-publish-error" className="space-y-1 text-sm text-danger ">
          {error}
        </div>
      )}
      <div className="flex justify-end gap-2">
        <button type="button" data-testid="rc-publish-cancel" className={BTN} disabled={busy} onClick={onCancel}>
          {t("connection.cancel")}
        </button>
        <button
          type="button"
          data-testid="rc-publish-confirm"
          className="btn-primary"
          disabled={busy}
          onClick={() => onPublish(description.trim())}
        >
          {busy ? t("rc.publishing") : t("rc.publish")}
        </button>
      </div>
    </Modal>
  );
}

interface ConflictProps {
  busy: boolean;
  error: ReactNode;
  onReload(): void;
  onForce(): void;
  onCancel(): void;
}

export function RcConflictDialog({ busy, error, onReload, onForce, onCancel }: ConflictProps) {
  const { t } = useTranslation();
  const [forcing, setForcing] = useState(false);
  return (
    <Modal onClose={onCancel} busy={busy} titleId="rc-conflict-title" testId="rc-conflict-dialog" title={t("rc.conflictTitle")}>
      <p className="text-sm">{t("rc.conflictBody")}</p>
      {forcing && (
        <p role="alert" data-testid="rc-force-warning" className="text-sm text-danger ">
          {t("rc.forceWarning")}
        </p>
      )}
      {error && (
        <div role="alert" data-testid="rc-conflict-error" className="space-y-1 text-sm text-danger ">
          {error}
        </div>
      )}
      <div className="flex flex-wrap justify-end gap-2">
        <button type="button" data-testid="rc-conflict-cancel" className={BTN} disabled={busy} onClick={onCancel}>
          {t("connection.cancel")}
        </button>
        <button type="button" data-testid="rc-conflict-reload" className={BTN} disabled={busy} onClick={onReload}>
          {t("rc.reloadTemplate")}
        </button>
        {forcing ? (
          <button type="button" data-testid="rc-conflict-force-confirm" className={BTN_DANGER} disabled={busy} onClick={onForce}>
            {busy ? t("rc.publishing") : t("rc.forceConfirm")}
          </button>
        ) : (
          <button
            type="button"
            data-testid="rc-conflict-force"
            className="btn border-danger px-3 py-1 text-sm text-danger"
            disabled={busy}
            onClick={() => setForcing(true)}
          >
            {t("rc.force")}
          </button>
        )}
      </div>
    </Modal>
  );
}

interface ConfirmProps {
  testId: string;
  title: string;
  children: ReactNode;
  confirmLabel: string;
  busy: boolean;
  danger?: boolean;
  onConfirm(): void;
  onCancel(): void;
}

export function RcConfirmDialog({ testId, title, children, confirmLabel, busy, danger, onConfirm, onCancel }: ConfirmProps) {
  const { t } = useTranslation();
  return (
    <Modal onClose={onCancel} busy={busy} titleId={`${testId}-title`} testId={testId} title={title}>
      {children}
      <div className="flex justify-end gap-2">
        <button type="button" data-testid={`${testId}-cancel`} className={BTN} disabled={busy} onClick={onCancel}>
          {t("connection.cancel")}
        </button>
        <button
          type="button"
          data-testid={`${testId}-confirm`}
          className={danger ? BTN_DANGER : "btn-primary"}
          disabled={busy}
          onClick={onConfirm}
        >
          {confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
