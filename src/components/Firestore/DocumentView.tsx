import { useTranslation } from "react-i18next";
import { ApiError } from "../../core";
import { DocumentEditor } from "../DocumentEditor/DocumentEditor";
import { useCrudDialog } from "../../store/crudDialog";
import { useFirestoreNav } from "../../store/firestoreNav";
import { errorMessage } from "./TreeNodes";
import { useDocument } from "./useFirestore";

export function DocumentView() {
  const { t } = useTranslation();
  const path = useFirestoreNav((s) => s.selectedDoc);
  const doc = useDocument(path);
  const openDialog = useCrudDialog((s) => s.open);

  if (!path) return <p data-testid="doc-empty" className="text-slate-500">{t("firestore.selectDocument")}</p>;
  return (
    <div data-testid="document-view" className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="mr-auto break-all font-mono text-sm font-semibold" data-testid="document-path">{path}</h3>
        <button
          type="button"
          data-testid="new-subcollection"
          onClick={() => openDialog({ kind: "create", parentDocPath: path, collectionPath: null })}
          className="rounded border border-slate-400 px-2 py-0.5 text-xs"
        >
          {t("crud.newSubcollection")}
        </button>
        <button
          type="button"
          data-testid="export-document"
          onClick={() => openDialog({ kind: "export", scope: "doc", path })}
          className="rounded border border-slate-400 px-2 py-0.5 text-xs"
        >
          {t("io.exportDocument")}
        </button>
        <button
          type="button"
          data-testid="import-document"
          onClick={() => openDialog({ kind: "import", scope: "doc", path })}
          className="rounded border border-slate-400 px-2 py-0.5 text-xs"
        >
          {t("io.importDocument")}
        </button>
        <button
          type="button"
          data-testid="delete-document"
          onClick={() => openDialog({ kind: "deleteDoc", path })}
          className="rounded border border-red-600 px-2 py-0.5 text-xs text-red-700 dark:text-red-300"
        >
          {t("crud.deleteDocument")}
        </button>
      </div>
      {doc.isPending && <p data-testid="document-loading">{t("firestore.documentLoading")}</p>}
      {doc.isError &&
        (doc.error instanceof ApiError && doc.error.status === "NOT_FOUND" ? (
          <p data-testid="document-missing" className="text-sm text-amber-700 dark:text-amber-300">
            {t("firestore.documentMissing")}
          </p>
        ) : (
          <div role="alert" data-testid="document-error" className="text-sm text-red-700 dark:text-red-300">
            {t("firestore.documentError", { message: errorMessage(doc.error) })}
            <button type="button" className="ml-2 underline" onClick={() => void doc.refetch()}>
              {t("connection.retry")}
            </button>
          </div>
        ))}
      {doc.data && !doc.isError && path && <DocumentEditor path={path} serverDoc={doc.data} />}
    </div>
  );
}
