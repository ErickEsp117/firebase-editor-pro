import { useTranslation } from "react-i18next";

/** Collapsed, labeled home for text the service or the parser wrote (usually English); never part of the main message. */
export function TechnicalDetails({ text, testId }: { text: string; testId: string }) {
  const { t } = useTranslation();
  return (
    <details className="opacity-80" data-testid={testId}>
      <summary>{t("errors.technicalDetails")}</summary>
      <code className="whitespace-pre-wrap break-words">{text}</code>
    </details>
  );
}
