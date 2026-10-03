import { useEffect, useId, useState } from "react";
import { usePendingInputs } from "../../store/pendingInputs";

interface Props {
  value: string;
  onCommit(value: string): void;
  validate?(value: string): boolean;
  label: string;
  testId?: string;
  className?: string;
}

/** Text input that keeps a local draft and commits on blur/Enter only when valid; Escape reverts. */
export function CommitInput({ value, onCommit, validate, label, testId, className = "" }: Props) {
  const [draft, setDraft] = useState(value);
  const [seen, setSeen] = useState(value);
  const epoch = usePendingInputs((s) => s.epoch);
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
    usePendingInputs.getState().mark(id, pending);
  }, [id, pending]);
  useEffect(() => () => usePendingInputs.getState().mark(id, false), [id]);

  const commit = (current: string) => {
    if (current === value) return;
    if (!validate || validate(current)) onCommit(current);
  };

  return (
    <input
      type="text"
      aria-label={label}
      aria-invalid={!valid}
      data-testid={testId}
      data-commit-input=""
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={(e) => commit(e.currentTarget.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") commit(e.currentTarget.value);
        else if (e.key === "Escape") setDraft(value);
      }}
      className={`min-w-0 rounded border bg-surface px-2 py-1 font-mono text-sm ${
        valid ? "border-line " : "border-danger bg-danger/10 "
      } ${className}`}
    />
  );
}
