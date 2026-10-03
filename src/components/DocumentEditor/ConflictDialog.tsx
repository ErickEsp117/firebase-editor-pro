import { Modal } from "../Firestore/crud/Modal";
import { useTranslation } from "react-i18next";

interface Props {
  forcing: boolean;
  onReload(): void;
  onAskForce(): void;
  onConfirmForce(): void;
  onCancel(): void;
}

export function ConflictDialog({ forcing, onReload, onAskForce, onConfirmForce, onCancel }: Props) {
  const { t } = useTranslation();
  return (
    <Modal titleId="conflict-title" testId="conflict-dialog" title={t("editor.conflictTitle")} onClose={onCancel}>
        <p className="text-sm">{t("editor.conflictBody")}</p>
        {forcing && (
          <p role="alert" data-testid="force-warning" className="text-sm text-danger ">
            {t("editor.forceWarning")}
          </p>
        )}
        <div className="flex flex-wrap justify-end gap-2">
          <button type="button" data-testid="conflict-cancel" onClick={onCancel} className="rounded border border-line px-3 py-1 text-sm ">
            {t("connection.cancel")}
          </button>
          <button type="button" data-testid="conflict-reload" onClick={onReload} className="rounded border border-line px-3 py-1 text-sm ">
            {t("editor.reload")}
          </button>
          {forcing ? (
            <button type="button" data-testid="conflict-force-confirm" onClick={onConfirmForce} className="rounded bg-danger/10 px-3 py-1 text-sm text-danger">
              {t("editor.forceConfirm")}
            </button>
          ) : (
            <button type="button" data-testid="conflict-force" onClick={onAskForce} className="rounded border border-danger px-3 py-1 text-sm text-danger ">
              {t("editor.force")}
            </button>
          )}
        </div>
    </Modal>
  );
}
