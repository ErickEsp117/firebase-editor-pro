import { useTranslation } from "react-i18next";
import type { ConnectionError } from "../core/connection";

export function ErrorBanner({ error, onDismiss }: { error: ConnectionError; onDismiss: () => void }) {
  const { t } = useTranslation();
  const text =
    error.kind === "keyInvalid"
      ? t("errors.keyInvalid", { detail: error.detail })
      : t(`errors.${error.kind}`, { cause: error.detail });
  return (
    <div
      role="alert"
      data-testid="connection-error"
      className="flex items-start justify-between gap-4 rounded border border-red-300 bg-red-50 p-3 text-sm text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200"
    >
      <span>{text}</span>
      <button type="button" className="underline" onClick={onDismiss}>
        {t("connection.dismiss")}
      </button>
    </div>
  );
}
