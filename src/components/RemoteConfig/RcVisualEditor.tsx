import { ArrowDown, ArrowUp, Pencil, Plus, Search } from "lucide-react";
import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { RemoteConfigTemplate } from "../../core";
import { IconButton } from "../IconButton";
import { ConditionChip, RcParameterDialog } from "./RcParameterDialog";
import { RcConditionDialog } from "./RcConditionDialog";
import {
  conditionUsage,
  deleteParameter,
  editableSections,
  isObj,
  listConditions,
  listParameters,
  moveCondition,
  valueKind,
  valueText,
  type ParamRow,
} from "./rcTableModel";

type Obj = Record<string, unknown>;
type Update = (update: (current: RemoteConfigTemplate) => RemoteConfigTemplate) => void;
type Tab = "parameters" | "conditions" | "versions";

interface Props {
  template: RemoteConfigTemplate;
  onChange: Update;
  /** The versions panel, shown in its own tab. */
  versions: ReactNode;
  /** A validate, publish, reload or rollback is running: editing is paused so nothing is lost when it lands. */
  busy?: boolean;
}

/**
 * Readable Remote Config editor: parameters and conditions as cards with their full values, edited in
 * roomy dialogs. Every edit goes to the same draft as the JSON view, so validate and publish are unchanged.
 */
export function RcVisualEditor({ template, onChange, versions, busy = false }: Props) {
  const { t } = useTranslation();
  const [tab, setTab] = useState<Tab>("parameters");
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<{ kind: "param"; row: ParamRow | null } | { kind: "cond"; condition: Obj | null } | null>(null);
  const params = listParameters(template);
  const conditions = listConditions(template);
  const conditionNames = conditions.map((c) => c.name as string);
  const editable = editableSections(template);

  const q = query.trim().toLowerCase();
  const shown = q
    ? params.filter(({ key, param }) => {
        const values = [param.defaultValue, ...(isObj(param.conditionalValues) ? Object.values(param.conditionalValues) : [])];
        return (
          key.toLowerCase().includes(q) ||
          (typeof param.description === "string" && param.description.toLowerCase().includes(q)) ||
          values.some((v) => valueText(v).toLowerCase().includes(q))
        );
      })
    : params;

  const tabButton = (id: Tab, label: string) => (
    <button key={id} type="button" role="tab" aria-selected={tab === id} aria-controls={`rc-tab-${id}`} data-testid={`rc-tab-${id}`} onClick={() => setTab(id)}>
      {label}
    </button>
  );

  return (
    <div data-testid="rc-table-view" className="min-w-0 space-y-4">
      <div role="tablist" aria-label={t("rc.table.viewMode")} className="segmented w-fit">
        {tabButton("parameters", t("rc.visual.parametersTab", { count: params.length }))}
        {tabButton("conditions", t("rc.visual.conditionsTab", { count: conditions.length }))}
        {tabButton("versions", t("rc.versions"))}
      </div>

      {tab === "parameters" && (
        <section id="rc-tab-parameters" role="tabpanel" className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <label className="relative min-w-[16rem] flex-1">
              <span className="sr-only">{t("rc.visual.search")}</span>
              <Search size={16} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-fg-muted" />
              <input
                type="search"
                data-testid="rc-param-search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t("rc.visual.search")}
                className="w-full rounded-md border border-line bg-surface py-2 pl-9 pr-3"
              />
            </label>
            <button type="button" data-testid="rc-param-new" className="btn-primary flex items-center gap-1.5" disabled={!editable.parameters || busy} onClick={() => setEditing({ kind: "param", row: null })}>
              <Plus size={16} aria-hidden="true" />
              {t("rc.visual.newParameter")}
            </button>
          </div>
          {!editable.parameters && <p role="note" className="text-sm text-warning">{t("rc.table.fixInJson")}</p>}
          {params.length === 0 && <p data-testid="rc-table-no-params" className="rounded-lg border border-dashed border-line p-6 text-center text-fg-muted">{t("rc.table.noParameters")}</p>}
          {params.length > 0 && shown.length === 0 && <p className="text-fg-muted">{t("rc.visual.noMatches")}</p>}
          <ul className="space-y-2">
            {shown.map((row) => (
              <ParameterCard key={`${row.group ?? ""}/${row.key}`} row={row} conditions={conditions} disabled={busy} onOpen={() => setEditing({ kind: "param", row })} />
            ))}
          </ul>
        </section>
      )}

      {tab === "conditions" && (
        <section id="rc-tab-conditions" role="tabpanel" className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <p className="mr-auto text-sm text-fg-muted">{t("rc.table.conditionOrderHint")}</p>
            <button type="button" data-testid="rc-cond-new" className="btn-primary flex items-center gap-1.5" disabled={!editable.conditions || busy} onClick={() => setEditing({ kind: "cond", condition: null })}>
              <Plus size={16} aria-hidden="true" />
              {t("rc.visual.newCondition")}
            </button>
          </div>
          {!editable.conditions && <p role="note" className="text-sm text-warning">{t("rc.table.fixInJson")}</p>}
          {conditions.length === 0 && <p data-testid="rc-table-no-conditions" className="rounded-lg border border-dashed border-line p-6 text-center text-fg-muted">{t("rc.table.noConditions")}</p>}
          <ol className="space-y-2">
            {conditions.map((c, i) => {
              const name = c.name as string;
              const usage = conditionUsage(template, name);
              return (
                <li key={name} data-testid={`rc-condition:${name}`} className="rounded-lg border border-line bg-surface p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="w-6 text-sm text-fg-muted">{i + 1}</span>
                    <ConditionChip name={name} color={typeof c.tagColor === "string" ? c.tagColor : undefined} />
                    <span className="text-xs text-fg-muted">{t("rc.visual.usedBy", { count: usage })}</span>
                    <div className="ml-auto flex items-center">
                      <IconButton data-testid={`rc-cond-up:${name}`} label={t("rc.table.moveUp", { name })} disabled={busy || i === 0} onClick={() => onChange((cur) => moveCondition(cur, name, -1))}>
                        <ArrowUp size={16} aria-hidden="true" />
                      </IconButton>
                      <IconButton data-testid={`rc-cond-down:${name}`} label={t("rc.table.moveDown", { name })} disabled={busy || i === conditions.length - 1} onClick={() => onChange((cur) => moveCondition(cur, name, 1))}>
                        <ArrowDown size={16} aria-hidden="true" />
                      </IconButton>
                      <IconButton data-testid={`rc-cond-edit:${name}`} label={t("rc.visual.editCondition", { name })} disabled={busy} onClick={() => setEditing({ kind: "cond", condition: c })}>
                        <Pencil size={16} aria-hidden="true" />
                      </IconButton>
                    </div>
                  </div>
                  <pre data-testid={`rc-cond-expr:${name}`} className="mt-2 whitespace-pre-wrap break-all rounded-md bg-hover px-3 py-2 font-mono text-sm">{typeof c.expression === "string" ? c.expression : ""}</pre>
                </li>
              );
            })}
          </ol>
        </section>
      )}

      {tab === "versions" && (
        <section id="rc-tab-versions" role="tabpanel">
          {versions}
        </section>
      )}

      {editing?.kind === "param" && (
        <RcParameterDialog
          template={template}
          row={editing.row}
          conditions={conditions}
          onChange={onChange}
          onDelete={editing.row ? () => onChange((cur) => deleteParameter(cur, { key: editing.row!.key, group: editing.row!.group })) : undefined}
          onClose={() => setEditing(null)}
        />
      )}
      {editing?.kind === "cond" && (
        <RcConditionDialog
          condition={editing.condition}
          existingNames={conditionNames}
          danglingNames={[...new Set(params.flatMap(({ param }) => (isObj(param.conditionalValues) ? Object.keys(param.conditionalValues) : [])))].filter((n) => !conditionNames.includes(n))}
          usage={editing.condition ? conditionUsage(template, editing.condition.name as string) : 0}
          onChange={onChange}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

function ParameterCard({ row, conditions, disabled, onOpen }: { row: ParamRow; conditions: Obj[]; disabled: boolean; onOpen(): void }) {
  const { t } = useTranslation();
  const { key, group, param } = row;
  const id = group ? `${group}/${key}` : key;
  const type = typeof param.valueType === "string" ? param.valueType : undefined;
  const values = isObj(param.conditionalValues) ? param.conditionalValues : {};
  const names = conditions.map((c) => c.name as string);
  const used = [...names.filter((n) => Object.prototype.hasOwnProperty.call(values, n)), ...Object.keys(values).filter((n) => !names.includes(n))];
  return (
    <li data-testid={`rc-param:${id}`}>
      <button
        type="button"
        data-testid={`rc-param-open:${id}`}
        onClick={onOpen}
        disabled={disabled}
        aria-label={t("rc.visual.editParameter", { name: key })}
        className="block w-full space-y-2 rounded-lg border border-line bg-surface p-3 text-left hover:border-accent focus-visible:border-accent disabled:cursor-wait disabled:hover:border-line"
      >
        <span className="flex flex-wrap items-center gap-2">
          <span className="break-all font-mono font-semibold">{key}</span>
          <span className="rounded bg-hover px-1.5 py-0.5 text-xs text-fg-muted">{type ? t(`rc.table.types.${type}`, { defaultValue: type }) : t("rc.table.typeUnspecified")}</span>
          {group && <span className="rounded border border-line px-1.5 py-0.5 text-xs text-fg-muted">{t("rc.table.group", { group })}</span>}
          <Pencil size={14} aria-hidden="true" className="ml-auto text-fg-muted" />
        </span>
        {typeof param.description === "string" && param.description && (
          <span className="block whitespace-pre-wrap text-sm text-fg-muted">{param.description}</span>
        )}
        <span className="grid gap-1.5 text-sm sm:grid-cols-[10rem_1fr]">
          <span className="text-fg-muted">{t("rc.table.colDefault")}</span>
          <ValuePreview value={param.defaultValue} testId={`rc-param-default-preview:${id}`} />
          {used.map((name) => {
            const cond = conditions.find((c) => c.name === name);
            return (
              <span key={name} className="contents">
                <span className="min-w-0"><ConditionChip name={name} color={typeof cond?.tagColor === "string" ? cond.tagColor : undefined} missing={!cond} /></span>
                <ValuePreview value={values[name]} testId={`rc-param-cond-preview:${id}:${name}`} />
              </span>
            );
          })}
        </span>
      </button>
    </li>
  );
}

function ValuePreview({ value, testId }: { value: unknown; testId: string }) {
  const { t } = useTranslation();
  const kind = valueKind(value);
  if (kind === "inAppDefault") return <span data-testid={testId} className="italic text-fg-muted">{t("rc.visual.inAppDefault")}</span>;
  if (kind === "none") return <span data-testid={testId} className="italic text-fg-muted">{t("rc.table.modeNone")}</span>;
  if (kind === "special") return <span data-testid={testId} className="italic text-fg-muted">{t("rc.visual.specialShort")}</span>;
  const text = valueText(value);
  if (text === "") return <span data-testid={testId} className="italic text-fg-muted">{t("rc.visual.emptyValue")}</span>;
  return (
    <span className="block min-w-0 rounded bg-hover px-2 py-1">
      <span data-testid={testId} className="line-clamp-3 whitespace-pre-wrap break-all font-mono text-xs">
        {text}
      </span>
    </span>
  );
}
