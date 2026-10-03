import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { planCollectionImport, planDocumentImport, runImport, type ImportEntry } from "../../../core";
import { getPlatform } from "../../../platform";
import { useConnection } from "../../../store/connection";
import { useCrudDialog } from "../../../store/crudDialog";
import { describeError } from "../../errors/describeError";
import { useFirestoreApi } from "../useFirestore";
import { invalidateTree } from "./invalidate";
import { ioErrorMessage } from "./ioErrors";
import { BTN, Modal } from "./Modal";

interface Props {
  scope: "doc" | "collection";
  path: string;
}

const FIELD = "w-full rounded border border-slate-300 bg-white px-2 py-1 font-mono text-sm dark:border-slate-600 dark:bg-slate-900";

export function ImportDialog({ scope, path }: Props) {
  const { t } = useTranslation();
  const api = useFirestoreApi();
  const queryClient = useQueryClient();
  const projectId = useConnection((s) => s.connection?.projectId);
  const close = useCrudDialog((s) => s.close);
  const [target, setTarget] = useState(path);
  const [text, setText] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ written: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [doneCount, setDoneCount] = useState<number | null>(null);

  const pick = async () => {
    setError(null);
    try {
      const file = await getPlatform().pickImportFile();
      if (!file) return;
      setText(file.contents);
      setFileName(file.name);
      setDoneCount(null);
    } catch (e) {
      setError(t("io.fileError", { message: ioErrorMessage(t, e) }));
    }
  };

  const submit = async () => {
    if (!api) return;
    setError(null);
    setDoneCount(null);
    if (!text.trim()) {
      setError(t("io.empty"));
      return;
    }
    let entries: ImportEntry[];
    try {
      const dest = target.trim().replace(/^\/+|\/+$/g, "");
      entries = scope === "doc" ? planDocumentImport(text, dest, api.projectId) : planCollectionImport(text, dest, api.projectId);
    } catch (e) {
      setError(t("io.invalidNothingWritten", { message: ioErrorMessage(t, e) }));
      return;
    }
    setBusy(true);
    setProgress({ written: 0, total: entries.length });
    let written = 0;
    try {
      written = await runImport(api, entries, (n) => {
        written = n;
        setProgress({ written: n, total: entries.length });
      });
      setDoneCount(written);
    } catch (e) {
      setError(t("io.importWriteError", { written, total: entries.length, message: describeError(t, e) }));
    } finally {
      setBusy(false);
      setProgress(null);
      if (written > 0) {
        queryClient.removeQueries({ queryKey: ["fs", projectId, "doc"] });
        await invalidateTree(queryClient, projectId);
      }
    }
  };

  return (
    <Modal titleId="import-title" testId="import-dialog" title={scope === "doc" ? t("io.importTitleDoc") : t("io.importTitleColl")}>
      <label className="block text-sm">
        {scope === "doc" ? t("io.targetDoc") : t("io.targetColl")}
        <input data-testid="import-target" className={FIELD} value={target} onChange={(e) => setTarget(e.target.value)} disabled={busy} />
        <span className="text-xs text-slate-500">{scope === "doc" ? t("io.targetHintDoc") : t("io.targetHintColl")}</span>
      </label>
      <div className="flex items-center gap-2 text-sm">
        <button type="button" data-testid="import-choose-file" className={BTN} disabled={busy} onClick={() => void pick()}>
          {t("io.chooseFile")}
        </button>
        {fileName && <span data-testid="import-file-name" className="truncate text-xs text-slate-500">{t("io.loadedFile", { name: fileName })}</span>}
      </div>
      <label className="block text-sm">
        {t("io.pasteLabel")}
        <textarea data-testid="import-json" className={`${FIELD} h-40`} spellCheck={false} value={text} disabled={busy} onChange={(e) => setText(e.target.value)} />
      </label>
      {progress && (
        <p role="status" data-testid="import-progress" className="text-sm">
          {t("io.importing", progress)}
        </p>
      )}
      {doneCount !== null && (
        <p role="status" data-testid="import-done" className="text-sm text-green-800 dark:text-green-300">
          {t("io.importDone", { count: doneCount })}
        </p>
      )}
      {error && (
        <p role="alert" data-testid="import-error" className="text-sm text-red-700 dark:text-red-300">
          {error}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <button type="button" data-testid="import-close" className={BTN} disabled={busy} onClick={close}>
          {t("io.close")}
        </button>
        <button type="button" data-testid="import-submit" className="rounded bg-blue-700 px-3 py-1 text-sm text-white disabled:opacity-50" disabled={busy} onClick={() => void submit()}>
          {busy ? t("crud.creating") : t("io.importButton")}
        </button>
      </div>
    </Modal>
  );
}
