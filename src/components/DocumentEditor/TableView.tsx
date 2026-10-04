import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ValueEditor } from "./ValueEditor";
import { addAt, defaultValue, deleteAt, getAt, isObj, setAt, typeOf, VALUE_TYPES, type Obj, type PathSeg, type ValueType } from "./valueTypes";

interface Props {
  value: Obj;
  /** Receives an updater applied to the latest editor state, so rapid successive edits never overwrite each other. */
  onChange(update: (current: Obj) => Obj): void;
}

const BADGE: Record<ValueType, string> = {
  string: "bg-success/10 text-success ",
  integer: "bg-selection text-accent ",
  double: "bg-sky-100 text-sky-800 dark:bg-sky-900 dark:text-sky-200",
  boolean: "bg-warning/10 text-warning ",
  null: "bg-hover text-fg ",
  timestamp: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
  reference: "bg-pink-100 text-pink-800 dark:bg-pink-900 dark:text-pink-200",
  geopoint: "bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-200",
  bytes: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
  array: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200",
  map: "bg-rose-100 text-rose-800 dark:bg-rose-900 dark:text-rose-200",
};

export function TypeBadge({ type }: { type: ValueType }) {
  const { t } = useTranslation();
  return (
    <span data-testid="type-badge" data-type={type} className={`rounded px-1.5 py-0.5 text-xs font-medium ${BADGE[type]}`}>
      {t(`editor.types.${type}`)}
    </span>
  );
}

export function TableView({ value, onChange }: Props) {
  const { t } = useTranslation();
  const root = value as unknown;
  const apply: Apply = (update) => onChange((cur) => update(cur) as Obj);
  const keys = Object.keys(value);

  return (
    <div data-testid="table-view" className="space-y-2">
      <table className="w-full table-fixed border-collapse text-sm">
        <thead>
          <tr className="text-left text-sm text-fg-muted">
            <th className="w-1/4 pb-1">{t("editor.colKey")}</th>
            <th className="w-24 pb-1">{t("editor.colType")}</th>
            <th className="pb-1">{t("editor.colValue")}</th>
            <th className="w-10 pb-1" />
          </tr>
        </thead>
        <tbody>
          {keys.length === 0 && (
            <tr>
              <td colSpan={4} className="py-2 text-fg-muted" data-testid="table-empty">
                {t("editor.noFields")}
              </td>
            </tr>
          )}
          {keys.map((k) => (
            <Row key={k} root={root} path={[k]} name={k} depth={0} apply={apply} />
          ))}
        </tbody>
      </table>
      <AddEntry container={value} onAdd={(key, v) => apply((r) => addAt(r, [], key, v))} testId="add-field" />
    </div>
  );
}

type Apply = (update: (root: unknown) => unknown) => void;

interface RowProps {
  root: unknown;
  path: PathSeg[];
  name: string;
  depth: number;
  apply: Apply;
}

function Row({ root, path, name, depth, apply }: RowProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const value = getAt(root, path);
  const type = typeOf(value);
  const container = type === "array" || type === "map";
  const entries: [PathSeg, string][] = Array.isArray(value)
    ? value.map((_, i) => [i, `[${i}]`])
    : container
      ? Object.keys(value as Obj).map((k) => [k, k])
      : [];
  const testKey = path.join(".");

  return (
    <>
      <tr data-testid={`row-${testKey}`} className="border-t border-line align-top ">
        <td className="py-1.5 pr-2 font-mono text-sm" style={{ paddingLeft: depth * 16 }}>
          {container ? (
            <button
              type="button"
              aria-expanded={open}
              aria-label={t("editor.toggleNode", { name })}
              title={t("editor.toggleNode", { name })}
              data-testid={`toggle-${testKey}`}
              onClick={() => setOpen(!open)}
              className="mr-1 inline-block w-4 text-center"
            >
              {open ? "▾" : "▸"}
            </button>
          ) : (
            <span className="mr-1 inline-block w-4" />
          )}
          <span className="break-all">{name}</span>
        </td>
        <td className="py-1.5 pr-2">
          <TypeBadge type={type} />
        </td>
        <td className="py-1 pr-2">
          {container ? (
            <span className="text-xs text-fg-muted">
              {t(type === "array" ? "editor.itemCount" : "editor.fieldCount", { count: entries.length })}
            </span>
          ) : (
            <ValueEditor value={value} label={t("editor.valueOf", { name })} onChange={(next) => apply((r) => setAt(r, path, next))} />
          )}
        </td>
        <td className="py-1">
          <button
            type="button"
            aria-label={t("editor.deleteEntry", { name })}
            title={t("editor.deleteEntry", { name })}
            data-testid={`delete-${testKey}`}
            onClick={() => apply((r) => deleteAt(r, path))}
            className="rounded px-1.5 text-danger hover:bg-danger/10 "
          >
            ✕
          </button>
        </td>
      </tr>
      {container && open && (
        <>
          {entries.map(([seg, label]) => (
            <Row key={String(seg)} root={root} path={[...path, seg]} name={label} depth={depth + 1} apply={apply} />
          ))}
          <tr>
            <td colSpan={4} style={{ paddingLeft: (depth + 1) * 16 }} className="pb-2">
              <AddEntry
                container={value}
                onAdd={(key, v) => apply((r) => addAt(r, path, key, v))}
                testId={`add-${testKey}`}
              />
            </td>
          </tr>
        </>
      )}
    </>
  );
}

function AddEntry({ container, onAdd, testId }: { container: unknown; onAdd(key: string | undefined, value: unknown): void; testId: string }) {
  const { t } = useTranslation();
  const isArray = Array.isArray(container);
  const [key, setKey] = useState("");
  const [type, setType] = useState<ValueType>("string");
  const dup = !isArray && isObj(container) && Object.prototype.hasOwnProperty.call(container, key);
  const canAdd = isArray || (key.trim().length > 0 && !dup);

  return (
    <div className="flex flex-wrap items-center gap-2 text-sm" data-testid={testId}>
      {!isArray && (
        <input
          type="text"
          aria-label={t("editor.newFieldName")}
          placeholder={t("editor.newFieldName")}
          data-testid={`${testId}-name`}
          value={key}
          onChange={(e) => setKey(e.target.value)}
          className="rounded border border-line px-1.5 py-0.5 font-mono "
        />
      )}
      <select
        aria-label={t("editor.newFieldType")}
        data-testid={`${testId}-type`}
        value={type}
        onChange={(e) => setType(e.target.value as ValueType)}
        className="rounded border border-line px-1 py-0.5 "
      >
        {VALUE_TYPES.map((ty) => (
          <option key={ty} value={ty}>
            {t(`editor.types.${ty}`)}
          </option>
        ))}
      </select>
      <button
        type="button"
        disabled={!canAdd}
        data-testid={`${testId}-button`}
        onClick={() => {
          onAdd(isArray ? undefined : key, defaultValue(type));
          setKey("");
        }}
        className="rounded border border-line px-2 py-0.5 disabled:opacity-50 "
      >
        {t(isArray ? "editor.addItem" : "editor.addField")}
      </button>
      {dup && <span role="alert" className="text-danger ">{t("editor.duplicateField")}</span>}
    </div>
  );
}
