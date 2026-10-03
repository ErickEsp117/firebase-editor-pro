import { json, jsonParseLinter } from "@codemirror/lang-json";
import { linter, lintGutter } from "@codemirror/lint";
import { EditorView } from "@codemirror/view";
import CodeMirror from "@uiw/react-codemirror";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useShortcutActions, withShortcut } from "../../hooks/shortcuts";
import { useResolvedTheme } from "../../store/useResolvedTheme";
import { useSettings } from "../../store/settings";
import { editorPhrases, editorScheme, editorTheme } from "../editorTheme";

interface Props {
  text: string;
  onChange(text: string): void;
}

export function TemplateEditor({ text, onChange }: Props) {
  const { t } = useTranslation();
  const theme = useResolvedTheme();
  // The text Format failed on; the error stays only until that text changes (edit, reload, rollback).
  const [failedOn, setFailedOn] = useState<string | null>(null);
  const formatError = failedOn !== null && failedOn === text;
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

  const dark = theme === "dark";
  const language = useSettings((s) => s.language);
  const extensions = useMemo(
    () => [json(), linter(jsonParseLinter()), lintGutter(), EditorView.lineWrapping, editorTheme, editorScheme(dark), editorPhrases(language)],
    [dark, language],
  );

  const format = () => {
    try {
      onChange(JSON.stringify(JSON.parse(text), null, 2));
      setFailedOn(null);
    } catch {
      setFailedOn(text);
    }
  };
  // ⌘/Ctrl+Shift+F runs exactly what the Format button runs, including its error.
  useShortcutActions("remoteConfig", { format });

  return (
    <div data-testid="rc-json-view" className="space-y-2">
      <div className="flex items-center gap-2">
        <button type="button" data-testid="rc-format" title={withShortcut(t("rc.format"), "format")} onClick={format} className="btn">
          {t("rc.format")}
        </button>
        {formatError && (
          <span role="alert" data-testid="rc-format-error" className="text-xs text-danger ">
            {t("rc.formatFailed")}
          </span>
        )}
      </div>
      <div data-testid="rc-editor" className="overflow-hidden rounded-md border border-line text-sm">
        <CodeMirror
          value={text}
          onChange={(value) => {
            if (value !== text) onChange(value);
          }}
          onCreateEditor={(view) => {
            viewRef.current = view;
          }}
          extensions={extensions}
          theme="none"
          minHeight="20rem"
          maxHeight="36rem"
          aria-label={t("rc.editorLabel")}
        />
      </div>
    </div>
  );
}
