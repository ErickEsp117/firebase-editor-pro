import { useState } from "react";
import { RotateCw, Braces, Upload } from "lucide-react";
import { useShortcutActions } from "../../hooks/shortcuts";
import { formatEditorJson } from "../../core";
import { useCrudDialog } from "../../store/crudDialog";
import { IconButton } from "../IconButton";
import { ConfirmDialog } from "../ConfirmDialog";
import { useTranslation } from "react-i18next";
import type { FirestoreDocument } from "../../core";
import { useEditorStore, type EditorView } from "../../store/documentEditor";
import { ConflictDialog } from "./ConflictDialog";
import { JsonView } from "./JsonView";
import { SaveBar, SaveButton } from "./SaveBar";
import { TableView } from "./TableView";
import { useDocumentEditor } from "./useDocumentEditor";

export function DocumentEditor({ path, serverDoc }: { path: string; serverDoc: FirestoreDocument }) {
  const { t } = useTranslation();
  const view = useEditorStore((s) => s.view);
  const setView = useEditorStore((s) => s.setView);
  const ed = useDocumentEditor(path, serverDoc);
  const [reloadPending, setReloadPending] = useState(false);
  const openDialog = useCrudDialog((s) => s.open);
  const format = () => {
    try { ed.updateText(formatEditorJson(ed.text)); }
    catch (error) { ed.setState({ phase: "error", error }); }
  };
  const reload = () => ed.dirty ? setReloadPending(true) : void ed.reload();
  useShortcutActions("firestore", {
    save: () => { if (ed.canSave) void ed.save(); },
    reload, format,
  });

  const tab = (v: EditorView, label: string) => (
    <button
      type="button"
      role="tab"
      aria-selected={view === v}
      data-testid={`view-${v}`}
      onClick={() => setView(v)}
      className={`rounded-t border-b-2 px-3 py-1 text-sm ${view === v ? "border-accent font-medium" : "border-transparent text-fg-muted"}`}
    >
      {label}
    </button>
  );

  return (
    <div data-testid="document-editor" className="space-y-3">
      <div className="editor-toolbar flex flex-wrap items-center gap-3 pb-3" data-tauri-drag-region="deep">
        <div className="mr-auto min-w-0"><h3 className="font-semibold">{path.split("/").at(-1)}</h3><p className="text-xs text-fg-muted">{path.slice(0, path.lastIndexOf("/"))}</p></div>
        <div role="tablist" className="segmented">
        {tab("json", t("editor.viewJson"))}
        {tab("table", t("editor.viewTable"))}
        </div>
        <IconButton data-testid="document-reload" label={t("editor.reload")} shortcut="reload" onClick={reload}><RotateCw size={16} /></IconButton>
        <IconButton data-testid="document-format" label={t("editor.format")} shortcut="format" onClick={format}><Braces size={16} /></IconButton>
        <IconButton data-testid="document-export-action" label={t("io.exportDocument")} onClick={() => openDialog({ kind: "export", scope: "doc", path })}><Upload size={16} /></IconButton>
        <SaveButton canSave={ed.canSave} state={ed.state} onSave={() => void ed.save()} />
      </div>
      {view === "table" ? (
        ed.draft.ok ? (
          <TableView value={ed.draft.value} onChange={ed.edit} />
        ) : (
          <p data-testid="table-unavailable" className="text-sm text-fg-muted">
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
      {reloadPending && <ConfirmDialog testId="reload-document" title={t("accounts.unsavedTitle")} confirmLabel={t("editor.reload")}
        onCancel={() => setReloadPending(false)} onConfirm={() => { setReloadPending(false); void ed.reload(); }}>
        <p>{t("accounts.unsavedWarning")}</p>
      </ConfirmDialog>}
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
