import type { ReactNode } from "react";
import { withShortcut } from "../../hooks/shortcuts";
import { useTranslation } from "react-i18next";
import { describeError, technicalText } from "../errors/describeError";
import { TechnicalDetails } from "../errors/TechnicalDetails";
import { useEditorStore } from "../../store/documentEditor";
import type { Draft } from "./editorModel";
import type { SaveState } from "./useDocumentEditor";

interface Props {
  draft: Draft;
  dirty: boolean;
  /** A table cell still holds an uncommitted edit. */
  pending?: boolean;
  canSave: boolean;
  state: SaveState;
  updateTime?: string;
  onSave(): void;
  onDiscard(): void;
  /** Document actions shown at the end of the options bar (new subcollection, import, delete). */
  actions?: ReactNode;
}

/**
 * Options bar under the toolbar (discard, save mode, state, document actions) followed by the save
 * messages, so everything about the document sits above its content.
 */
export function SaveBar({ draft, dirty, pending = false, state, updateTime, onDiscard, actions }: Props) {
  const { t } = useTranslation();
  const mode = useEditorStore((s) => s.mode);
  const setMode = useEditorStore((s) => s.setMode);

  return (
    <>
      <div className="options-bar">
        <button
          type="button"
          data-testid="discard-button"
          disabled={!dirty}
          onClick={onDiscard}
          className="btn"
        >
          {t("editor.discard")}
        </button>
        <label className="flex items-center gap-1.5 text-sm">
          {t("editor.saveMode")}
          <select
            data-testid="save-mode"
            value={mode}
            onChange={(e) => setMode(e.target.value as "modified" | "full")}
            className="rounded-md border border-line bg-surface px-1.5 py-0.5"
          >
            <option value="modified">{t("editor.modeModified")}</option>
            <option value="full">{t("editor.modeFull")}</option>
          </select>
        </label>
        {(dirty || pending) && (
          <span data-testid="dirty-indicator" className="text-sm text-warning">
            {t("editor.unsaved")}
          </span>
        )}
        {updateTime && (
          <span data-testid="update-time" className="font-mono text-xs text-fg-muted">
            {t("editor.updateTime", { time: updateTime })}
          </span>
        )}
        {actions && <div className="ml-auto flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      <div className="space-y-2 px-[18px] pt-3 empty:hidden">
      {!draft.ok && (
        <p role="alert" data-testid="draft-error" className="text-sm text-danger ">
          {t("editor.invalidBlocked")} {t(draft.error.key, draft.error.params)}
        </p>
      )}
      {state.phase === "saved" && !dirty && !pending && (
        <p role="status" data-testid="save-status" className="text-sm text-success ">
          {t("editor.saved", { time: state.updateTime })}
        </p>
      )}
      {state.phase === "error" && (
        <div role="alert" data-testid="save-error" className="space-y-1 text-sm text-danger ">
          <p data-testid="save-error-message">{t("editor.saveFailed", { message: describeError(t, state.error) })}</p>
          {technicalText(state.error) && <TechnicalDetails text={technicalText(state.error)!} testId="save-error-technical" />}
        </div>
      )}
      {state.phase === "reloadError" && (
        <div role="alert" data-testid="reload-error" className="space-y-1 text-sm text-danger ">
          <p>{t("editor.reloadFailed", { message: describeError(t, state.error) })}</p>
          {technicalText(state.error) && <TechnicalDetails text={technicalText(state.error)!} testId="reload-error-technical" />}
        </div>
      )}
      </div>
    </>
  );
}

export function SaveButton({ canSave, state, onSave }: Pick<Props, "canSave" | "state" | "onSave">) {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      data-testid="save-button"
      title={withShortcut(t("editor.save"), "save")}
      disabled={!canSave}
      onClick={onSave}
      className="btn-primary"
    >
      {state.phase === "saving" ? t("editor.saving") : t("editor.save")}
    </button>
  );
}
