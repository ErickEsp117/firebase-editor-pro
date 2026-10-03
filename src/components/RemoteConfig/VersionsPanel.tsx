import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { RemoteConfigApi, RemoteConfigVersion } from "../../core";
import { describeError } from "../errors/describeError";
import { useRcVersions } from "./useRemoteConfig";

interface Props {
  api: RemoteConfigApi | null;
  currentVersion?: string;
  busy: boolean;
  onRollback(version: RemoteConfigVersion): void;
}

export function VersionsPanel({ api, currentVersion, busy, onRollback }: Props) {
  const { t, i18n } = useTranslation();
  const query = useRcVersions(api);
  const versions = useMemo(() => query.data?.pages.flatMap((p) => p.versions) ?? [], [query.data]);

  const formatDate = (iso?: string) => {
    if (!iso) return "—";
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? iso : d.toLocaleString(i18n.language);
  };

  return (
    <section data-testid="rc-versions" aria-labelledby="rc-versions-title" className="space-y-2">
      <div className="flex items-center gap-2">
        <h3 id="rc-versions-title" className="mr-auto font-medium">
          {t("rc.versions")}
        </h3>
        <button
          type="button"
          data-testid="rc-versions-refresh"
          disabled={query.isFetching}
          onClick={() => void query.refetch()}
          className="rounded border border-slate-400 px-2 py-0.5 text-xs disabled:opacity-50"
        >
          {query.isFetching ? t("firestore.refreshing") : t("firestore.refresh")}
        </button>
      </div>
      {query.isPending && (
        <p role="status" data-testid="rc-versions-loading" className="text-xs text-slate-500">
          {t("rc.versionsLoading")}
        </p>
      )}
      {query.isError && (
        <p role="alert" data-testid="rc-versions-error" className="text-xs text-red-700 dark:text-red-300">
          {t("rc.versionsError", { message: describeError(t, query.error) })}
          <button type="button" className="ml-2 underline" onClick={() => void query.refetch()}>
            {t("connection.retry")}
          </button>
        </p>
      )}
      {query.isSuccess && versions.length === 0 && (
        <p data-testid="rc-versions-empty" className="text-xs text-slate-500">
          {t("rc.versionsEmpty")}
        </p>
      )}
      {versions.length > 0 && (
        <div className="overflow-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-700">
                <th className="py-1 pr-2">{t("rc.colVersion")}</th>
                <th className="py-1 pr-2">{t("rc.colDate")}</th>
                <th className="py-1 pr-2">{t("rc.colOrigin")}</th>
                <th className="py-1 pr-2">{t("rc.colDescription")}</th>
                <th className="py-1" />
              </tr>
            </thead>
            <tbody>
              {versions.map((v) => {
                const current = v.versionNumber === currentVersion;
                return (
                  <tr key={v.versionNumber} data-testid={`rc-version-${v.versionNumber}`} className="border-b border-slate-100 align-top dark:border-slate-800">
                    <td className="py-1 pr-2 font-mono">
                      {v.versionNumber}
                      {current && (
                        <span data-testid="rc-version-current" className="ml-1 rounded bg-emerald-100 px-1 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200">
                          {t("rc.current")}
                        </span>
                      )}
                    </td>
                    <td className="py-1 pr-2">{formatDate(v.updateTime)}</td>
                    <td className="py-1 pr-2">{v.updateOrigin ? t(`rc.origins.${v.updateOrigin}`, { defaultValue: v.updateOrigin }) : "—"}</td>
                    <td className="py-1 pr-2 break-words">
                      {v.description || <span className="text-slate-400">—</span>}
                      {v.rollbackSource && <span className="block text-slate-500">{t("rc.rollbackOf", { version: v.rollbackSource })}</span>}
                    </td>
                    <td className="py-1">
                      <button
                        type="button"
                        data-testid={`rc-rollback-${v.versionNumber}`}
                        disabled={busy || current}
                        onClick={() => onRollback(v)}
                        className="rounded border border-slate-400 px-2 py-0.5 disabled:opacity-40"
                      >
                        {t("rc.rollback")}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {query.hasNextPage && (
        <button
          type="button"
          data-testid="rc-versions-more"
          disabled={query.isFetchingNextPage}
          onClick={() => void query.fetchNextPage()}
          className="rounded border border-slate-400 px-2 py-0.5 text-xs disabled:opacity-50"
        >
          {query.isFetchingNextPage ? t("firestore.loadingMore") : t("firestore.loadMore")}
        </button>
      )}
    </section>
  );
}
