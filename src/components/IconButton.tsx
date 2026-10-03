import type { ButtonHTMLAttributes, ReactNode } from "react";
import { shortcutLabel, type ShortcutAction } from "../hooks/shortcuts";
interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  shortcut?: ShortcutAction;
  children: ReactNode;
  "data-testid"?: string;
}
export function IconButton({ label, shortcut, children, className = "", ...props }: Props) {
  return <button type="button" aria-label={label} title={`${label}${shortcut ? ` (${shortcutLabel(shortcut)})` : ""}`}
    className={`icon-button ${className}`} {...props}>{children}</button>;
}
