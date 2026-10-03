import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { tags } from "@lezer/highlight";

/**
 * Both JSON editors are styled only from the CSS tokens, so they follow light, dark and the system accent
 * without swapping themes: the library themes are disabled (`theme="none"`) and nothing overrides these.
 */
const tokenTheme = EditorView.theme({
  "&": { backgroundColor: "var(--surface)", color: "var(--text)", fontFamily: "var(--font-mono)", fontSize: "12px" },
  ".cm-scroller": { fontFamily: "inherit" },
  ".cm-content": { caretColor: "var(--accent)", padding: "16px 0" },
  ".cm-cursor, .cm-dropCursor": { borderLeftColor: "var(--accent)" },
  ".cm-gutters": { backgroundColor: "var(--surface)", color: "var(--text-secondary)", border: "none" },
  ".cm-activeLine, .cm-activeLineGutter": { backgroundColor: "var(--hover)" },
  "&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionLayer .cm-selectionBackground, .cm-content ::selection": {
    backgroundColor: "var(--selection)",
  },
  ".cm-matchingBracket, &.cm-focused .cm-matchingBracket": { backgroundColor: "var(--selection)", outline: "none" },
  ".cm-panels": { backgroundColor: "var(--panel)", color: "var(--text)" },
  ".cm-tooltip": { backgroundColor: "var(--panel)", color: "var(--text)", border: "1px solid var(--border)" },
  "&.cm-focused": { outline: "none" },
});

const jsonHighlight = HighlightStyle.define([
  { tag: tags.propertyName, color: "var(--syntax-key)" },
  { tag: tags.string, color: "var(--syntax-string)" },
  { tag: tags.number, color: "var(--syntax-number)" },
  { tag: [tags.bool, tags.null], color: "var(--syntax-keyword)" },
  { tag: [tags.separator, tags.squareBracket, tags.brace], color: "var(--text-secondary)" },
]);

export const editorTheme = [tokenTheme, syntaxHighlighting(jsonHighlight)];

/** Tells CodeMirror's base styles (scrollbars, panels) which scheme is active. */
export const editorScheme = (dark: boolean) => EditorView.darkTheme.of(dark);

/** CodeMirror's own UI text (fold tooltips, search panel, lint panel) in Spanish; English is built in. */
const SPANISH_PHRASES: Record<string, string> = {
  "Fold line": "Plegar línea",
  "Unfold line": "Desplegar línea",
  "folded code": "código plegado",
  unfold: "desplegar",
  Find: "Buscar",
  Replace: "Reemplazar",
  next: "siguiente",
  previous: "anterior",
  all: "todo",
  "match case": "mayúsculas/minúsculas",
  regexp: "expresión regular",
  "by word": "palabra completa",
  replace: "reemplazar",
  "replace all": "reemplazar todo",
  close: "cerrar",
  "current match": "coincidencia actual",
  "on line": "en la línea",
  "replaced $ matches": "$ coincidencias reemplazadas",
  "replaced match on line $": "coincidencia reemplazada en la línea $",
  "Go to line": "Ir a la línea",
  go: "ir",
  to: "a",
  Diagnostics: "Diagnósticos",
  "No diagnostics": "Sin diagnósticos",
  "Selection deleted": "Selección eliminada",
  "Control character": "Carácter de control",
  Completions: "Sugerencias",
};

export const editorPhrases = (language: string) => EditorState.phrases.of(language === "es" ? SPANISH_PHRASES : {});
