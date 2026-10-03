import { useTranslation } from "react-i18next";
import { diagnosticText } from "../../errors/describeError";
import { TechnicalDetails } from "../../errors/TechnicalDetails";
import { ioErrorMessage } from "./ioErrors";

/**
 * A dialog failure kept as data (i18n key + the thrown value) so it is translated at render time and follows the
 * active language. Never store the already-translated string in state.
 */
export interface DialogFailure {
  key: string;
  params?: Record<string, unknown>;
  /** Thrown value; its localized description fills `{{message}}` and any raw service text goes to the technical details. */
  cause?: unknown;
}

export function DialogError({ failure, testId }: { failure: DialogFailure; testId: string }) {
  const { t } = useTranslation();
  const technical = diagnosticText(failure.cause);
  const message = failure.cause === undefined ? undefined : ioErrorMessage(t, failure.cause);
  return (
    <div role="alert" className="space-y-1 text-sm text-danger ">
      <p data-testid={testId}>{t(failure.key, { ...failure.params, message })}</p>
      {technical && <TechnicalDetails text={technical} testId={`${testId}-technical`} />}
    </div>
  );
}
