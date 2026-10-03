import { Plus, X } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { RemoteConfigTemplate } from "../../core";
import { BTN, BTN_DANGER, Modal } from "../Firestore/crud/Modal";
import { IconButton } from "../IconButton";
import { prettyJson, RcValueField } from "./RcValueField";
import {
  RC_VALUE_TYPES,
  TAG_COLOR_HEX,
  initialValue,
  isObj,
  parameterExists,
  replaceParameter,
  validValue,
  valueKind,
  valueText,
  type ParamRow,
  type RcValueType,
} from "./rcTableModel";

type Obj = Record<string, unknown>;
type Update = (update: (current: RemoteConfigTemplate) => RemoteConfigTemplate) => void;

interface Props {
  template: RemoteConfigTemplate;
  /** The parameter being edited, or null to create a top-level one. */
  row: ParamRow | null;
  conditions: Obj[];
  onChange: Update;
  onDelete?(): void;
  onClose(): void;
}

/** Remote Config accepts letters, digits and underscores, starting with a letter or an underscore. */
const KEY = /^[A-Za-z_][A-Za-z0-9_]{0,255}$/;

/**
 * Edits one parameter in a roomy dialog and applies everything at once. Fields the dialog does not
 * know (and personalization or rollout values) are carried over untouched.
 */
export function RcParameterDialog({ template, row, conditions, onChange, onDelete, onClose }: Props) {
  const { t } = useTranslation();
  const param: Obj = row ? row.param : {};
  const [key, setKey] = useState(row?.key ?? "");
  const [type, setType] = useState<string>(typeof param.valueType === "string" ? param.valueType : row ? "" : "STRING");
  const [description, setDescription] = useState(typeof param.description === "string" ? param.description : "");
  const [defaultValue, setDefaultValue] = useState<Obj | undefined>(
    row ? (isObj(param.defaultValue) ? param.defaultValue : undefined) : { value: "" },
  );
  const conditionNames = conditions.map((c) => c.name as string);
  const initialConditional = isObj(param.conditionalValues) ? param.conditionalValues : {};
  const [conditional, setConditional] = useState<[string, unknown][]>(() => {
    const known = conditionNames.filter((n) => Object.prototype.hasOwnProperty.call(initialConditional, n));
    const unknown = Object.keys(initialConditional).filter((n) => !conditionNames.includes(n));
    return [...known, ...unknown].map((n) => [n, initialConditional[n]]);
  });
  const [pick, setPick] = useState("");
  const available = conditionNames.filter((n) => !conditional.some(([c]) => c === n));

  const trimmedKey = key.trim();
  const keyChanged = trimmedKey !== row?.key;
  const keyError = !trimmedKey
    ? t("rc.visual.keyRequired")
    : keyChanged && !KEY.test(trimmedKey)
      ? t("rc.visual.keyInvalid")
      : keyChanged && parameterExists(template, trimmedKey)
        ? t("rc.table.duplicateParameter")
        : null;
  const values = [defaultValue, ...conditional.map(([, v]) => v)];
  const valuesOk = values.every((v) => valueKind(v) !== "value" || validValue(type || undefined, valueText(v)));
  const canApply = !keyError && valuesOk;

  // A JSON value that was only reformatted (or just viewed formatted) keeps its original text. Text and
  // number values are kept exactly as typed ("2.10" and "2.1" are different versions).
  const sameJson = (original: unknown, edited: Obj | undefined): Obj | undefined => {
    if (type !== "JSON" || !edited || valueKind(original) !== "value" || valueKind(edited) !== "value") return edited;
    const a = prettyJson(valueText(original));
    return a !== null && a === prettyJson(valueText(edited)) ? (original as Obj) : edited;
  };

  const apply = () => {
    if (!canApply) return;
    const next: Obj = { ...param };
    delete next.defaultValue;
    delete next.conditionalValues;
    delete next.valueType;
    delete next.description;
    if (defaultValue !== undefined) next.defaultValue = sameJson(param.defaultValue, defaultValue);
    if (conditional.length > 0) {
      next.conditionalValues = Object.fromEntries(
        conditional.map(([name, value]) => [name, sameJson(initialConditional[name], value as Obj | undefined)]),
      );
    }
    if (type) next.valueType = type;
    if (description.trim()) next.description = description;
    const ref = row ? { key: row.key, group: row.group } : { key: trimmedKey, group: null };
    onChange((cur) => replaceParameter(cur, ref, trimmedKey, next));
    onClose();
  };

  const title = row ? t("rc.visual.editParameter", { name: row.key }) : t("rc.visual.newParameter");
  return (
    <Modal titleId="rc-param-dialog-title" testId="rc-param-dialog" title={title} onClose={onClose} role="dialog" size="wide">
      <div className="grid gap-4 sm:grid-cols-[1fr_12rem]">
        <label className="block space-y-1 text-sm">
          <span className="font-medium">{t("rc.table.colParameter")}</span>
          <input
            data-testid="rc-param-key"
            value={key}
            autoFocus={!row}
            onChange={(e) => setKey(e.target.value)}
            aria-invalid={!!keyError}
            className={`w-full rounded-md border bg-surface px-3 py-2 font-mono ${keyError ? "border-danger" : "border-line"}`}
          />
          {keyError && <span role="alert" className="block text-danger">{keyError}</span>}
          {row?.group && <span className="block text-xs text-fg-muted">{t("rc.table.group", { group: row.group })}</span>}
        </label>
        <label className="block space-y-1 text-sm">
          <span className="font-medium">{t("rc.table.colType")}</span>
          <select data-testid="rc-param-type" value={type} onChange={(e) => setType(e.target.value)} className="w-full rounded-md border border-line bg-surface px-3 py-2">
            {!type && <option value="">{t("rc.table.typeUnspecified")}</option>}
            {type && !(RC_VALUE_TYPES as readonly string[]).includes(type) && <option value={type}>{type}</option>}
            {RC_VALUE_TYPES.map((v) => (
              <option key={v} value={v}>{t(`rc.table.types.${v}`)}</option>
            ))}
          </select>
        </label>
      </div>
      <label className="block space-y-1 text-sm">
        <span className="font-medium">{t("rc.table.colDescription")}</span>
        <textarea
          data-testid="rc-param-description"
          value={description}
          rows={Math.min(6, Math.max(2, description.split("\n").length))}
          onChange={(e) => setDescription(e.target.value)}
          className="w-full rounded-md border border-line bg-surface px-3 py-2"
        />
      </label>

      <section className="space-y-2" aria-labelledby="rc-param-default-title">
        <h4 id="rc-param-default-title" className="text-sm font-medium">{t("rc.table.colDefault")}</h4>
        <RcValueField value={defaultValue} type={type || undefined} label={t("rc.table.valueOf", { name: trimmedKey || "…" })} testId="rc-param-default" onChange={setDefaultValue} allowNone={!!row && defaultValue === undefined} />
      </section>

      <section className="space-y-3" aria-labelledby="rc-param-cond-title">
        <h4 id="rc-param-cond-title" className="text-sm font-medium">{t("rc.table.colConditional")}</h4>
        {conditional.length === 0 && <p className="text-sm text-fg-muted">{t("rc.visual.noConditionalValues")}</p>}
        {conditional.map(([name, value], i) => {
          const cond = conditions.find((c) => c.name === name);
          return (
            <div key={name} data-testid={`rc-param-cond-row:${name}`} className="space-y-2 rounded-lg border border-line p-3">
              <div className="flex items-center gap-2">
                <ConditionChip name={name} color={typeof cond?.tagColor === "string" ? cond.tagColor : undefined} missing={!cond} />
                <IconButton
                  data-testid={`rc-param-cond-remove:${name}`}
                  label={t("rc.table.removeConditional", { name: trimmedKey || "…", condition: name })}
                  className="icon-button ml-auto text-danger hover:bg-danger/10"
                  onClick={() => setConditional(conditional.filter((_, j) => j !== i))}
                >
                  <X size={16} aria-hidden="true" />
                </IconButton>
              </div>
              <RcValueField
                value={value}
                type={type || undefined}
                label={t("rc.table.conditionalValueOf", { name: trimmedKey || "…", condition: name })}
                testId={`rc-param-cond:${name}`}
                onChange={(next) => setConditional(conditional.map((entry, j) => (j === i ? [name, next ?? { value: "" }] : entry)))}
              />
            </div>
          );
        })}
        {available.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <select
              data-testid="rc-param-add-cond"
              aria-label={t("rc.table.chooseCondition", { name: trimmedKey || "…" })}
              value={available.includes(pick) ? pick : ""}
              onChange={(e) => setPick(e.target.value)}
              className="rounded-md border border-line bg-surface px-3 py-2 text-sm"
            >
              <option value="">{t("rc.table.addConditionalPlaceholder")}</option>
              {available.map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
            <button
              type="button"
              data-testid="rc-param-add-cond-button"
              disabled={!available.includes(pick)}
              className="btn flex items-center gap-1"
              onClick={() => {
                const seed = valueKind(defaultValue) === "value" ? { value: valueText(defaultValue) } : { value: initialValue(((type || "STRING") as RcValueType)) };
                const ordered = [...conditional, [pick, seed] as [string, unknown]].sort(
                  (a, b) => conditionNames.indexOf(a[0]) - conditionNames.indexOf(b[0]),
                );
                setConditional(ordered);
                setPick("");
              }}
            >
              <Plus size={14} aria-hidden="true" />
              {t("rc.visual.addConditionalValue")}
            </button>
          </div>
        )}
      </section>

      <div className="flex flex-wrap items-center gap-2 border-t border-line pt-4">
        {onDelete && (
          <button type="button" data-testid="rc-param-delete" className={BTN_DANGER} onClick={() => { onDelete(); onClose(); }}>
            {t("rc.visual.deleteParameter")}
          </button>
        )}
        <span className="ml-auto" />
        <button type="button" data-testid="rc-param-cancel" className={BTN} onClick={onClose}>
          {t("connection.cancel")}
        </button>
        <button type="button" data-testid="rc-param-apply" className="btn-primary" disabled={!canApply} onClick={apply}>
          {t("rc.visual.apply")}
        </button>
      </div>
      <p className="text-xs text-fg-muted">{t("rc.visual.applyHint")}</p>
    </Modal>
  );
}

/** Condition name with its tag color, as in the Firebase console. */
export function ConditionChip({ name, color, missing = false }: { name: string; color?: string; missing?: boolean }) {
  const hex = color ? TAG_COLOR_HEX[color] : undefined;
  return (
    <span className={`inline-flex min-w-0 items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium ${missing ? "border-danger text-danger" : "border-line"}`}>
      <span aria-hidden="true" className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: hex ?? "var(--text-secondary)" }} />
      <span className="truncate font-mono">{name}</span>
    </span>
  );
}
