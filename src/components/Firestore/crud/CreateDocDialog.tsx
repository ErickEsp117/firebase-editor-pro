import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ApiError, documentsRootOf, encodeFields } from "../../../core";
import { useConnection } from "../../../store/connection";
import { useCrudDialog } from "../../../store/crudDialog";
import { useFirestoreNav } from "../../../store/firestoreNav";
import { parseDraft } from "../../DocumentEditor/editorModel";
import { useFirestoreApi } from "../useFirestore";
import { DialogError, type DialogFailure } from "./DialogError";
import { autoId, invalidateTree } from "./invalidate";
import { BTN, Modal } from "./Modal";

interface Props {
  parentDocPath: string;
  collectionPath: string | null;
}

const FIELD = "w-full rounded border border-slate-300 bg-white px-2 py-1 font-mono text-sm dark:border-slate-600 dark:bg-slate-900";

export function CreateDocDialog({ parentDocPath, collectionPath }: Props) {
  const { t } = useTranslation();
  const api = useFirestoreApi();
  const queryClient = useQueryClient();
  const projectId = useConnection((s) => s.connection?.projectId);
  const close = useCrudDialog((s) => s.close);
  const select = useFirestoreNav((s) => s.select);
  const [collId, setCollId] = useState("");
  const [docId, setDocId] = useState("");
  const [text, setText] = useState("{}");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<DialogFailure | null>(null);

  const needsCollection = collectionPath === null;
  const collName = needsCollection ? collId.trim() : collectionPath;
  const fullCollection = needsCollection ? (parentDocPath ? `${parentDocPath}/${collName}` : collName) : collectionPath;
  const draft = parseDraft(text);
  const trimmedId = docId.trim();

  const collError = needsCollection ? (!collName ? t("crud.collectionIdRequired") : collName.includes("/") ? t("crud.collectionIdInvalid") : null) : null;
  const idError = trimmedId && (trimmedId.includes("/") || trimmedId === "." || trimmedId === "..") ? t("crud.documentIdInvalid") : null;
  const draftError = draft.ok ? null : t(draft.error.key, draft.error.params);
  const invalid = !!collError || !!idError || !draft.ok;

  const title = needsCollection
    ? parentDocPath
      ? t("crud.createSubcollectionTitle", { path: parentDocPath })
      : t("crud.createCollectionTitle")
    : t("crud.addDocToTitle", { path: collectionPath });

  const submit = async () => {
    if (!api || !draft.ok || invalid) return;
    const id = trimmedId || autoId();
    const path = `${fullCollection}/${id}`;
    setBusy(true);
    setError(null);
    try {
      await api.createDoc(fullCollection, id, encodeFields(draft.value, { documentsRoot: projectId ? documentsRootOf(projectId) : undefined }));
      await invalidateTree(queryClient, projectId);
      const nav = useFirestoreNav.getState();
      for (const key of [`c:${fullCollection}`, ...(parentDocPath ? [`d:${parentDocPath}`] : [])]) {
        if (!nav.expanded[key]) nav.toggle(key);
      }
      select(path);
      close();
    } catch (e) {
      setError(e instanceof ApiError && e.status === "ALREADY_EXISTS" ? { key: "crud.alreadyExists", params: { path } } : { key: "crud.createError", cause: e });
      setBusy(false);
    }
  };

  return (
    <Modal titleId="create-doc-title" testId="create-doc-dialog" title={title}>
      {needsCollection && <p className="text-xs text-slate-500">{t("crud.createCollectionHint")}</p>}
      {needsCollection && (
        <label className="block text-sm">
          {t("crud.collectionId")}
          <input data-testid="create-collection-id" className={FIELD} value={collId} onChange={(e) => setCollId(e.target.value)} autoFocus />
          {collId !== "" && collError && <span className="text-xs text-red-700 dark:text-red-300">{collError}</span>}
        </label>
      )}
      <label className="block text-sm">
        {t("crud.documentId")}
        <input data-testid="create-doc-id" className={FIELD} value={docId} onChange={(e) => setDocId(e.target.value)} autoFocus={!needsCollection} />
        <span className="text-xs text-slate-500">{idError ?? t("crud.documentIdHint")}</span>
      </label>
      <label className="block text-sm">
        {t("crud.initialContent")}
        <textarea data-testid="create-doc-json" className={`${FIELD} h-40`} spellCheck={false} value={text} onChange={(e) => setText(e.target.value)} />
        {draftError && (
          <span data-testid="create-doc-json-error" className="text-xs text-red-700 dark:text-red-300">
            {draftError}
          </span>
        )}
      </label>
      {error && <DialogError failure={error} testId="create-doc-error" />}
      <div className="flex justify-end gap-2">
        <button type="button" data-testid="create-doc-cancel" className={BTN} disabled={busy} onClick={close}>
          {t("connection.cancel")}
        </button>
        <button type="button" data-testid="create-doc-submit" className="rounded bg-blue-700 px-3 py-1 text-sm text-white disabled:opacity-50" disabled={busy || invalid} onClick={() => void submit()}>
          {busy ? t("crud.creating") : t("crud.create")}
        </button>
      </div>
    </Modal>
  );
}
