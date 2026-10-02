import { useIsFetching, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useConnection } from "../../store/connection";
import { useCrudDialog } from "../../store/crudDialog";
import { useFirestoreNav } from "../../store/firestoreNav";
import { CrudDialogs } from "./crud/CrudDialogs";
import { DocumentView } from "./DocumentView";
import { CollectionList } from "./TreeNodes";

export function FirestoreBrowser() {
  const { t } = useTranslation();
  const projectId = useConnection((s) => s.connection?.projectId);
  const queryClient = useQueryClient();
  const fetching = useIsFetching({ queryKey: ["fs", projectId] }) > 0;
  const reset = useFirestoreNav((s) => s.reset);
  const openDialog = useCrudDialog((s) => s.open);
  const closeDialog = useCrudDialog((s) => s.close);

  useEffect(() => reset, [reset]);
  useEffect(() => closeDialog, [closeDialog]);

  return (
    <div className="grid min-h-[60vh] grid-cols-[22rem_1fr] gap-4">
      <aside data-testid="sidebar" className="overflow-auto rounded border border-slate-200 p-2 dark:border-slate-700">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="font-medium">{t("connection.collections")}</h3>
          <button
            type="button"
            data-testid="new-collection"
            onClick={() => openDialog({ kind: "create", parentDocPath: "", collectionPath: null })}
            className="ml-auto mr-2 rounded border border-slate-400 px-2 py-0.5 text-xs"
          >
            {t("crud.newCollection")}
          </button>
          <button
            type="button"
            data-testid="refresh"
            disabled={fetching}
            onClick={() => void queryClient.invalidateQueries({ queryKey: ["fs", projectId] })}
            className="rounded border border-slate-400 px-2 py-0.5 text-xs disabled:opacity-50"
          >
            {fetching ? t("firestore.refreshing") : t("firestore.refresh")}
          </button>
        </div>
        <CollectionList docPath="" />
      </aside>
      <section data-testid="document-panel" className="min-w-0">
        <DocumentView />
      </section>
      <CrudDialogs />
    </div>
  );
}
