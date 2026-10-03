import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import { apiErrorKind } from "../../core";
import { technicalText } from "../errors/describeError";
import { TechnicalDetails } from "../errors/TechnicalDetails";
import { ioErrorMessage } from "../Firestore/crud/ioErrors";
import type { RcIssue } from "./rcModel";

/** What a failed dialog action keeps, so its text is rebuilt in the active language on every render. */
export type RcFailure =
  | { kind: "issues"; issues: RcIssue[] }
  | { kind: "rejected"; error: unknown }
  | { kind: "publishFailed"; error: unknown };

/** Only a real API rejection reads as "the template was rejected"; offline, permission and similar failures are explained on their own. */
export function rejectionText(t: TFunction, error: unknown): string {
  return apiErrorKind(error) === "other" && technicalText(error) !== null ? t("rc.validationServer") : ioErrorMessage(t, error);
}

const issueDetails = (issues: RcIssue[]) => issues.flatMap((i) => (i.detail ? [i.detail] : [])).join("\n");

/** Localized problems; the parser's own wording is folded into labeled technical details below the list. */
export function IssueList({ issues, testId }: { issues: RcIssue[]; testId: string }) {
  const { t } = useTranslation();
  const detail = issueDetails(issues);
  return (
    <>
      <ul className="list-disc pl-5">
        {issues.map((issue, i) => (
          <li key={i}>{t(issue.key, issue.params)}</li>
        ))}
      </ul>
      {detail && <TechnicalDetails text={detail} testId={`${testId}-technical`} />}
    </>
  );
}

/** One localized sentence plus the service's raw reply, if any, behind the technical-details disclosure. */
export function ErrorMessage({ text, error, testId }: { text: string; error?: unknown; testId: string }) {
  const technical = error === undefined ? null : technicalText(error);
  return (
    <>
      <p data-testid={`${testId}-message`}>{text}</p>
      {technical && <TechnicalDetails text={technical} testId={`${testId}-technical`} />}
    </>
  );
}

export function FailureBody({ failure, testId }: { failure: RcFailure; testId: string }) {
  const { t } = useTranslation();
  switch (failure.kind) {
    case "issues":
      return (
        <>
          <p data-testid={`${testId}-message`}>{failure.issues.map((i) => t(i.key, i.params)).join(" ")}</p>
          {issueDetails(failure.issues) && <TechnicalDetails text={issueDetails(failure.issues)} testId={`${testId}-technical`} />}
        </>
      );
    case "rejected":
      return <ErrorMessage text={rejectionText(t, failure.error)} error={failure.error} testId={testId} />;
    case "publishFailed":
      return (
        <ErrorMessage text={t("rc.publishFailed", { message: ioErrorMessage(t, failure.error) })} error={failure.error} testId={testId} />
      );
  }
}
