import { json, jsonParseLinter } from "@codemirror/lang-json";
import { linter, lintGutter } from "@codemirror/lint";
import { EditorView } from "@codemirror/view";
import CodeMirror from "@uiw/react-codemirror";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useResolvedTheme } from "../../store/useResolvedTheme";
import { editorTheme } from "../editorTheme";

interface Props {
  text: string;
  onChange(text: string): void;
}

export function TemplateEditor({ text, onChange }: Props) {
  const { t } = useTranslation();
  const theme = useResolvedTheme();
  const [formatError, setFormatError] = useState(false);
  const viewRef = useRef<EditorView | null>(null);

  useEffect(
    () => () => {
      viewRef.current = null;
    },
    [],
  );

  // The wrapper defers external value changes until typing has been idle; Format, reload and rollback must show up at once.
  useEffect(() => {
    const view = viewRef.current;
    if (view && view.state.doc.toString() !== text) {
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text } });
    }
  }, [text]);

  const extensions = useMemo(() => [json(), linter(jsonParseLinter()), lintGutter(), EditorView.lineWrapping, editorTheme], []);
  const dark = theme === "dark";

  const format = () => {
    try {
      onChange(JSON.stringify(JSON.parse(text), null, 2));
      setFormatError(false);
    } catch {
      setFormatError(true);
    }
  };

  return (
    <div data-testid="rc-json-view" className="space-y-2">
      <div className="flex items-center gap-2">
        <button type="button" data-testid="rc-format" onClick={format} className="rounded border border-line px-2 py-1 text-xs ">
          {t("rc.format")}
        </button>
        {formatError && (
          <span role="alert" data-testid="rc-format-error" className="text-xs text-danger ">
            {t("rc.formatFailed")}
          </span>
        )}
      </div>
      <div data-testid="rc-editor" className="overflow-hidden rounded border border-line text-sm ">
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
          minHeight="20rem"
          maxHeight="36rem"
          aria-label={t("rc.editorLabel")}
        />
      </div>
    </div>
  );
}
