import { ChevronDown, ChevronRight, Folder, FileText, Plus, Download, Upload, Trash2 } from "lucide-react";
import { useArea } from "../../store/rcEditor";
import { useTranslation } from "react-i18next";
import { describeError, technicalText } from "../errors/describeError";
import { TechnicalDetails } from "../errors/TechnicalDetails";
import { useCrudDialog } from "../../store/crudDialog";
import { useFirestoreNav } from "../../store/firestoreNav";
import { isMissing, relativePath, useCollectionIds, useDocsPage } from "./useFirestore";

function Chevron({ open }: { open: boolean }) {
  const Icon = open ? ChevronDown : ChevronRight;
  return <Icon aria-hidden="true" size={15} strokeWidth={1.75} className="shrink-0" />;
}

function Status({
  children,
  error,
  onRetry,
  testId,
  technical,
}: {
  children: string;
  error?: boolean;
  onRetry?: () => void;
  testId?: string;
  technical?: string | null;
}) {
  const { t } = useTranslation();
  return (
    <div
      role={error ? "alert" : "status"}
      data-testid={testId}
      className={`px-2 py-0.5 text-xs ${error ? "text-danger " : "text-fg-muted"}`}
    >
      {children}
      {onRetry && (
        <button type="button" className="ml-2 underline" onClick={onRetry}>
          {t("connection.retry")}
        </button>
      )}
      {technical && <TechnicalDetails text={technical} testId={`${testId}-technical`} />}
    </div>
  );
}

/** Root collections (docPath "") or the subcollections of a document; fetched only when mounted. */
export function CollectionList({ docPath }: { docPath: string }) {
  const { t } = useTranslation();
  const ids = useCollectionIds(docPath);
  if (ids.isPending) return <Status testId="collections-loading">{t("connection.collectionsLoading")}</Status>;
  if (ids.isError)
    return (
      <Status error testId="collections-error" onRetry={() => void ids.refetch()} technical={technicalText(ids.error)}>
        {t("connection.collectionsError", { message: describeError(t, ids.error) })}
      </Status>
    );
  if (ids.data.length === 0)
    return <Status testId="collections-empty">{docPath ? t("firestore.noSubcollections") : t("connection.collectionsEmpty")}</Status>;
  return (
    <ul data-testid={docPath ? "subcollections-list" : "collections-list"}>
      {ids.data.map((id) => (
        <CollectionNode key={id} path={docPath ? `${docPath}/${id}` : id} name={id} />
      ))}
    </ul>
  );
}

function CollectionNode({ path, name }: { path: string; name: string }) {
  const key = `c:${path}`;
  const open = useFirestoreNav((s) => !!s.expanded[key]);
  const toggle = useFirestoreNav((s) => s.toggle);
  const openDialog = useCrudDialog((s) => s.open);
  const parentDocPath = path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";
  const { t } = useTranslation();
  return (
    <li data-testid={`collection-node:${path}`}>
      <div className="flex items-center rounded hover:bg-hover ">
        <button
          type="button"
          aria-expanded={open}
          data-testid={`collection:${path}`}
          onClick={() => toggle(key)}
          className="flex min-w-0 flex-1 items-center px-1 py-1 text-left"
        >
          <Chevron open={open} /><Folder size={16} strokeWidth={1.75} className="mx-1 shrink-0" aria-hidden="true" />
          <span className="truncate">{name}</span>
        </button>
        <button
          type="button"
          data-testid={`collection-add:${path}`}
          aria-label={t("crud.addDocTo", { path })}
          title={t("crud.addDocTo", { path })}
          onClick={() => openDialog({ kind: "create", parentDocPath, collectionPath: path })}
          className="tree-actions px-1 text-sm"
        >
          <Plus size={14} aria-hidden="true" />
        </button>
        <button
          type="button"
          data-testid={`collection-export:${path}`}
          aria-label={`${t("io.exportCollection")} ${path}`}
          title={t("io.exportCollection")}
          onClick={() => openDialog({ kind: "export", scope: "collection", path })}
          className="tree-actions px-1 text-sm"
        >
          <Download size={14} aria-hidden="true" />
        </button>
        <button
          type="button"
          data-testid={`collection-import:${path}`}
          aria-label={t("io.importIntoCollection", { path })}
          title={t("io.importCollection")}
          onClick={() => openDialog({ kind: "import", scope: "collection", path })}
          className="tree-actions px-1 text-sm"
        >
          <Upload size={14} aria-hidden="true" />
        </button>
        <button
          type="button"
          data-testid={`collection-delete:${path}`}
          aria-label={t("crud.deleteCollection") + ` ${path}`}
          title={t("crud.deleteCollection")}
          onClick={() => openDialog({ kind: "deleteCollection", path })}
          className="tree-actions px-1 text-sm text-danger "
        >
          <Trash2 size={14} aria-hidden="true" />
        </button>
      </div>
      {open && (
        <div className="ml-4 border-l border-line pl-1 ">
          <DocList collectionPath={path} />
        </div>
      )}
    </li>
  );
}

function DocList({ collectionPath }: { collectionPath: string }) {
  const { t } = useTranslation();
  const { query, docs } = useDocsPage(collectionPath);
  if (query.isPending) return <Status testId="docs-loading">{t("firestore.docsLoading")}</Status>;
  if (query.isError)
    return (
      <Status error testId="docs-error" onRetry={() => void query.refetch()} technical={technicalText(query.error)}>
        {t("firestore.docsError", { message: describeError(t, query.error) })}
      </Status>
    );
  return (
    <div>
      {docs.length === 0 && <Status testId="docs-empty">{t("firestore.docsEmpty")}</Status>}
      <ul data-testid={`docs:${collectionPath}`}>
        {docs.map((d) => (
          <DocNode key={d.name} path={relativePath(d)} missing={isMissing(d)} />
        ))}
      </ul>
      {query.hasNextPage && (
        <button
          type="button"
          data-testid={`load-more:${collectionPath}`}
          disabled={query.isFetchingNextPage}
          onClick={() => void query.fetchNextPage()}
          className="m-1 rounded border border-line px-2 py-0.5 text-xs disabled:opacity-50"
        >
          {query.isFetchingNextPage ? t("firestore.loadingMore") : t("firestore.loadMore")}
        </button>
      )}
    </div>
  );
}

function DocNode({ path, missing }: { path: string; missing: boolean }) {
  const { t } = useTranslation();
  const key = `d:${path}`;
  const open = useFirestoreNav((s) => !!s.expanded[key]);
  const selected = useFirestoreNav((s) => s.selectedDoc === path);
  // Like a macOS source list: the selection is filled with the accent only while its area is shown.
  const inFirestore = useArea((s) => s.area === "firestore");
  const accentSel = selected && inFirestore;
  const toggle = useFirestoreNav((s) => s.toggle);
  const select = useFirestoreNav((s) => s.select);
  const id = path.slice(path.lastIndexOf("/") + 1);
  return (
    <li data-testid={`doc-node:${path}`} data-missing={missing || undefined}>
      <div className={`flex items-center rounded-md ${accentSel ? "bg-accent text-on-accent" : selected ? "bg-selection" : "hover:bg-hover"}`}>
        <button
          type="button"
          aria-expanded={open}
          aria-label={t("firestore.toggleSubcollections", { id })}
          title={t("firestore.toggleSubcollections", { id })}
          data-testid={`doc-toggle:${path}`}
          onClick={() => toggle(key)}
          className="tree-actions px-1 text-sm"
        >
          <Chevron open={open} />
        </button>
        <button
          type="button"
          data-testid={`doc:${path}`}
          aria-current={selected ? "true" : undefined}
          onClick={() => { useArea.getState().setArea("firestore"); select(path); }}
          className={`flex min-w-0 flex-1 items-center gap-1.5 truncate py-1 text-left ${missing ? (accentSel ? "italic" : "italic opacity-70") : ""}`}
        >
          <FileText size={16} strokeWidth={1.75} className="shrink-0" aria-hidden="true" /><span className="truncate">{id}</span>
        </button>
        {missing && (
          <span data-testid={`missing-badge:${path}`} title={t("firestore.missingHint")} className={`mr-1 rounded px-1 text-[10px] ${accentSel ? "bg-on-accent/20 text-on-accent" : "bg-warning/10 text-warning"}`}>
            {t("firestore.missing")}
          </span>
        )}
      </div>
      {open && (
        <div className="ml-4 border-l border-line pl-1 ">
          <CollectionList docPath={path} />
        </div>
      )}
    </li>
  );
}
