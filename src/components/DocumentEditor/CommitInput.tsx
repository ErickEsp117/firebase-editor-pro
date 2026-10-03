import { useState } from "react";

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
  if (seen !== value) {
    setSeen(value);
    setDraft(value);
  }
  const valid = !validate || validate(draft);

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
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={(e) => commit(e.currentTarget.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") commit(e.currentTarget.value);
        else if (e.key === "Escape") setDraft(value);
      }}
      className={`min-w-0 rounded border px-1.5 py-0.5 font-mono text-xs ${
        valid ? "border-line " : "border-danger bg-danger/10 "
      } ${className}`}
    />
  );
}
