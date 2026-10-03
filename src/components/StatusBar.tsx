import { useTranslation } from "react-i18next";
import { useConnection } from "../store/connection";
import { useEditorStore } from "../store/documentEditor";
import { useOffline } from "../store/network";
import { usePendingInputs } from "../store/pendingInputs";
import { useRcEditor } from "../store/rcEditor";
import { hasUnsavedChanges } from "../store/unsavedChanges";

export function StatusBar() {
  const { t } = useTranslation();
  const project = useConnection((s) => s.connection?.projectId);
  const offline = useOffline();
  // Subscriptions only: they re-render the bar when any draft changes.
  useEditorStore((s) => s.sessions);
  useRcEditor((s) => s.session);
  usePendingInputs((s) => s.ids);
  const unsaved = hasUnsavedChanges();
  return (
    <footer data-testid="status-bar" data-offline={offline || undefined}
      className="flex h-7 shrink-0 items-center justify-between gap-4 border-t border-line bg-panel px-4 text-xs text-fg-muted">
      <span data-testid="status-connection" className="flex min-w-0 items-center gap-2">
        <span aria-hidden="true" className={`h-2 w-2 shrink-0 rounded-full ${offline ? "bg-warning" : "bg-success"}`} />
        <span className="truncate">{offline ? t("layout.offline", { project }) : t("layout.connected", { project })}</span>
      </span>
      <span role="status" data-testid="status-save" className={unsaved ? "text-warning" : undefined}>
        {unsaved ? t("editor.unsaved") : t("layout.saved")}
      </span>
    </footer>
  );
}
