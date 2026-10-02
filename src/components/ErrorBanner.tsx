import { useTranslation } from "react-i18next";
import type { ConnectionError } from "../core/connection";

export function ErrorBanner({ error, onDismiss }: { error: ConnectionError; onDismiss: () => void }) {
  const { t } = useTranslation();
  const localized = error.kind === "keyInvalid" && error.reason;
  const text = localized
    ? t("errors.keyInvalid", {
        detail: t(`errors.keyReason.${error.reason!.code}`, { field: error.reason!.field }),
      })
    : t(`errors.${error.kind}`, { cause: error.detail });
  return (
    <div
      role="alert"
      data-testid="connection-error"
      className="flex items-start justify-between gap-4 rounded border border-red-300 bg-red-50 p-3 text-sm text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200"
    >
      <div>
        <span>{text}</span>
        {localized && (
          <details className="mt-1 opacity-80" data-testid="connection-error-technical">
            <summary>{t("errors.technicalDetails")}</summary>
            <code>{error.detail}</code>
          </details>
        )}
      </div>
      <button type="button" className="underline" onClick={onDismiss}>
        {t("connection.dismiss")}
      </button>
    </div>
  );
}
