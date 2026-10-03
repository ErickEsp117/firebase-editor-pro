import { FolderPlus, Upload, RotateCw } from "lucide-react";
import { useIsFetching, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useConnection } from "../../store/connection";
import { useCrudDialog } from "../../store/crudDialog";
import { useFirestoreNav } from "../../store/firestoreNav";
import { CrudDialogs } from "./crud/CrudDialogs";
import { DocumentView } from "./DocumentView";
import { CollectionList } from "./TreeNodes";

export function FirestoreBrowser({ showSidebar = true }: { showSidebar?: boolean }) {
  const reset = useFirestoreNav((s) => s.reset);
  const closeDialog = useCrudDialog((s) => s.close);

  useEffect(() => reset, [reset]);
  useEffect(() => closeDialog, [closeDialog]);

  return (
    <div className={showSidebar ? "grid min-h-[60vh] grid-cols-[22rem_1fr] gap-4" : "min-w-0"}>
      {showSidebar && <FirestoreSidebar />}
      <section data-testid="document-panel" className="min-w-0">
        <DocumentView />
      </section>
      <CrudDialogs />
    </div>
  );
}

export function FirestoreSidebar() {
  const { t } = useTranslation();
  const projectId = useConnection((s) => s.connection?.projectId);
  const queryClient = useQueryClient();
  const fetching = useIsFetching({ queryKey: ["fs", projectId] }) > 0;
  const openDialog = useCrudDialog((s) => s.open);
  return (
      <aside data-testid="sidebar" className="overflow-auto rounded border border-line p-2 ">
        <div className="mb-2 flex flex-wrap items-center gap-1 justify-between">
          <h3 className="font-medium">{t("connection.collections")}</h3>
          <button
            type="button"
            data-testid="new-collection"
            aria-label={t("crud.newCollection")} title={t("crud.newCollection")}
            onClick={() => openDialog({ kind: "create", parentDocPath: "", collectionPath: null })}
            className="icon-button ml-auto"
          >
            <FolderPlus size={15} />
          </button>
          <button
            type="button"
            data-testid="import-collection"
            aria-label={t("io.importCollection")} title={t("io.importCollection")}
            onClick={() => openDialog({ kind: "import", scope: "collection", path: "" })}
            className="icon-button"
          >
            <Upload size={15} />
          </button>
          <button
            type="button"
            data-testid="refresh"
            aria-label={t("firestore.refresh")} title={t("firestore.refresh")}
            disabled={fetching}
            onClick={() => void queryClient.invalidateQueries({ queryKey: ["fs", projectId] })}
            className="icon-button disabled:opacity-50"
          >
            <RotateCw size={15} className={fetching ? "animate-spin" : ""} />
          </button>
        </div>
        <CollectionList docPath="" />
      </aside>
  );
}
