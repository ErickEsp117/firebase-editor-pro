import { useEffect, useId, useState } from "react";
import { usePendingInputs, type InputScope } from "../../store/pendingInputs";

interface Props {
  value: string;
  onCommit(value: string): void;
  validate?(value: string): boolean;
  label: string;
  testId?: string;
  className?: string;
  /** The area whose unsaved state this cell belongs to. */
  scope?: InputScope;
}

/**
 * Text field that keeps a local draft and commits on blur/Enter only when the user changed it and it is
 * valid; Escape reverts. Multi-line values use a textarea (Cmd/Ctrl+Enter commits) because a single-line
 * input would drop their line breaks.
 */
export function CommitInput({ value, onCommit, validate, label, testId, className = "", scope = "firestore" }: Props) {
  const [draft, setDraft] = useState(value);
  const [seen, setSeen] = useState(value);
  const epoch = usePendingInputs((s) => s.epochs[scope]);
  const [seenEpoch, setSeenEpoch] = useState(epoch);
  if (seen !== value || seenEpoch !== epoch) {
    setSeen(value);
    setSeenEpoch(epoch);
    setDraft(value);
  }
  const valid = !validate || validate(draft);
  const id = useId();
  const pending = draft !== value;
  useEffect(() => {
    usePendingInputs.getState().mark(id, pending, scope);
  }, [id, pending, scope]);
  useEffect(() => () => usePendingInputs.getState().mark(id, false, scope), [id, scope]);

  // Commits the React draft, never the DOM value: focusing and leaving an untouched cell is a no-op.
  const commit = () => {
    if (draft === value) return;
    if (!validate || validate(draft)) onCommit(draft);
  };
  // A focused textarea stays one until blur: swapping it for an input after a commit or Escape that
  // removes the last line break would drop the keyboard focus mid-edit.
  const [keepTextarea, setKeepTextarea] = useState(false);
  const multiline = keepTextarea || /[\r\n]/.test(value) || /[\r\n]/.test(draft);
  const common = {
    "aria-label": label,
    "aria-invalid": !valid,
    "data-testid": testId,
    "data-commit-input": "",
    value: draft,
    onBlur: () => {
      setKeepTextarea(false);
      commit();
    },
    className: `min-w-0 rounded border px-2 py-1 font-mono text-sm ${valid ? "border-line bg-surface" : "border-danger bg-danger/10"} ${className}`,
  };

  return multiline ? (
    <textarea
      {...common}
      rows={Math.min(8, draft.split(/\r\n|\r|\n/).length)}
      onFocus={() => setKeepTextarea(true)}
      onChange={(e) => setDraft(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) commit();
        else if (e.key === "Escape") setDraft(value);
      }}
    />
  ) : (
    <input
      type="text"
      {...common}
      onChange={(e) => setDraft(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") commit();
        else if (e.key === "Escape") setDraft(value);
      }}
    />
  );
}
