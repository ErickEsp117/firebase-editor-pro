import { useState } from "react";
import { RotateCw, Braces, Upload } from "lucide-react";
import { useShortcutActions } from "../../hooks/shortcuts";
import { formatEditorJson, repairEditorJson } from "../../core";
import { useCrudDialog } from "../../store/crudDialog";
import { hasPendingInputs, usePendingInputs } from "../../store/pendingInputs";
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
  const pendingInput = usePendingInputs((s) => Object.keys(s.ids).length > 0);
  const [reloadPending, setReloadPending] = useState(false);
  // The text a Format/Repair failed on; the error stays only until that text changes.
  const [failedOn, setFailedOn] = useState<string | null>(null);
  const jsonActionFailed = failedOn !== null && failedOn === ed.text;
  const openDialog = useCrudDialog((s) => s.open);

  // Format and Repair report failures the same way from the toolbar, the JSON view and the shortcut.
  const runJson = (fn: (text: string) => string) => {
    try {
      ed.updateText(fn(ed.text));
      setFailedOn(null);
    } catch {
      setFailedOn(ed.text);
    }
  };
  const format = () => runJson(formatEditorJson);
  const reload = () => {
    if (ed.state.phase === "reloading") return;
    if (ed.dirty || hasPendingInputs()) setReloadPending(true);
    else void ed.reload();
  };
  // The same reload as the toolbar button: the tree refresh skips a document with unsaved edits.
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
    >
      {label}
    </button>
  );

  const slash = path.lastIndexOf("/");
  return (
    <div data-testid="document-editor">
      <div className="editor-toolbar" data-tauri-drag-region="deep">
        <div className="mr-auto min-w-0">
          <h3 data-testid="document-title" className="truncate font-semibold">{path.slice(slash + 1)}</h3>
          <p data-testid="document-subtitle" className="truncate text-xs text-fg-muted">{path.slice(0, slash)}</p>
        </div>
        <div role="tablist" aria-label={t("editor.viewMode")} className="segmented">
          {tab("json", t("editor.viewJson"))}
          {tab("table", t("editor.viewTable"))}
        </div>
        <div className="flex items-center gap-1">
          <IconButton data-testid="document-reload" label={t("editor.reload")} shortcut="reload" aria-disabled={ed.state.phase === "reloading"} onClick={reload}>
            <RotateCw size={16} aria-hidden="true" className={ed.state.phase === "reloading" ? "animate-spin" : ""} />
          </IconButton>
          <IconButton data-testid="json-format" label={t("editor.format")} shortcut="format" onClick={format}><Braces size={16} aria-hidden="true" /></IconButton>
          <IconButton data-testid="export-document" label={t("io.exportDocument")} onClick={() => openDialog({ kind: "export", scope: "doc", path })}><Upload size={16} aria-hidden="true" /></IconButton>
        </div>
        <SaveButton canSave={ed.canSave} state={ed.state} onSave={() => void ed.save()} />
      </div>
      <div className="panel-body space-y-3">
        {jsonActionFailed && (
          <p role="alert" data-testid="json-action-error" className="text-sm text-danger">
            {t("editor.actionFailed")}
          </p>
        )}
        {view === "table" ? (
          ed.draft.ok ? (
            <TableView value={ed.draft.value} onChange={ed.edit} />
          ) : (
            <p data-testid="table-unavailable" className="text-sm text-fg-muted">
              {t("editor.tableNeedsValidJson")}
            </p>
          )
        ) : (
          <JsonView text={ed.text} onChange={ed.updateText} onRepair={() => runJson(repairEditorJson)} />
        )}
        <SaveBar
          draft={ed.draft}
          dirty={ed.dirty}
          pending={pendingInput}
          canSave={ed.canSave}
          state={ed.state}
          updateTime={ed.updateTime}
          onSave={() => void ed.save()}
          onDiscard={ed.discard}
        />
      </div>
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
