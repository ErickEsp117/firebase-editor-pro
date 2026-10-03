import { useTranslation } from "react-i18next";
import { ApiError } from "../../core";
import { DocumentEditor } from "../DocumentEditor/DocumentEditor";
import { useCrudDialog } from "../../store/crudDialog";
import { useFirestoreNav } from "../../store/firestoreNav";
import { ErrorNotice } from "../errors/ErrorNotice";
import { useDocument } from "./useFirestore";

export function DocumentView() {
  const { t } = useTranslation();
  const path = useFirestoreNav((s) => s.selectedDoc);
  const doc = useDocument(path);
  const openDialog = useCrudDialog((s) => s.open);
  const select = useFirestoreNav((s) => s.select);

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
          <div role="status" data-testid="document-missing" className="space-y-1 text-sm text-amber-700 dark:text-amber-300">
            <p>{t("firestore.documentMissing")}</p>
            <button type="button" data-testid="document-back" className="underline" onClick={() => select(null)}>
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
      {doc.data && !doc.isError && path && <DocumentEditor path={path} serverDoc={doc.data} />}
    </div>
  );
}
