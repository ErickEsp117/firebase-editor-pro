import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { ApiError } from "../../core";
import { DocumentEditor } from "../DocumentEditor/DocumentEditor";
import { useConnection } from "../../store/connection";
import { useCrudDialog } from "../../store/crudDialog";
import { useEditorStore } from "../../store/documentEditor";
import { useFirestoreNav } from "../../store/firestoreNav";
import { ErrorNotice } from "../errors/ErrorNotice";
import { useDocument } from "./useFirestore";

export function DocumentView() {
  const { t } = useTranslation();
  const path = useFirestoreNav((s) => s.selectedDoc);
  const doc = useDocument(path);
  const openDialog = useCrudDialog((s) => s.open);
  const select = useFirestoreNav((s) => s.select);
  const projectId = useConnection((s) => s.connection?.projectId);
  const queryClient = useQueryClient();

  if (!path) {
    return (
      <>
        <AreaHeader title={t("nav.firestore")} subtitle={projectId} />
        <p data-testid="doc-empty" className="panel-body text-fg-muted">{t("firestore.selectDocument")}</p>
      </>
    );
  }
  const missing = doc.isError && doc.error instanceof ApiError && doc.error.status === "NOT_FOUND";
  // A failed refresh of a loaded document keeps its editor (and any draft) on screen under the error.
  const showEditor = !!doc.data && !missing;
  const parent = path.slice(0, path.lastIndexOf("/"));
  const back = () => {
    // The document is gone: its draft can never be saved, and the collection list is stale.
    if (projectId) useEditorStore.getState().drop(projectId, path);
    void queryClient.invalidateQueries({ queryKey: ["fs", projectId, "docs", parent] });
    select(null);
  };
  return (
    <div data-testid="document-view">
      {!showEditor && <AreaHeader title={path.slice(path.lastIndexOf("/") + 1)} subtitle={parent} />}
      {(doc.isPending || doc.isError) && (
        <div className="panel-body pb-0">
          {doc.isPending && <p data-testid="document-loading">{t("firestore.documentLoading")}</p>}
          {doc.isError &&
            (missing ? (
              <div role="status" data-testid="document-missing" className="space-y-1 text-sm text-warning ">
                <p>{t("firestore.documentMissing")}</p>
                <button type="button" data-testid="document-back" className="underline" onClick={back}>
                  {t("firestore.backToTree")}
                </button>
              </div>
            ) : (
              <ErrorNotice
                testId="document-error"
                error={doc.error}
                summary={t("firestore.documentError")}
                onRetry={() => void doc.refetch()}
              />
            ))}
        </div>
      )}
      {showEditor && <DocumentEditor path={path} serverDoc={doc.data!} />}
      <div className="flex flex-wrap items-center gap-2 px-[18px] pb-[18px]">
        <h3 className="mr-auto break-all font-mono text-xs text-fg-muted" data-testid="document-path">{path}</h3>
        <button
          type="button"
          data-testid="new-subcollection"
          onClick={() => openDialog({ kind: "create", parentDocPath: path, collectionPath: null })}
          className="btn"
        >
          {t("crud.newSubcollection")}
        </button>
        <button
          type="button"
          data-testid="import-document"
          onClick={() => openDialog({ kind: "import", scope: "doc", path })}
          className="btn"
        >
          {t("io.importDocument")}
        </button>
        <button
          type="button"
          data-testid="delete-document"
          onClick={() => openDialog({ kind: "deleteDoc", path })}
          className="btn border-danger text-danger"
        >
          {t("crud.deleteDocument")}
        </button>
      </div>
    </div>
  );
}

/** Toolbar band of an area without a loaded document: title, subtitle and the window drag region. */
export function AreaHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="editor-toolbar" data-tauri-drag-region="deep">
      <div className="min-w-0">
        <h3 className="truncate font-semibold">{title}</h3>
        {subtitle && <p className="truncate text-xs text-fg-muted">{subtitle}</p>}
      </div>
    </div>
  );
}
