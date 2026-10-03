import { useTranslation } from "react-i18next";
import { useConnection } from "../store/connection";
import { ErrorBanner } from "./ErrorBanner";

export function WelcomeView() {
  const { t } = useTranslation();
  const { phase, error, accounts, addFromPicker, switchTo, clearError } = useConnection();
  const busy = phase === "verifying";
  return (
    <section data-testid="welcome" className="mx-auto flex max-w-xl flex-col gap-4">
      <h2 className="text-2xl font-semibold">{t("welcome.title")}</h2>
      {accounts.length > 0 && (
        <div className="flex flex-col gap-2 rounded border border-slate-200 p-4 dark:border-slate-700">
          <h3 className="font-semibold">{t("welcome.savedAccounts")}</h3>
          <p className="text-sm text-slate-600 dark:text-slate-400">{t("welcome.savedHint")}</p>
          <ul data-testid="welcome-accounts" className="flex flex-col gap-1">
            {accounts.map((a) => (
              <li key={a.id}>
                <button
                  type="button"
                  data-testid={`account-item:${a.id}`}
                  aria-label={t("accounts.connectWith", { project: a.projectId })}
                  disabled={busy}
                  onClick={() => void switchTo(a.id)}
                  className="flex w-full flex-col rounded px-3 py-2 text-left hover:bg-slate-100 disabled:opacity-50 dark:hover:bg-slate-800"
                >
                  <span className="font-medium">{a.projectId}</span>
                  <span className="text-sm text-slate-500 dark:text-slate-400">{a.clientEmail}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
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
        onClick={() => void addFromPicker()}
        className="self-start rounded bg-orange-600 px-4 py-2 font-medium text-white hover:bg-orange-700 disabled:opacity-50"
      >
        {busy ? t("connection.importing") : t("welcome.import")}
      </button>
    </section>
  );
}
