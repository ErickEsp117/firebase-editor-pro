import { useTranslation } from "react-i18next";
import { useConnection } from "../store/connection";
import { ErrorBanner } from "./ErrorBanner";
import { OrphanedCredentialNotice, RemoveAccountButton } from "./RemoveAccountButton";

export function WelcomeView() {
  const { t } = useTranslation();
  const { phase, error, retry, accounts, addFromPicker, switchTo, clearError } = useConnection();
  const busy = phase === "verifying";
  return (
    <section data-testid="welcome" className="mx-auto flex max-w-xl flex-col gap-4">
      <h2 className="text-2xl font-semibold">{t("welcome.title")}</h2>
      {accounts.length > 0 && (
        <div className="flex flex-col gap-2 rounded border border-line p-4 ">
          <h3 className="font-semibold">{t("welcome.savedAccounts")}</h3>
          <p className="text-sm text-fg-muted ">{t("welcome.savedHint")}</p>
          <ul data-testid="welcome-accounts" className="flex flex-col gap-1">
            {accounts.map((a) => (
              <li key={a.id} className="flex items-center gap-1">
                <button
                  type="button"
                  data-testid={`account-item:${a.id}`}
                  aria-label={t("accounts.connectWith", { project: a.projectId })}
                  disabled={busy}
                  onClick={() => void switchTo(a.id)}
                  className="flex w-full flex-col rounded px-3 py-2 text-left hover:bg-hover disabled:opacity-50 "
                >
                  <span className="font-medium">{a.projectId}</span>
                  <span className="text-sm text-fg-muted ">{a.clientEmail}</span>
                </button>
                <RemoveAccountButton account={a} />
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
      {error && (
        <ErrorBanner
          error={error}
          onDismiss={clearError}
          onRetry={error.kind === "keychainDenied" && retry && !busy ? () => void retry() : undefined}
        />
      )}
      <OrphanedCredentialNotice />
      <button
        type="button"
        data-testid="import-key"
        disabled={busy}
        onClick={() => void addFromPicker()}
        className="btn-primary self-start px-4 py-2"
      >
        {busy ? t("connection.importing") : accounts.length > 0 ? t("accounts.add") : t("welcome.import")}
      </button>
    </section>
  );
}
