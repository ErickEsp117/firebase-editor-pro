import { ArrowDown, ArrowUp, Plus, Trash2, X } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { RemoteConfigTemplate } from "../../core";
import { CommitInput } from "../DocumentEditor/CommitInput";
import { IconButton } from "../IconButton";
import {
  RC_TAG_COLORS,
  RC_VALUE_TYPES,
  addCondition,
  addParameter,
  conditionUsage,
  deleteCondition,
  deleteParameter,
  editableSections,
  initialValue,
  isObj,
  listConditions,
  listParameters,
  moveCondition,
  parameterExists,
  setConditionField,
  setConditionalValue,
  setDefaultValue,
  setParamField,
  validValue,
  valueKind,
  valueText,
  type ParamRow,
  type RcValueType,
} from "./rcTableModel";

type Update = (update: (current: RemoteConfigTemplate) => RemoteConfigTemplate) => void;

interface Props {
  template: RemoteConfigTemplate;
  /** Receives an updater applied to the latest draft, so quick successive edits never overwrite each other. */
  onChange: Update;
}

const SELECT = "rounded-md border border-line bg-surface px-1.5 py-1 text-sm";
const ICON_DANGER = "icon-button text-danger hover:bg-danger/10 disabled:opacity-40";

/** Table view of the Remote Config template: parameters (including groups) and the ordered conditions. */
export function RcTableView({ template, onChange }: Props) {
  const { t } = useTranslation();
  const params = listParameters(template);
  const conditions = listConditions(template);
  const conditionNames = conditions.map((c) => c.name as string);
  const editable = editableSections(template);

  return (
    <div data-testid="rc-table-view" className="min-w-0 space-y-8">
      <section aria-labelledby="rc-params-title" className="space-y-3">
        <h3 id="rc-params-title" className="text-base font-semibold">{t("rc.table.parameters")}</h3>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[600px] table-fixed border-collapse text-sm">
            <thead>
              <tr className="text-left text-fg-muted">
                <th className="w-[30%] pb-2 font-medium">{t("rc.table.colParameter")} · {t("rc.table.colDescription")}</th>
                <th className="w-24 pb-2 font-medium">{t("rc.table.colType")}</th>
                <th className="pb-2 font-medium">{t("rc.table.colDefault")}</th>
                <th className="w-40 pb-2 font-medium">{t("rc.table.colConditional")}</th>
                <th className="w-11 pb-2" />
              </tr>
            </thead>
            <tbody>
              {params.length === 0 && (
                <tr>
                  <td colSpan={5} data-testid="rc-table-no-params" className="border-t border-line py-3 text-fg-muted">
                    {t("rc.table.noParameters")}
                  </td>
                </tr>
              )}
              {params.map((row) => (
                <ParamRows key={`${row.group ?? ""}/${row.key}`} row={row} conditionNames={conditionNames} onChange={onChange} />
              ))}
            </tbody>
          </table>
        </div>
        {editable.parameters ? <AddParameter template={template} onChange={onChange} /> : <p role="note" className="text-sm text-warning">{t("rc.table.fixInJson")}</p>}
      </section>

      <section aria-labelledby="rc-conds-title" className="space-y-3">
        <div>
          <h3 id="rc-conds-title" className="text-base font-semibold">{t("rc.table.conditions")}</h3>
          <p className="text-sm text-fg-muted">{t("rc.table.conditionOrderHint")}</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] table-fixed border-collapse text-sm">
            <thead>
              <tr className="text-left text-fg-muted">
                <th className="w-10 pb-2 font-medium">#</th>
                <th className="w-[24%] pb-2 font-medium">{t("rc.table.colCondition")}</th>
                <th className="pb-2 font-medium">{t("rc.table.colExpression")}</th>
                <th className="w-36 pb-2 font-medium">{t("rc.table.colColor")}</th>
                <th className="w-[84px] pb-2 font-medium">{t("rc.table.colOrder")}</th>
                <th className="w-11 pb-2" />
              </tr>
            </thead>
            <tbody>
              {conditions.length === 0 && (
                <tr>
                  <td colSpan={6} data-testid="rc-table-no-conditions" className="border-t border-line py-3 text-fg-muted">
                    {t("rc.table.noConditions")}
                  </td>
                </tr>
              )}
              {conditions.map((c, i) => (
                <ConditionRow key={c.name as string} index={i} total={conditions.length} condition={c} usage={conditionUsage(template, c.name as string)} onChange={onChange} />
              ))}
            </tbody>
          </table>
        </div>
        {editable.conditions ? <AddCondition existing={conditionNames} onChange={onChange} /> : <p role="note" className="text-sm text-warning">{t("rc.table.fixInJson")}</p>}
      </section>
    </div>
  );
}

function ParamRows({ row, conditionNames, onChange }: { row: ParamRow; conditionNames: string[]; onChange: Update }) {
  const { t } = useTranslation();
  const { key, group, param } = row;
  const ref = { key, group };
  const id = group ? `${group}/${key}` : key;
  const type = typeof param.valueType === "string" ? param.valueType : undefined;
  const values = isObj(param.conditionalValues) ? param.conditionalValues : {};
  const has = (n: string) => Object.prototype.hasOwnProperty.call(values, n);
  const used = [...conditionNames.filter(has), ...Object.keys(values).filter((n) => !conditionNames.includes(n))];
  const available = conditionNames.filter((n) => !has(n));
  const [pick, setPick] = useState("");
  const firstValue = (): Record<string, unknown> =>
    valueKind(param.defaultValue) === "value" ? { value: valueText(param.defaultValue) } : { value: initialValue((type as RcValueType) ?? "STRING") };

  return (
    <>
      <tr data-testid={`rc-param:${id}`} className="border-t border-line align-top">
        <td className="space-y-1 py-2 pr-3">
          <span className="block break-all font-mono">{key}</span>
          {group && <span className="block text-xs text-fg-muted">{t("rc.table.group", { group })}</span>}
          <CommitInput
            scope="rc"
            value={typeof param.description === "string" ? param.description : ""}
            label={t("rc.table.descriptionOf", { name: key })}
            testId={`rc-param-desc:${id}`}
            className="w-full font-sans text-xs"
            onCommit={(s) => onChange((cur) => setParamField(cur, ref, "description", s))}
          />
        </td>
        <td className="py-2 pr-3">
          <select
            data-testid={`rc-param-type:${id}`}
            aria-label={t("rc.table.typeOf", { name: key })}
            value={type ?? ""}
            onChange={(e) => onChange((cur) => setParamField(cur, ref, "valueType", e.target.value || undefined))}
            className={`${SELECT} w-full`}
          >
            {!type && <option value="">{t("rc.table.typeUnspecified")}</option>}
            {type && !(RC_VALUE_TYPES as readonly string[]).includes(type) && <option value={type}>{type}</option>}
            {RC_VALUE_TYPES.map((v) => (
              <option key={v} value={v}>{t(`rc.table.types.${v}`)}</option>
            ))}
          </select>
        </td>
        <td className="py-2 pr-3">
          <RcValueEditor
            value={param.defaultValue}
            type={type}
            label={t("rc.table.valueOf", { name: key })}
            testId={`rc-param-default:${id}`}
            onChange={(v) => onChange((cur) => setDefaultValue(cur, ref, v))}
          />
        </td>
        <td className="py-2 pr-3">
          {available.length > 0 ? (
            // Choosing a condition and adding it are separate steps, so browsing the list never edits.
            <div className="flex min-w-0 items-center gap-1">
              <select
                data-testid={`rc-param-add-cond:${id}`}
                aria-label={t("rc.table.chooseCondition", { name: key })}
                title={t("rc.table.chooseCondition", { name: key })}
                value={available.includes(pick) ? pick : ""}
                onChange={(e) => setPick(e.target.value)}
                className={`${SELECT} min-w-0 flex-1`}
              >
                <option value="">{t("rc.table.addConditionalPlaceholder")}</option>
                {available.map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
              <IconButton
                data-testid={`rc-param-add-cond-button:${id}`}
                label={t("rc.table.addConditional", { name: key })}
                disabled={!available.includes(pick)}
                onClick={() => {
                  const condition = pick;
                  setPick("");
                  onChange((cur) => setConditionalValue(cur, ref, condition, firstValue()));
                }}
              >
                <Plus size={16} aria-hidden="true" />
              </IconButton>
            </div>
          ) : (
            used.length === 0 && <span className="text-fg-muted">—</span>
          )}
        </td>
        <td className="py-1.5 text-right">
          <IconButton
            data-testid={`rc-param-delete:${id}`}
            label={t("rc.table.deleteParameter", { name: key })}
            onClick={() => onChange((cur) => deleteParameter(cur, ref))}
            className={ICON_DANGER}
          >
            <Trash2 size={16} aria-hidden="true" />
          </IconButton>
        </td>
      </tr>
      {used.map((condition) => (
        <tr key={condition} data-testid={`rc-param-cond-row:${id}:${condition}`} className="align-top">
          <td colSpan={2} className="py-1 pl-4 pr-3 text-fg-muted">
            <span aria-hidden="true">↳ </span>
            <span className="break-all font-mono">{condition}</span>
          </td>
          <td className="py-1 pr-3">
            <RcValueEditor
              value={values[condition]}
              type={type}
              label={t("rc.table.conditionalValueOf", { name: key, condition })}
              testId={`rc-param-cond:${id}:${condition}`}
              onChange={(v) => onChange((cur) => setConditionalValue(cur, ref, condition, v))}
            />
          </td>
          <td />
          <td className="py-1 text-right">
            <IconButton
              data-testid={`rc-param-cond-remove:${id}:${condition}`}
              label={t("rc.table.removeConditional", { name: key, condition })}
              onClick={() => onChange((cur) => setConditionalValue(cur, ref, condition, undefined))}
              className={ICON_DANGER}
            >
              <X size={16} aria-hidden="true" />
            </IconButton>
          </td>
        </tr>
      ))}
    </>
  );
}

/**
 * Editor for one Remote Config value: an explicit value (typed by the parameter's valueType) or the
 * app's in-app default. Personalization and rollout values are kept as they are and edited in JSON.
 */
function RcValueEditor({ value, type, label, testId, onChange }: {
  value: unknown;
  type: string | undefined;
  label: string;
  testId: string;
  onChange(next: Record<string, unknown>): void;
}) {
  const { t } = useTranslation();
  const kind = valueKind(value);
  const text = valueText(value);
  // Switching to the in-app default and back restores the value the user had.
  const [lastText, setLastText] = useState<string | null>(kind === "value" ? text : null);
  if (kind === "value" && text !== lastText) setLastText(text);
  if (kind === "special") {
    return <span data-testid={`${testId}-special`} className="text-xs text-fg-muted">{t("rc.table.specialValue")}</span>;
  }
  return (
    <div className="flex min-w-0 items-center gap-1.5">
      <select
        data-testid={`${testId}-mode`}
        aria-label={t("rc.table.valueModeOf", { name: label })}
        value={kind}
        onChange={(e) => onChange(e.target.value === "inAppDefault" ? { useInAppDefault: true } : { value: lastText ?? initialValue((type as RcValueType) ?? "STRING") })}
        className={`${SELECT} w-[5.75rem] shrink-0`}
      >
        {kind === "none" && <option value="none" disabled>{t("rc.table.modeNone")}</option>}
        <option value="value">{t("rc.table.modeValue")}</option>
        <option value="inAppDefault">{t("rc.table.modeInApp")}</option>
      </select>
      {kind === "value" &&
        (type === "BOOLEAN" ? (
          <select data-testid={testId} aria-label={label} value={text} onChange={(e) => onChange({ value: e.target.value })} className={SELECT}>
            {text !== "true" && text !== "false" && <option value={text}>{text}</option>}
            <option value="true">true</option>
            <option value="false">false</option>
          </select>
        ) : (
          <CommitInput
            scope="rc"
            value={text}
            label={label}
            testId={testId}
            className="w-full"
            validate={(s) => validValue(type, s)}
            onCommit={(s) => onChange({ value: s })}
          />
        ))}
    </div>
  );
}

function ConditionRow({ condition, index, total, usage, onChange }: {
  condition: Record<string, unknown>;
  index: number;
  total: number;
  usage: number;
  onChange: Update;
}) {
  const { t } = useTranslation();
  const name = condition.name as string;
  const color = typeof condition.tagColor === "string" ? condition.tagColor : "";
  return (
    <tr data-testid={`rc-condition:${name}`} className="border-t border-line align-top">
      <td className="py-2 pr-2 text-fg-muted">{index + 1}</td>
      <td className="py-2 pr-3"><span className="break-all font-mono">{name}</span></td>
      <td className="py-2 pr-3">
        <CommitInput
          scope="rc"
          value={typeof condition.expression === "string" ? condition.expression : ""}
          label={t("rc.table.expressionOf", { name })}
          testId={`rc-cond-expr:${name}`}
          className="w-full"
          validate={(s) => s.trim() !== ""}
          onCommit={(s) => onChange((cur) => setConditionField(cur, name, "expression", s))}
        />
      </td>
      <td className="py-2 pr-3">
        <select
          data-testid={`rc-cond-color:${name}`}
          aria-label={t("rc.table.colorOf", { name })}
          value={color}
          onChange={(e) => onChange((cur) => setConditionField(cur, name, "tagColor", e.target.value || undefined))}
          className={`${SELECT} w-full`}
        >
          <option value="">{t("rc.table.colors.none")}</option>
          {color && !(RC_TAG_COLORS as readonly string[]).includes(color) && <option value={color}>{color}</option>}
          {RC_TAG_COLORS.map((c) => (
            <option key={c} value={c}>{t(`rc.table.colors.${c}`)}</option>
          ))}
        </select>
      </td>
      <td className="py-1.5 pr-2">
        <div className="flex">
          <IconButton data-testid={`rc-cond-up:${name}`} label={t("rc.table.moveUp", { name })} disabled={index === 0}
            onClick={() => onChange((cur) => moveCondition(cur, name, -1))}>
            <ArrowUp size={16} aria-hidden="true" />
          </IconButton>
          <IconButton data-testid={`rc-cond-down:${name}`} label={t("rc.table.moveDown", { name })} disabled={index === total - 1}
            onClick={() => onChange((cur) => moveCondition(cur, name, 1))}>
            <ArrowDown size={16} aria-hidden="true" />
          </IconButton>
        </div>
      </td>
      <td className="py-1.5 text-right">
        <IconButton
          data-testid={`rc-cond-delete:${name}`}
          label={usage > 0 ? t("rc.table.conditionInUse", { count: usage, name }) : t("rc.table.deleteCondition", { name })}
          disabled={usage > 0}
          onClick={() => onChange((cur) => deleteCondition(cur, name))}
          className={ICON_DANGER}
        >
          <Trash2 size={16} aria-hidden="true" />
        </IconButton>
      </td>
    </tr>
  );
}

function AddParameter({ template, onChange }: { template: RemoteConfigTemplate; onChange: Update }) {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [type, setType] = useState<RcValueType>("STRING");
  const [value, setValue] = useState("");
  const key = name.trim();
  const duplicate = key !== "" && parameterExists(template, key);
  const valueOk = validValue(type, value);
  const canAdd = key !== "" && !duplicate && valueOk;
  const add = () => {
    if (!canAdd) return;
    onChange((cur) => addParameter(cur, key, type, value));
    setName("");
    setValue(initialValue(type));
  };
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm" data-testid="rc-add-param">
      <input
        type="text"
        data-testid="rc-add-param-name"
        aria-label={t("rc.table.newParameterName")}
        placeholder={t("rc.table.newParameterName")}
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") add(); }}
        className="rounded-md border border-line bg-surface px-2 py-1 font-mono"
      />
      <select
        data-testid="rc-add-param-type"
        aria-label={t("rc.table.newParameterType")}
        value={type}
        onChange={(e) => {
          const next = e.target.value as RcValueType;
          setType(next);
          setValue(initialValue(next));
        }}
        className={SELECT}
      >
        {RC_VALUE_TYPES.map((v) => (
          <option key={v} value={v}>{t(`rc.table.types.${v}`)}</option>
        ))}
      </select>
      {type === "BOOLEAN" ? (
        <select data-testid="rc-add-param-value" aria-label={t("rc.table.newParameterValue")} value={value} onChange={(e) => setValue(e.target.value)} className={SELECT}>
          <option value="true">true</option>
          <option value="false">false</option>
        </select>
      ) : (
        <input
          type="text"
          data-testid="rc-add-param-value"
          aria-label={t("rc.table.newParameterValue")}
          placeholder={t("rc.table.newParameterValue")}
          aria-invalid={!valueOk}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") add(); }}
          className={`rounded-md border bg-surface px-2 py-1 font-mono ${valueOk ? "border-line" : "border-danger"}`}
        />
      )}
      <button type="button" data-testid="rc-add-param-button" disabled={!canAdd} onClick={add} className="btn">
        {t("rc.table.addParameter")}
      </button>
      {duplicate && <span role="alert" className="text-danger">{t("rc.table.duplicateParameter")}</span>}
      {!valueOk && <span role="alert" className="text-danger">{t("rc.table.invalidValue", { type: t(`rc.table.types.${type}`) })}</span>}
    </div>
  );
}

function AddCondition({ existing, onChange }: { existing: string[]; onChange: Update }) {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [expression, setExpression] = useState("");
  const [color, setColor] = useState("");
  const trimmed = name.trim();
  const duplicate = trimmed !== "" && existing.includes(trimmed);
  const canAdd = trimmed !== "" && !duplicate && expression.trim() !== "";
  const add = () => {
    if (!canAdd) return;
    onChange((cur) => addCondition(cur, trimmed, expression.trim(), color || undefined));
    setName("");
    setExpression("");
    setColor("");
  };
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm" data-testid="rc-add-cond">
      <input
        type="text"
        data-testid="rc-add-cond-name"
        aria-label={t("rc.table.newConditionName")}
        placeholder={t("rc.table.newConditionName")}
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="rounded-md border border-line bg-surface px-2 py-1 font-mono"
      />
      <input
        type="text"
        data-testid="rc-add-cond-expression"
        aria-label={t("rc.table.newConditionExpression")}
        placeholder={t("rc.table.newConditionExpression")}
        value={expression}
        onChange={(e) => setExpression(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") add(); }}
        className="min-w-[16rem] flex-1 rounded-md border border-line bg-surface px-2 py-1 font-mono"
      />
      <select data-testid="rc-add-cond-color" aria-label={t("rc.table.newConditionColor")} value={color} onChange={(e) => setColor(e.target.value)} className={SELECT}>
        <option value="">{t("rc.table.colors.none")}</option>
        {RC_TAG_COLORS.map((c) => (
          <option key={c} value={c}>{t(`rc.table.colors.${c}`)}</option>
        ))}
      </select>
      <button type="button" data-testid="rc-add-cond-button" disabled={!canAdd} onClick={add} className="btn">
        {t("rc.table.addCondition")}
      </button>
      {duplicate && <span role="alert" className="text-danger">{t("rc.table.duplicateCondition")}</span>}
    </div>
  );
}
