import { LosslessNumber } from "lossless-json";
import { useTranslation } from "react-i18next";
import { normalizeTimestamp } from "../../core";
import { CommitInput } from "./CommitInput";
import { asTag, isObj, typeOf, type Obj } from "./valueTypes";

const INT = /^-?\d+$/;
const DEC = /^-?\d+(\.\d+)?([eE][+-]?\d+)?$/;
const BASE64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

const doubleLiteral = (s: string) => (/[.eE]/.test(s) ? s : `${s}.0`);

interface Props {
  value: unknown;
  label: string;
  onChange(next: unknown): void;
}

function withPayload(value: unknown, payload: unknown): unknown {
  return { __type__: asTag(value)!.type, __value__: payload };
}

/** Inline editor for a scalar/tagged value (containers are handled by the table rows). */
export function ValueEditor({ value, label, onChange }: Props) {
  const { t } = useTranslation();
  const type = typeOf(value);
  const tag = asTag(value);

  switch (type) {
    case "string":
      return <CommitInput value={value as string} label={label} onCommit={onChange} className="w-full" testId="edit-string" />;
    case "boolean":
      return (
        <input
          type="checkbox"
          aria-label={label}
          data-testid="edit-boolean"
          checked={value as boolean}
          onChange={(e) => onChange(e.target.checked)}
        />
      );
    case "null":
      return <span className="font-mono text-xs text-slate-500">null</span>;
    case "integer":
    case "double": {
      if (tag && (tag.type === "nan" || tag.type === "infinity" || tag.type === "-infinity")) {
        return <span className="font-mono text-xs">{tag.type === "nan" ? "NaN" : tag.type === "infinity" ? "Infinity" : "-Infinity"}</span>;
      }
      const inner = tag ? tag.value : value;
      const text = inner instanceof LosslessNumber ? inner.value : String(inner);
      const isInt = type === "integer";
      const wrap = (n: LosslessNumber) => (tag ? withPayload(value, n) : n);
      return (
        <CommitInput
          value={text}
          label={label}
          testId={isInt ? "edit-integer" : "edit-double"}
          validate={(s) => (isInt ? INT.test(s) : DEC.test(s))}
          onCommit={(s) => onChange(wrap(new LosslessNumber(isInt ? s : doubleLiteral(s))))}
        />
      );
    }
    case "timestamp": {
      if (tag?.type === "serverTimestamp") return <span className="font-mono text-xs">serverTimestamp</span>;
      return (
        <CommitInput
          value={String(tag?.value ?? "")}
          label={label}
          testId="edit-timestamp"
          className="w-full"
          validate={(s) => normalizeTimestamp(s) !== undefined}
          onCommit={(s) => onChange(withPayload(value, s))}
        />
      );
    }
    case "reference":
      return (
        <CommitInput value={String(tag?.value ?? "")} label={label} testId="edit-reference" className="w-full" onCommit={(s) => onChange(withPayload(value, s))} />
      );
    case "bytes":
      return (
        <CommitInput
          value={String(tag?.value ?? "")}
          label={label}
          testId="edit-bytes"
          className="w-full"
          validate={(s) => BASE64.test(s)}
          onCommit={(s) => onChange(withPayload(value, s))}
        />
      );
    case "geopoint": {
      const geo: Obj = isObj(tag?.value) ? (tag!.value as Obj) : {};
      const part = (k: "latitude" | "longitude", name: string) => {
        const cur = geo[k];
        return (
          <label className="flex items-center gap-1 text-xs">
            {name}
            <CommitInput
              value={cur instanceof LosslessNumber ? cur.value : String(cur ?? "")}
              label={`${label} ${name}`}
              testId={`edit-${k}`}
              className="w-28"
              validate={(s) => DEC.test(s)}
              onCommit={(s) => onChange(withPayload(value, { ...geo, [k]: new LosslessNumber(doubleLiteral(s)) }))}
            />
          </label>
        );
      };
      return (
        <span className="flex flex-wrap gap-3">
          {part("latitude", t("editor.latitude"))}
          {part("longitude", t("editor.longitude"))}
        </span>
      );
    }
    default:
      return null;
  }
}
