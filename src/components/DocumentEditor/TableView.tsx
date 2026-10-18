import { useId, useState } from "react";
import { ChevronRight, Plus, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Modal } from "../Firestore/crud/Modal";
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
  double: "bg-sky-100 text-sky-800 dark:bg-sky-400/10 dark:text-sky-200",
  boolean: "bg-warning/10 text-warning ",
  null: "bg-hover text-fg ",
  timestamp: "bg-purple-100 text-purple-800 dark:bg-purple-400/10 dark:text-purple-200",
  reference: "bg-pink-100 text-pink-800 dark:bg-pink-400/10 dark:text-pink-200",
  geopoint: "bg-teal-100 text-teal-800 dark:bg-teal-400/10 dark:text-teal-200",
  bytes: "bg-orange-100 text-orange-800 dark:bg-orange-400/10 dark:text-orange-200",
  array: "bg-indigo-100 text-indigo-800 dark:bg-indigo-400/10 dark:text-indigo-200",
  map: "bg-hover text-fg-muted",
};

export function TypeBadge({ type }: { type: ValueType }) {
  const { t } = useTranslation();
  return (
    <span data-testid="type-badge" data-type={type} className={`inline-flex rounded-md px-2 py-0.5 text-xs font-medium ${BADGE[type]}`}>
      {t(`editor.types.${type}`)}
    </span>
  );
}

export function TableView({ value, onChange }: Props) {
  const { t } = useTranslation();
  const root = value as unknown;
  const apply: Apply = (update) => onChange((cur) => update(cur) as Obj);
  const keys = Object.keys(value);
  const [adding, setAdding] = useState<PathSeg[] | null>(null);
  const titleId = useId();

  return (
    <div data-testid="table-view" className="field-table-shell">
      <div className="field-table-scroll">
        <table className="field-table w-full table-fixed border-collapse text-sm">
          <thead>
            <tr className="text-left text-xs text-fg-muted">
              <th scope="col" className="w-[38%]">{t("editor.colKey")}</th>
              <th scope="col" className="w-28">{t("editor.colType")}</th>
              <th scope="col">{t("editor.colValue")}</th>
              <th scope="col" className="w-12" />
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
              <Row key={k} root={root} path={[k]} name={k} depth={0} apply={apply} onAdd={setAdding} />
            ))}
          </tbody>
        </table>
      </div>
      <div className="field-table-footer">
        <button type="button" data-testid="add-field-open" className="field-add-trigger" onClick={() => setAdding([])}>
          <Plus size={14} aria-hidden="true" />{t("editor.addToDocument")}
        </button>
      </div>
      {adding !== null && (
        <Modal titleId={titleId} testId="add-entry-dialog" role="dialog"
          title={t(Array.isArray(getAt(root, adding)) ? "editor.addItem" : "editor.addField")}
          onClose={() => setAdding(null)}>
          <p className="mb-4 break-words text-sm text-fg-muted">{adding.length ? t("editor.addInside", { path: adding.map((seg) => JSON.stringify(seg)).join(" / ") }) : t("editor.documentRoot")}</p>
          <AddEntry container={getAt(root, adding)} onCancel={() => setAdding(null)} onAdd={(key, v) => {
            apply((r) => addAt(r, adding, key, v));
            setAdding(null);
          }} testId={adding.length ? `add-${adding.join(".")}` : "add-field"} />
        </Modal>
      )}
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
  onAdd(path: PathSeg[]): void;
}

function Row({ root, path, name, depth, apply, onAdd }: RowProps) {
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
      <tr data-testid={`row-${testKey}`} data-depth={depth} data-container={container} data-open={container && open} className="field-row align-top">
        <td className="field-name font-mono text-sm" style={{ paddingLeft: 12 + depth * 20 }}>
          {Array.from({ length: depth }, (_, i) => (
            <span key={i} aria-hidden="true" className="field-guide" style={{ left: 22 + i * 20 }} />
          ))}
          <div className="relative flex items-start gap-1.5">
            {container ? (
              <button
                type="button"
                aria-expanded={open}
                aria-label={t("editor.toggleNode", { name })}
                title={t("editor.toggleNode", { name })}
                data-testid={`toggle-${testKey}`}
                onClick={() => setOpen(!open)}
                className="field-toggle"
              >
                <ChevronRight size={14} aria-hidden="true" className={open ? "rotate-90" : ""} />
              </button>
            ) : (
              <span className="w-5 shrink-0" />
            )}
            <span className="min-w-0 break-words py-0.5">{name}</span>
          </div>
        </td>
        <td>
          <TypeBadge type={type} />
        </td>
        <td className="field-value">
          {container ? (
            <span className="field-count">
              {t(type === "array" ? "editor.itemCount" : "editor.fieldCount", { count: entries.length })}
            </span>
          ) : (
            <ValueEditor value={value} label={t("editor.valueOf", { name })} onChange={(next) => apply((r) => setAt(r, path, next))} />
          )}
        </td>
        <td>
          <button
            type="button"
            aria-label={t("editor.deleteEntry", { name })}
            title={t("editor.deleteEntry", { name })}
            data-testid={`delete-${testKey}`}
            onClick={() => apply((r) => deleteAt(r, path))}
            className="field-delete icon-button"
          >
            <Trash2 size={14} aria-hidden="true" />
          </button>
        </td>
      </tr>
      {container && open && (
        <>
          {entries.map(([seg, label]) => (
            <Row key={String(seg)} root={root} path={[...path, seg]} name={label} depth={depth + 1} apply={apply} onAdd={onAdd} />
          ))}
          <tr className="field-add-row">
            <td colSpan={4} style={{ paddingLeft: 12 + (depth + 1) * 20 }}>
              <button type="button" className="field-add-trigger" data-testid={`add-${testKey}-open`} onClick={() => onAdd(path)}>
                <Plus size={14} aria-hidden="true" />
                {t(type === "array" ? "editor.addItemInside" : "editor.addFieldInside", { name })}
              </button>
            </td>
          </tr>
        </>
      )}
    </>
  );
}

function AddEntry({ container, onAdd, onCancel, testId }: { container: unknown; onCancel(): void; onAdd(key: string | undefined, value: unknown): void; testId: string }) {
  const { t } = useTranslation();
  const isArray = Array.isArray(container);
  const [key, setKey] = useState("");
  const [type, setType] = useState<ValueType>("string");
  const dup = !isArray && isObj(container) && Object.prototype.hasOwnProperty.call(container, key);
  const canAdd = isArray || (key.trim().length > 0 && !dup);

  return (
    <form className="flex flex-wrap items-center gap-2 text-sm" data-testid={testId} onSubmit={(event) => {
      event.preventDefault();
      if (!canAdd) return;
      onAdd(isArray ? undefined : key, defaultValue(type));
    }}>
      {!isArray && (
        <input
          type="text"
          aria-label={t("editor.newFieldName")}
          placeholder={t("editor.newFieldName")}
          data-testid={`${testId}-name`}
          value={key}
          onChange={(e) => setKey(e.target.value)}
          className="min-w-0 w-52 max-w-full rounded-md border border-line bg-surface px-2.5 py-1.5 text-sm"
        />
      )}
      <select
        aria-label={t("editor.newFieldType")}
        data-testid={`${testId}-type`}
        value={type}
        onChange={(e) => setType(e.target.value as ValueType)}
        className="max-w-full rounded-md border border-line bg-surface px-2 py-1.5 text-sm"
      >
        {VALUE_TYPES.map((ty) => (
          <option key={ty} value={ty}>
            {t(`editor.types.${ty}`)}
          </option>
        ))}
      </select>
      <button
        type="submit"
        disabled={!canAdd}
        data-testid={`${testId}-button`}
        className="btn inline-flex items-center gap-1.5 disabled:opacity-50"
      >
        <Plus size={14} aria-hidden="true" />
        {t(isArray ? "editor.addItem" : "editor.addField")}
      </button>
      <button type="button" className="btn" onClick={onCancel}>{t("connection.cancel")}</button>
      {dup && <span role="alert" className="w-full text-danger">{t("editor.duplicateField")}</span>}
    </form>
  );
}
