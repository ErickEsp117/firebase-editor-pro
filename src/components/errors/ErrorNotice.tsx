import { useTranslation } from "react-i18next";
import { apiErrorKind } from "../../core";
import { describeError, technicalText } from "./describeError";
import { TechnicalDetails } from "./TechnicalDetails";

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
  const technical = technicalText(error);
  return (
    <div role="alert" data-testid={testId} data-error-kind={kind} className="space-y-1 text-sm text-danger ">
      {summary && <p className="font-medium">{summary}</p>}
      <p data-testid={`${testId}-message`}>{describeError(t, error)}</p>
      {technical && <TechnicalDetails text={technical} testId={`${testId}-technical`} />}
      {onRetry && (
        <button type="button" data-testid={retryTestId ?? `${testId}-retry`} className="underline" onClick={onRetry}>
          {t("connection.retry")}
        </button>
      )}
    </div>
  );
}
