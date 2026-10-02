import { useTranslation } from "react-i18next";
import type { FirestoreDocument } from "../../core";
import { useEditorStore, type EditorView } from "../../store/documentEditor";
import { ConflictDialog } from "./ConflictDialog";
import { JsonView } from "./JsonView";
import { SaveBar } from "./SaveBar";
import { TableView } from "./TableView";
import { useDocumentEditor } from "./useDocumentEditor";

export function DocumentEditor({ path, serverDoc }: { path: string; serverDoc: FirestoreDocument }) {
  const { t } = useTranslation();
  const view = useEditorStore((s) => s.view);
  const setView = useEditorStore((s) => s.setView);
  const ed = useDocumentEditor(path, serverDoc);

  const tab = (v: EditorView, label: string) => (
    <button
      type="button"
      role="tab"
      aria-selected={view === v}
      data-testid={`view-${v}`}
      onClick={() => setView(v)}
      className={`rounded-t border-b-2 px-3 py-1 text-sm ${view === v ? "border-blue-600 font-medium" : "border-transparent text-slate-500"}`}
    >
      {label}
    </button>
  );

  return (
    <div data-testid="document-editor" className="space-y-3">
      <div role="tablist" className="flex gap-1 border-b border-slate-200 dark:border-slate-700">
        {tab("table", t("editor.viewTable"))}
        {tab("json", t("editor.viewJson"))}
      </div>
      {view === "table" ? (
        ed.draft.ok ? (
          <TableView value={ed.draft.value} onChange={ed.edit} />
        ) : (
          <p data-testid="table-unavailable" className="text-sm text-slate-500">
            {t("editor.tableNeedsValidJson")}
          </p>
        )
      ) : (
        <JsonView text={ed.text} onChange={ed.updateText} />
      )}
      <SaveBar
        draft={ed.draft}
        dirty={ed.dirty}
        canSave={ed.canSave}
        state={ed.state}
        updateTime={ed.updateTime}
        onSave={() => void ed.save()}
        onDiscard={ed.discard}
      />
      {ed.state.phase === "conflict" && (
        <ConflictDialog
          forcing={ed.forcing}
          onReload={() => {
            ed.setForcing(false);
            void ed.reload();
          }}
          onAskForce={() => ed.setForcing(true)}
          onConfirmForce={() => void ed.save(true)}
          onCancel={() => {
            ed.setForcing(false);
            ed.setState({ phase: "idle" });
          }}
        />
      )}
    </div>
  );
}
