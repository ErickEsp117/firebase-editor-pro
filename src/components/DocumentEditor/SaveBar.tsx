import { useTranslation } from "react-i18next";
import { describeError, technicalText } from "../errors/describeError";
import { TechnicalDetails } from "../errors/TechnicalDetails";
import { useEditorStore } from "../../store/documentEditor";
import type { Draft } from "./editorModel";
import type { SaveState } from "./useDocumentEditor";

interface Props {
  draft: Draft;
  dirty: boolean;
  canSave: boolean;
  state: SaveState;
  updateTime?: string;
  onSave(): void;
  onDiscard(): void;
}

export function SaveBar({ draft, dirty, canSave, state, updateTime, onSave, onDiscard }: Props) {
  const { t } = useTranslation();
  const mode = useEditorStore((s) => s.mode);
  const setMode = useEditorStore((s) => s.setMode);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          data-testid="save-button"
          disabled={!canSave}
          onClick={onSave}
          className="rounded bg-blue-700 px-3 py-1 text-sm text-white disabled:opacity-50"
        >
          {state.phase === "saving" ? t("editor.saving") : t("editor.save")}
        </button>
        <button
          type="button"
          data-testid="discard-button"
          disabled={!dirty}
          onClick={onDiscard}
          className="rounded border border-slate-300 px-3 py-1 text-sm disabled:opacity-50 dark:border-slate-600"
        >
          {t("editor.discard")}
        </button>
        <label className="flex items-center gap-1 text-xs">
          {t("editor.saveMode")}
          <select
            data-testid="save-mode"
            value={mode}
            onChange={(e) => setMode(e.target.value as "modified" | "full")}
            className="rounded border border-slate-300 px-1 py-0.5 dark:border-slate-600 dark:bg-slate-900"
          >
            <option value="modified">{t("editor.modeModified")}</option>
            <option value="full">{t("editor.modeFull")}</option>
          </select>
        </label>
        {dirty && (
          <span data-testid="dirty-indicator" className="text-xs text-amber-700 dark:text-amber-300">
            {t("editor.unsaved")}
          </span>
        )}
        {updateTime && (
          <span data-testid="update-time" className="font-mono text-xs text-slate-500">
            {t("editor.updateTime", { time: updateTime })}
          </span>
        )}
      </div>
      {!draft.ok && (
        <p role="alert" data-testid="draft-error" className="text-sm text-red-700 dark:text-red-300">
          {t("editor.invalidBlocked")} {t(draft.error.key, draft.error.params)}
        </p>
      )}
      {state.phase === "saved" && (
        <p role="status" data-testid="save-status" className="text-sm text-emerald-700 dark:text-emerald-300">
          {t("editor.saved", { time: state.updateTime })}
        </p>
      )}
      {state.phase === "error" && (
        <div role="alert" data-testid="save-error" className="space-y-1 text-sm text-red-700 dark:text-red-300">
          <p data-testid="save-error-message">{t("editor.saveFailed", { message: describeError(t, state.error) })}</p>
          {technicalText(state.error) && <TechnicalDetails text={technicalText(state.error)!} testId="save-error-technical" />}
        </div>
      )}
    </div>
  );
}
