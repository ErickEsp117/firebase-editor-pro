import { json, jsonParseLinter } from "@codemirror/lang-json";
import { linter, lintGutter } from "@codemirror/lint";
import { EditorView } from "@codemirror/view";
import CodeMirror from "@uiw/react-codemirror";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { formatEditorJson, repairEditorJson } from "../../core";
import { useSettings } from "../../store/settings";

interface Props {
  text: string;
  onChange(text: string): void;
}

export function JsonView({ text, onChange }: Props) {
  const { t } = useTranslation();
  const theme = useSettings((s) => s.theme);
  const [actionError, setActionError] = useState<string | null>(null);

  const viewRef = useRef<EditorView | null>(null);

  useEffect(
    () => () => {
      viewRef.current = null;
    },
    [],
  );

  // The wrapper defers external value changes until typing has been idle; programmatic edits (Format, Repair, save, discard) must show up at once.
  useEffect(() => {
    const view = viewRef.current;
    if (view && view.state.doc.toString() !== text) {
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text } });
    }
  }, [text]);

  const extensions = useMemo(() => [json(), linter(jsonParseLinter()), lintGutter(), EditorView.lineWrapping], []);
  const dark = theme === "dark" || (theme === "system" && typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: dark)").matches);

  const run = (fn: (s: string) => string) => {
    try {
      onChange(fn(text));
      setActionError(null);
    } catch {
      setActionError(t("editor.actionFailed"));
    }
  };

  return (
    <div data-testid="json-view" className="space-y-2">
      <div className="flex gap-2">
        <button type="button" data-testid="json-format" onClick={() => run(formatEditorJson)} className="rounded border border-slate-300 px-2 py-1 text-xs dark:border-slate-600">
          {t("editor.format")}
        </button>
        <button type="button" data-testid="json-repair" onClick={() => run(repairEditorJson)} className="rounded border border-slate-300 px-2 py-1 text-xs dark:border-slate-600">
          {t("editor.repair")}
        </button>
        {actionError && (
          <span role="alert" data-testid="json-action-error" className="self-center text-xs text-red-700 dark:text-red-300">
            {actionError}
          </span>
        )}
      </div>
      <div data-testid="json-editor" className="overflow-hidden rounded border border-slate-300 text-sm dark:border-slate-600">
        <CodeMirror
          value={text}
          onChange={(value) => {
            if (value !== text) onChange(value);
          }}
          onCreateEditor={(view) => {
            viewRef.current = view;
          }}
          extensions={extensions}
          theme={dark ? "dark" : "light"}
          minHeight="16rem"
          maxHeight="32rem"
          aria-label={t("editor.jsonEditor")}
        />
      </div>
    </div>
  );
}
