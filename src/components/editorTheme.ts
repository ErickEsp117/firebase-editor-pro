import { EditorView } from "@codemirror/view";

export const editorTheme = EditorView.theme({
  "&": { backgroundColor: "var(--surface)", color: "var(--text)", fontFamily: "var(--font-mono)", fontSize: "12px" },
  ".cm-scroller": { fontFamily: "inherit" },
  ".cm-content": { caretColor: "var(--accent)", padding: "16px 0" },
  ".cm-gutters": { backgroundColor: "var(--surface)", color: "var(--text-secondary)", border: "none" },
  ".cm-activeLine, .cm-activeLineGutter": { backgroundColor: "var(--hover)" },
  "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection": { backgroundColor: "var(--selection)" },
  "&.cm-focused": { outline: "none" },
});
