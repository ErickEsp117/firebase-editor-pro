import { onlineManager, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { reportReachable } from "../../core";
import { useOffline } from "../../store/network";

/**
 * Shown while the OS reports no network or Google stopped answering. Coming back online, or Retry,
 * re-runs every query that had failed.
 */
export function OfflineBanner() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const offline = useOffline();

  const retryFailed = useCallback(() => {
    // Retry is the user's signal that the network is back: hide the notice and ask again. A failing
    // request brings it straight back. Queries paused by an OS offline event resume too.
    onlineManager.setOnline(navigator.onLine !== false);
    reportReachable(true);
    void queryClient.refetchQueries({ type: "active", predicate: (q) => q.state.status === "error" });
  }, [queryClient]);

  useEffect(() => {
    window.addEventListener("online", retryFailed);
    return () => window.removeEventListener("online", retryFailed);
  }, [retryFailed]);

  if (!offline) return null;
  return (
    <div
      role="alert"
      data-testid="offline-banner"
      className="flex shrink-0 items-center justify-between gap-4 border-b border-warning bg-warning/10 px-[18px] py-2 text-sm text-warning"
    >
      <span>{t("errors.offlineBanner")}</span>
      <button type="button" data-testid="offline-retry" className="shrink-0 underline" onClick={retryFailed}>
        {t("errors.offlineRetry")}
      </button>
    </div>
  );
}
