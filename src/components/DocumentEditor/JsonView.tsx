import { json, jsonParseLinter } from "@codemirror/lang-json";
import { linter, lintGutter } from "@codemirror/lint";
import { EditorView } from "@codemirror/view";
import CodeMirror from "@uiw/react-codemirror";
import { useEffect, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useResolvedTheme } from "../../store/useResolvedTheme";
import { useSettings } from "../../store/settings";
import { editorPhrases, editorScheme, editorTheme } from "../editorTheme";

interface Props {
  text: string;
  onChange(text: string): void;
  /** Repair runs in the editor so its failure shows next to Format's (toolbar and shortcut). */
  onRepair(): void;
}

export function JsonView({ text, onChange, onRepair }: Props) {
  const { t } = useTranslation();
  const theme = useResolvedTheme();

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

  const dark = theme === "dark";
  const language = useSettings((s) => s.language);
  const extensions = useMemo(
    () => [json(), linter(jsonParseLinter()), lintGutter(), EditorView.lineWrapping, editorTheme, editorScheme(dark), editorPhrases(language)],
    [dark, language],
  );

  return (
    <div data-testid="json-view" className="space-y-2">
      <div className="flex gap-2">
        <button type="button" data-testid="json-repair" onClick={onRepair} className="btn">
          {t("editor.repair")}
        </button>
      </div>
      <div data-testid="json-editor" className="overflow-hidden rounded-md border border-line text-sm">
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
          minHeight="16rem"
          maxHeight="32rem"
          aria-label={t("editor.jsonEditor")}
        />
      </div>
    </div>
  );
}
