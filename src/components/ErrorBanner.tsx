import { useTranslation } from "react-i18next";
import type { ConnectionError } from "../core/connection";
import { TechnicalDetails } from "./errors/TechnicalDetails";

const MAX_KEY_ID_CHARS = 80;

export function ErrorBanner({ error, onDismiss }: { error: ConnectionError; onDismiss: () => void }) {
  const { t } = useTranslation();
  const text =
    error.kind === "keyInvalid" && error.reason
      ? t("errors.keyInvalid", { detail: t(`errors.keyReason.${error.reason.code}`, { field: error.reason.field }) })
      : t(`errors.${error.kind}`);
  const technical = [
    error.detail,
    error.fileName && t("errors.technicalFile", { name: error.fileName }),
    error.keyId && t("errors.technicalKeyId", { id: error.keyId.slice(0, MAX_KEY_ID_CHARS) }),
  ]
    .filter(Boolean)
    .join("\n");
  return (
    <div
      role="alert"
      data-testid="connection-error"
      className="flex items-start justify-between gap-4 rounded border border-danger bg-danger/10 p-3 text-sm text-danger "
    >
      <div>
        <span data-testid="connection-error-message">{text}</span>
        {technical && <TechnicalDetails text={technical} testId="connection-error-technical" />}
      </div>
      <button type="button" className="underline" onClick={onDismiss}>
        {t("connection.dismiss")}
      </button>
    </div>
  );
}
