import { json, jsonParseLinter } from "@codemirror/lang-json";
import { linter, lintGutter } from "@codemirror/lint";
import { EditorView } from "@codemirror/view";
import CodeMirror from "@uiw/react-codemirror";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { formatEditorJson, repairEditorJson } from "../../core";
import { useResolvedTheme } from "../../store/useResolvedTheme";
import { editorTheme } from "../editorTheme";

interface Props {
  text: string;
  onChange(text: string): void;
}

export function JsonView({ text, onChange }: Props) {
  const { t } = useTranslation();
  const theme = useResolvedTheme();
  const [actionFailed, setActionFailed] = useState(false);

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

  const extensions = useMemo(() => [json(), linter(jsonParseLinter()), lintGutter(), EditorView.lineWrapping, editorTheme], []);
  const dark = theme === "dark";

  const run = (fn: (s: string) => string) => {
    try {
      onChange(fn(text));
      setActionFailed(false);
    } catch {
      setActionFailed(true);
    }
  };

  return (
    <div data-testid="json-view" className="space-y-2">
      <div className="flex gap-2">
        <button type="button" data-testid="json-format" onClick={() => run(formatEditorJson)} className="rounded border border-line px-2 py-1 text-xs ">
          {t("editor.format")}
        </button>
        <button type="button" data-testid="json-repair" onClick={() => run(repairEditorJson)} className="rounded border border-line px-2 py-1 text-xs ">
          {t("editor.repair")}
        </button>
        {actionFailed && (
          <span role="alert" data-testid="json-action-error" className="self-center text-xs text-danger ">
            {t("editor.actionFailed")}
          </span>
        )}
      </div>
      <div data-testid="json-editor" className="overflow-hidden rounded border border-line text-sm ">
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
