import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { RemoteConfigTemplate } from "../../core";
import { BTN, BTN_DANGER, Modal } from "../Firestore/crud/Modal";
import { RC_TAG_COLORS, TAG_COLOR_HEX, addCondition, deleteCondition, replaceCondition } from "./rcTableModel";

type Obj = Record<string, unknown>;
type Update = (update: (current: RemoteConfigTemplate) => RemoteConfigTemplate) => void;

interface Props {
  /** The condition being edited, or null to create one (added last: evaluated after the others). */
  condition: Obj | null;
  existingNames: string[];
  /** Names that parameters reference but no condition defines; a rename onto one would merge two values. */
  danglingNames?: string[];
  /** How many parameters use the condition; a used condition cannot be deleted. */
  usage: number;
  onChange: Update;
  onClose(): void;
}

/** Edits a condition with its full expression visible; a rename also renames it in every parameter. */
export function RcConditionDialog({ condition, existingNames, danglingNames = [], usage, onChange, onClose }: Props) {
  const { t } = useTranslation();
  const originalName = condition ? (condition.name as string) : null;
  const [name, setName] = useState(originalName ?? "");
  const [expression, setExpression] = useState(typeof condition?.expression === "string" ? condition.expression : "");
  const [color, setColor] = useState(typeof condition?.tagColor === "string" ? condition.tagColor : "");

  // Where focus goes on close when the edit button that opened the dialog is gone (renamed or deleted).
  const applied = useRef<string | null>(null);
  const returnFocus = () =>
    Array.from(document.querySelectorAll<HTMLElement>('[data-testid^="rc-cond-edit:"]')).find((el) => el.dataset.testid === `rc-cond-edit:${applied.current}`) ??
    document.querySelector<HTMLElement>('[data-testid="rc-cond-new"]');
  const trimmed = name.trim();
  const nameError = !trimmed
    ? t("rc.visual.conditionNameRequired")
    : trimmed !== originalName && (existingNames.includes(trimmed) || (originalName !== null && danglingNames.includes(trimmed)))
      ? t("rc.table.duplicateCondition")
      : null;
  const expressionError = expression.trim() ? null : t("rc.visual.expressionRequired");
  const canApply = !nameError && !expressionError;

  const apply = () => {
    if (!canApply) return;
    const next = { name: trimmed, expression: expression.trim(), tagColor: color || undefined };
    applied.current = trimmed;
    onChange((cur) => (originalName === null ? addCondition(cur, next.name, next.expression, next.tagColor) : replaceCondition(cur, originalName, next)));
    onClose();
  };

  const colors = [...RC_TAG_COLORS, ...(color && !(RC_TAG_COLORS as readonly string[]).includes(color) ? [color] : [])];
  return (
    <Modal
      titleId="rc-cond-dialog-title"
      testId="rc-cond-dialog"
      title={originalName ? t("rc.visual.editCondition", { name: originalName }) : t("rc.visual.newCondition")}
      onClose={onClose}
      role="dialog"
      size="wide"
      returnFocus={returnFocus}
    >
      <label className="block space-y-1 text-sm">
        <span className="font-medium">{t("rc.table.colCondition")}</span>
        <input
          data-testid="rc-cond-name"
          value={name}
          autoFocus={!condition}
          onChange={(e) => setName(e.target.value)}
          aria-invalid={!!nameError}
          className={`w-full rounded-md border bg-surface px-3 py-2 font-mono ${nameError ? "border-danger" : "border-line"}`}
        />
        {nameError && <span role="alert" className="block text-danger">{nameError}</span>}
        {originalName && trimmed !== originalName && usage > 0 && (
          <span className="block text-xs text-fg-muted">{t("rc.visual.renameUpdates", { count: usage })}</span>
        )}
      </label>
      <label className="block space-y-1 text-sm">
        <span className="font-medium">{t("rc.table.colExpression")}</span>
        <textarea
          data-testid="rc-cond-expression"
          value={expression}
          rows={Math.min(10, Math.max(3, Math.ceil(expression.length / 70)))}
          onChange={(e) => setExpression(e.target.value)}
          placeholder={t("rc.table.newConditionExpression")}
          aria-invalid={!!expressionError}
          className={`w-full rounded-md border bg-surface px-3 py-2 font-mono ${expressionError ? "border-danger" : "border-line"}`}
        />
        {expressionError && <span role="alert" className="block text-danger">{expressionError}</span>}
      </label>
      <fieldset className="space-y-2 text-sm">
        <legend className="font-medium">{t("rc.table.colColor")}</legend>
        <div role="radiogroup" aria-label={t("rc.table.colColor")} className="flex flex-wrap gap-2">
          {["", ...colors].map((c) => (
            <button
              key={c || "none"}
              type="button"
              role="radio"
              aria-checked={color === c}
              data-testid={`rc-cond-color:${c || "none"}`}
              title={t(`rc.table.colors.${c || "none"}`, { defaultValue: c })}
              aria-label={t(`rc.table.colors.${c || "none"}`, { defaultValue: c })}
              onClick={() => setColor(c)}
              className={`flex h-8 items-center gap-1.5 rounded-full border px-2.5 text-xs ${color === c ? "border-accent ring-2 ring-accent/40" : "border-line"}`}
            >
              <span aria-hidden="true" className="h-3 w-3 rounded-full" style={{ background: c ? (TAG_COLOR_HEX[c] ?? "var(--text-secondary)") : "transparent", border: c ? undefined : "1px dashed var(--text-secondary)" }} />
              {t(`rc.table.colors.${c || "none"}`, { defaultValue: c })}
            </button>
          ))}
        </div>
      </fieldset>
      <div className="flex flex-wrap items-center gap-2 border-t border-line pt-4">
        {originalName && (
          <button
            type="button"
            data-testid="rc-cond-delete"
            className={BTN_DANGER}
            disabled={usage > 0}
            title={usage > 0 ? t("rc.table.conditionInUse", { count: usage, name: originalName }) : undefined}
            onClick={() => {
              onChange((cur) => deleteCondition(cur, originalName));
              onClose();
            }}
          >
            {t("rc.visual.deleteCondition")}
          </button>
        )}
        {originalName && usage > 0 && <span className="text-xs text-fg-muted">{t("rc.table.conditionInUse", { count: usage, name: originalName })}</span>}
        <span className="ml-auto" />
        <button type="button" data-testid="rc-cond-cancel" className={BTN} onClick={onClose}>
          {t("connection.cancel")}
        </button>
        <button type="button" data-testid="rc-cond-apply" className="btn-primary" disabled={!canApply} onClick={apply}>
          {t("rc.visual.apply")}
        </button>
      </div>
    </Modal>
  );
}
