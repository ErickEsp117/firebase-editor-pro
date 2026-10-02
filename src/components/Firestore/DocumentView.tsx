import { useTranslation } from "react-i18next";
import { ApiError } from "../../core";
import { DocumentEditor } from "../DocumentEditor/DocumentEditor";
import { useFirestoreNav } from "../../store/firestoreNav";
import { errorMessage } from "./TreeNodes";
import { useDocument } from "./useFirestore";

export function DocumentView() {
  const { t } = useTranslation();
  const path = useFirestoreNav((s) => s.selectedDoc);
  const doc = useDocument(path);

  if (!path) return <p data-testid="doc-empty" className="text-slate-500">{t("firestore.selectDocument")}</p>;
  return (
    <div data-testid="document-view" className="space-y-3">
      <h3 className="break-all font-mono text-sm font-semibold" data-testid="document-path">{path}</h3>
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
      {doc.data && path && <DocumentEditor path={path} serverDoc={doc.data} />}
    </div>
  );
}
