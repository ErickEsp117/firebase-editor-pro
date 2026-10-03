import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useConnection } from "../../../store/connection";
import { useCrudDialog } from "../../../store/crudDialog";
import { useFirestoreNav } from "../../../store/firestoreNav";
import { describeError, technicalText } from "../../errors/describeError";
import { TechnicalDetails } from "../../errors/TechnicalDetails";
import { useFirestoreApi } from "../useFirestore";
import { DialogError, type DialogFailure } from "./DialogError";
import { invalidateTree } from "./invalidate";
import { BTN, BTN_DANGER, Modal } from "./Modal";

export function DeleteCollectionDialog({ path }: { path: string }) {
  const { t } = useTranslation();
  const api = useFirestoreApi();
  const queryClient = useQueryClient();
  const projectId = useConnection((s) => s.connection?.projectId);
  const close = useCrudDialog((s) => s.close);
  const [busy, setBusy] = useState(false);
  const [deleted, setDeleted] = useState(0);
  const [error, setError] = useState<DialogFailure | null>(null);

  const count = useQuery({
    queryKey: ["crud-count", projectId, path],
    queryFn: () => api!.countDocs(path),
    enabled: !!api,
    gcTime: 0,
    retry: false,
  });

  const confirm = async () => {
    if (!api) return;
    setBusy(true);
    setError(null);
    try {
      await api.deleteCollection(path, setDeleted);
      const nav = useFirestoreNav.getState();
      if (nav.selectedDoc?.startsWith(`${path}/`)) nav.select(null);
      queryClient.removeQueries({ queryKey: ["fs", projectId, "doc"] });
      queryClient.removeQueries({ queryKey: ["fs", projectId, "docs", path] });
      await invalidateTree(queryClient, projectId);
      close();
    } catch (e) {
      setError({ key: "crud.deleteError", cause: e });
      setBusy(false);
      void invalidateTree(queryClient, projectId);
    }
  };

  return (
    <Modal titleId="delete-coll-title" testId="delete-collection-dialog" title={t("crud.deleteCollTitle")}>
      {count.isPending && <p data-testid="delete-coll-counting" className="text-sm">{t("crud.deleteCollCounting", { path })}</p>}
      {count.isError && (
        <div role="alert" data-testid="delete-coll-count-error" className="space-y-1 text-sm text-red-700 dark:text-red-300">
          <p>{t("crud.countError", { message: describeError(t, count.error) })}</p>
          {technicalText(count.error) && <TechnicalDetails text={technicalText(count.error)!} testId="delete-coll-count-error-technical" />}
        </div>
      )}
      {count.data !== undefined && (
        <>
          <p className="break-all text-sm" data-testid="delete-coll-body">
            {t("crud.deleteCollBody", { path, count: count.data })}
          </p>
          <p className="text-xs text-slate-500">{t("crud.deleteCollNested")}</p>
        </>
      )}
      {busy && (
        <p role="status" data-testid="delete-coll-progress" className="text-sm">
          {t("crud.deleteCollProgress", { deleted, count: count.data ?? 0 })}
        </p>
      )}
      {error && <DialogError failure={error} testId="delete-error" />}
      <div className="flex justify-end gap-2">
        <button type="button" data-testid="delete-cancel" className={BTN} disabled={busy} onClick={close}>
          {t("connection.cancel")}
        </button>
        <button type="button" data-testid="delete-confirm" className={BTN_DANGER} disabled={busy || count.data === undefined} onClick={() => void confirm()}>
          {busy ? t("crud.deleting") : t("crud.deleteCollConfirm")}
        </button>
      </div>
    </Modal>
  );
}
