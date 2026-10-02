import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useConnection } from "../../../store/connection";
import { useCrudDialog } from "../../../store/crudDialog";
import { useFirestoreNav } from "../../../store/firestoreNav";
import { errorMessage } from "../TreeNodes";
import { useFirestoreApi } from "../useFirestore";
import { invalidateTree } from "./invalidate";
import { BTN, BTN_DANGER, Modal } from "./Modal";

export function DeleteDocDialog({ path }: { path: string }) {
  const { t } = useTranslation();
  const api = useFirestoreApi();
  const queryClient = useQueryClient();
  const projectId = useConnection((s) => s.connection?.projectId);
  const close = useCrudDialog((s) => s.close);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const confirm = async () => {
    if (!api) return;
    setBusy(true);
    setError(null);
    try {
      await api.deleteDoc(path);
      if (useFirestoreNav.getState().selectedDoc === path) useFirestoreNav.getState().select(null);
      queryClient.removeQueries({ queryKey: ["fs", projectId, "doc", path] });
      await invalidateTree(queryClient, projectId);
      close();
    } catch (e) {
      setError(t("crud.deleteError", { message: errorMessage(e) }));
      setBusy(false);
    }
  };

  return (
    <Modal titleId="delete-doc-title" testId="delete-doc-dialog" title={t("crud.deleteDocTitle")}>
      <p className="break-all text-sm" data-testid="delete-doc-body">
        {t("crud.deleteDocBody", { path })}
      </p>
      {error && (
        <p role="alert" data-testid="delete-error" className="text-sm text-red-700 dark:text-red-300">
          {error}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <button type="button" data-testid="delete-cancel" className={BTN} disabled={busy} onClick={close}>
          {t("connection.cancel")}
        </button>
        <button type="button" data-testid="delete-confirm" className={BTN_DANGER} disabled={busy} onClick={() => void confirm()}>
          {busy ? t("crud.deleting") : t("crud.deleteDocConfirm")}
        </button>
      </div>
    </Modal>
  );
}
