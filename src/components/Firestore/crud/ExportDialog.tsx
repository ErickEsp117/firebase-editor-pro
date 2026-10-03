import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { exportCollection, exportDocument } from "../../../core";
import { getPlatform } from "../../../platform";
import { useCrudDialog } from "../../../store/crudDialog";
import { useFirestoreApi } from "../useFirestore";
import { DialogError, type DialogFailure } from "./DialogError";
import { BTN, Modal } from "./Modal";

interface Props {
  scope: "doc" | "collection";
  path: string;
}

type Status = { phase: "running"; count: number } | { phase: "done"; count: number; name: string } | { phase: "cancelled" } | { phase: "error"; failure: DialogFailure };

export function ExportDialog({ scope, path }: Props) {
  const { t } = useTranslation();
  const api = useFirestoreApi();
  const close = useCrudDialog((s) => s.close);
  const [status, setStatus] = useState<Status>({ phase: "running", count: 0 });
  const started = useRef(false);
  // Closing the dialog while the export runs abandons it: no save dialog appears later for it.
  const open = useRef(true);
  useEffect(() => {
    open.current = true;
    return () => {
      open.current = false;
    };
  }, []);

  useEffect(() => {
    if (!api || started.current) return;
    started.current = true;
    const leaf = path.slice(path.lastIndexOf("/") + 1);
    const name = `${leaf}.json`;
    void (async () => {
      try {
        let text: string;
        let count = 1;
        if (scope === "doc") {
          text = await exportDocument(api, path);
        } else {
          const res = await exportCollection(api, path, (n) => {
            if (open.current) setStatus({ phase: "running", count: n });
          });
          text = res.text;
          count = res.docs;
        }
        if (!open.current) return;
        const saved = await getPlatform().saveTextFile(name, text);
        if (open.current) setStatus(saved ? { phase: "done", count, name } : { phase: "cancelled" });
      } catch (e) {
        if (open.current) setStatus({ phase: "error", failure: { key: "io.exportError", cause: e } });
      }
    })();
  }, [api, path, scope]);

  return (
    <Modal onClose={close} titleId="export-title" testId="export-dialog" title={scope === "doc" ? t("io.exportTitleDoc") : t("io.exportTitleColl")}>
      <p className="break-all font-mono text-xs text-fg-muted">{path}</p>
      {status.phase === "running" && (
        <p role="status" data-testid="export-progress" className="text-sm">
          {t("io.exporting", { path, count: status.count })}
        </p>
      )}
      {status.phase === "done" && (
        <p role="status" data-testid="export-done" className="text-sm text-success">
          {t("io.exportDone", { count: status.count, name: status.name })}
        </p>
      )}
      {status.phase === "cancelled" && (
        <p role="status" data-testid="export-cancelled" className="text-sm">
          {t("io.exportCancelled")}
        </p>
      )}
      {status.phase === "error" && <DialogError failure={status.failure} testId="export-error" />}
      <div className="flex justify-end">
        <button type="button" data-testid="export-close" className={BTN} onClick={close}>
          {t("io.close")}
        </button>
      </div>
    </Modal>
  );
}
