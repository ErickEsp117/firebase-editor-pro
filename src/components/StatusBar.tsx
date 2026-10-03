import { useTranslation } from "react-i18next";
import { useConnection } from "../store/connection";
import { useEditorStore } from "../store/documentEditor";
import { useRcEditor } from "../store/rcEditor";
import { hasUnsavedChanges } from "../store/unsavedChanges";

export function StatusBar() {
  const { t } = useTranslation();
  const project = useConnection((s) => s.connection?.projectId);
  useEditorStore((s) => s.sessions);
  useRcEditor((s) => s.session);
  return <footer data-testid="status-bar" className="flex h-8 shrink-0 items-center justify-between gap-4 border-t border-line bg-panel px-4 text-xs text-fg-muted">
    <span className="flex items-center gap-2"><span aria-hidden="true" className="h-2 w-2 rounded-full bg-success" />{t("connection.connectedTo", { project })}</span>
    <span role="status">{hasUnsavedChanges() ? t("editor.unsaved") : t("layout.saved")}</span>
  </footer>;
}
