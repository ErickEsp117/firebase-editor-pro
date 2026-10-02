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
    <div role="presentation" className="fixed inset-0 z-20 flex items-center justify-center bg-black/40">
      <div role="alertdialog" aria-modal="true" aria-labelledby="conflict-title" data-testid="conflict-dialog" className="w-full max-w-md space-y-3 rounded-lg bg-white p-5 shadow-xl dark:bg-slate-800">
        <h3 id="conflict-title" className="text-lg font-semibold">
          {t("editor.conflictTitle")}
        </h3>
        <p className="text-sm">{t("editor.conflictBody")}</p>
        {forcing && (
          <p role="alert" data-testid="force-warning" className="text-sm text-red-700 dark:text-red-300">
            {t("editor.forceWarning")}
          </p>
        )}
        <div className="flex flex-wrap justify-end gap-2">
          <button type="button" data-testid="conflict-cancel" onClick={onCancel} className="rounded border border-slate-300 px-3 py-1 text-sm dark:border-slate-600">
            {t("connection.cancel")}
          </button>
          <button type="button" data-testid="conflict-reload" onClick={onReload} className="rounded border border-slate-300 px-3 py-1 text-sm dark:border-slate-600">
            {t("editor.reload")}
          </button>
          {forcing ? (
            <button type="button" data-testid="conflict-force-confirm" onClick={onConfirmForce} className="rounded bg-red-700 px-3 py-1 text-sm text-white">
              {t("editor.forceConfirm")}
            </button>
          ) : (
            <button type="button" data-testid="conflict-force" onClick={onAskForce} className="rounded border border-red-600 px-3 py-1 text-sm text-red-700 dark:text-red-300">
              {t("editor.force")}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
