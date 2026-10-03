import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

/** Shown while the OS reports no network; coming back online re-runs every query that had failed. */
export function OfflineBanner() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [online, setOnline] = useState(() => typeof navigator === "undefined" || navigator.onLine !== false);

  const retryFailed = useCallback(
    () => void queryClient.refetchQueries({ type: "active", predicate: (q) => q.state.status === "error" }),
    [queryClient],
  );

  useEffect(() => {
    const goOnline = () => {
      setOnline(true);
      retryFailed();
    };
    const goOffline = () => setOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, [retryFailed]);

  if (online) return null;
  return (
    <div
      role="alert"
      data-testid="offline-banner"
      className="flex items-center justify-between gap-4 border-b border-amber-300 bg-amber-50 px-6 py-2 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100"
    >
      <span>{t("errors.offlineBanner")}</span>
      <button type="button" data-testid="offline-retry" className="underline" onClick={retryFailed}>
        {t("errors.offlineRetry")}
      </button>
    </div>
  );
}
