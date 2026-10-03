import { useTranslation } from "react-i18next";
import { ApiError, apiErrorKind } from "../../core";
import { describeError } from "./describeError";

interface Props {
  error: unknown;
  /** Sentence that frames the failure, e.g. "Could not load the document". */
  summary?: string;
  onRetry?: () => void;
  testId?: string;
  retryTestId?: string;
}

/** Explains an API failure (offline, 401, 403, 404…) in the active language, with the raw server detail folded away. */
export function ErrorNotice({ error, summary, onRetry, testId = "error-notice", retryTestId }: Props) {
  const { t } = useTranslation();
  const kind = apiErrorKind(error);
  const apiError = error instanceof ApiError ? error : null;
  return (
    <div role="alert" data-testid={testId} data-error-kind={kind} className="space-y-1 text-sm text-red-700 dark:text-red-300">
      {summary && <p className="font-medium">{summary}</p>}
      <p data-testid={`${testId}-message`}>{describeError(t, error)}</p>
      {apiError && kind !== "other" && (
        <details className="opacity-80">
          <summary>{t("errors.technicalDetails")}</summary>
          <code data-testid={`${testId}-technical`}>
            {apiError.http > 0 ? `HTTP ${apiError.http} ` : ""}
            {apiError.status}: {apiError.message}
          </code>
        </details>
      )}
      {onRetry && (
        <button type="button" data-testid={retryTestId ?? `${testId}-retry`} className="underline" onClick={onRetry}>
          {t("connection.retry")}
        </button>
      )}
    </div>
  );
}
