import { useTranslation } from "react-i18next";
import { useConnection } from "../store/connection";
import { ErrorBanner } from "./ErrorBanner";

export function WelcomeView() {
  const { t } = useTranslation();
  const { phase, error, importFromPicker, clearError } = useConnection();
  const busy = phase === "verifying";
  return (
    <section data-testid="welcome" className="mx-auto flex max-w-xl flex-col gap-4">
      <h2 className="text-2xl font-semibold">{t("welcome.title")}</h2>
      <p>{t("welcome.intro")}</p>
      <ol className="list-decimal space-y-1 pl-6 text-sm">
        <li>{t("welcome.step1")}</li>
        <li>{t("welcome.step2")}</li>
        <li>{t("welcome.step3")}</li>
      </ol>
      {error && <ErrorBanner error={error} onDismiss={clearError} />}
      <button
        type="button"
        data-testid="import-key"
        disabled={busy}
        onClick={() => void importFromPicker()}
        className="self-start rounded bg-orange-600 px-4 py-2 font-medium text-white hover:bg-orange-700 disabled:opacity-50"
      >
        {busy ? t("connection.importing") : t("welcome.import")}
      </button>
    </section>
  );
}
