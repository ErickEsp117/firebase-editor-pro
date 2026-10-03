import { json, jsonParseLinter } from "@codemirror/lang-json";
import { linter, lintGutter } from "@codemirror/lint";
import { EditorView } from "@codemirror/view";
import CodeMirror from "@uiw/react-codemirror";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSettings } from "../../store/settings";
import { useResolvedTheme } from "../../store/useResolvedTheme";
import { editorPhrases, editorScheme, editorTheme } from "../editorTheme";
import { initialValue, validValue, valueKind, valueText, type RcValueType } from "./rcTableModel";

type Obj = Record<string, unknown>;

interface Props {
  /** The Remote Config value object (`{ value }`, `{ useInAppDefault: true }`, or absent). */
  value: unknown;
  /** The parameter's valueType; decides the editor. */
  type: string | undefined;
  label: string;
  testId: string;
  onChange(next: Obj | undefined): void;
  /** Absent values are allowed (a parameter may have only conditional values). */
  allowNone?: boolean;
}

const FIELD = "w-full rounded-md border bg-surface px-3 py-2 font-mono text-sm";

/** Editor for one Remote Config value, sized for reading: multi-line text, JSON with validation, true/false. */
export function RcValueField({ value, type, label, testId, onChange, allowNone = false }: Props) {
  const { t } = useTranslation();
  const kind = valueKind(value);
  const text = valueText(value);
  const valid = kind !== "value" || validValue(type, text);

  if (kind === "special") {
    return <p data-testid={`${testId}-special`} className="text-sm text-fg-muted">{t("rc.table.specialValue")}</p>;
  }
  return (
    <div className="space-y-2">
      <div role="radiogroup" aria-label={t("rc.table.valueModeOf", { name: label })} className="segmented w-fit">
        {allowNone && (
          <button type="button" role="radio" aria-checked={kind === "none"} aria-selected={kind === "none"} data-testid={`${testId}-mode-none`} onClick={() => onChange(undefined)}>
            {t("rc.table.modeNone")}
          </button>
        )}
        <button type="button" role="radio" aria-checked={kind === "value"} aria-selected={kind === "value"} data-testid={`${testId}-mode-value`}
          onClick={() => { if (kind !== "value") onChange({ value: initialValue((type as RcValueType) ?? "STRING") }); }}>
          {t("rc.table.modeValue")}
        </button>
        <button type="button" role="radio" aria-checked={kind === "inAppDefault"} aria-selected={kind === "inAppDefault"} data-testid={`${testId}-mode-inapp`}
          onClick={() => onChange({ useInAppDefault: true })}>
          {t("rc.visual.inAppDefault")}
        </button>
      </div>
      {kind === "inAppDefault" && <p className="text-sm text-fg-muted">{t("rc.visual.inAppDefaultHint")}</p>}
      {kind === "value" && (
        <>
          {type === "BOOLEAN" ? (
            <div role="radiogroup" aria-label={label} className="segmented w-fit" data-testid={testId}>
              {["true", "false"].map((b) => (
                <button key={b} type="button" role="radio" aria-checked={text === b} aria-selected={text === b} data-testid={`${testId}-${b}`} onClick={() => onChange({ value: b })}>
                  {b}
                </button>
              ))}
            </div>
          ) : type === "JSON" ? (
            <JsonValueEditor text={text} label={label} testId={testId} onChange={(next) => onChange({ value: next })} />
          ) : type === "NUMBER" ? (
            <input
              type="text"
              inputMode="decimal"
              data-testid={testId}
              aria-label={label}
              aria-invalid={!valid}
              value={text}
              onChange={(e) => onChange({ value: e.target.value })}
              className={`${FIELD} ${valid ? "border-line" : "border-danger"}`}
            />
          ) : (
            <textarea
              data-testid={testId}
              aria-label={label}
              rows={Math.min(10, Math.max(2, text.split("\n").length))}
              value={text}
              onChange={(e) => onChange({ value: e.target.value })}
              className={`${FIELD} border-line font-sans`}
            />
          )}
          {!valid && (
            <p role="alert" data-testid={`${testId}-invalid`} className="text-sm text-danger">
              {t("rc.table.invalidValue", { type: t(`rc.table.types.${type}`) })}
            </p>
          )}
        </>
      )}
    </div>
  );
}

/** Pretty-printed JSON, or null when the text is empty or not JSON. */
export function prettyJson(text: string): string | null {
  if (text.trim() === "") return null;
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return null;
  }
}

/** An empty value is valid in Remote Config, so only non-empty text is linted. */
const jsonLinter = linter((view) => (view.state.doc.length === 0 ? [] : jsonParseLinter()(view)));

function JsonValueEditor({ text, label, testId, onChange }: { text: string; label: string; testId: string; onChange(next: string): void }) {
  const { t } = useTranslation();
  const dark = useResolvedTheme() === "dark";
  const language = useSettings((s) => s.language);
  const extensions = useMemo(
    () => [json(), jsonLinter, lintGutter(), EditorView.lineWrapping, editorTheme, editorScheme(dark), editorPhrases(language)],
    [dark, language],
  );
  // Shown formatted for reading; the stored text only changes when the user edits it.
  const [shown, setShown] = useState(() => prettyJson(text) ?? text);
  const [seen, setSeen] = useState(text);
  if (text !== seen) {
    setSeen(text);
    if (text !== shown) setShown(text);
  }
  const pretty = prettyJson(shown);
  return (
    <div className="space-y-2">
      <div data-testid={testId} className="overflow-hidden rounded-md border border-line text-sm">
        <CodeMirror
          value={shown}
          onChange={(v) => {
            if (v === shown) return;
            setShown(v);
            onChange(v);
          }}
          extensions={extensions}
          theme="none"
          minHeight="8rem"
          maxHeight="20rem"
          aria-label={label}
        />
      </div>
      <button type="button" data-testid={`${testId}-format`} className="btn" disabled={pretty === null || pretty === shown} onClick={() => pretty && onChange(pretty)}>
        {t("rc.format")}
      </button>
    </div>
  );
}
