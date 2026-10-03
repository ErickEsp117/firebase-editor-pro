import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { RemoteConfigApi, RemoteConfigVersion } from "../../core";
import { describeError, technicalText } from "../errors/describeError";
import { TechnicalDetails } from "../errors/TechnicalDetails";
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
          className="rounded border border-line px-2 py-0.5 text-xs disabled:opacity-50"
        >
          {query.isFetching ? t("firestore.refreshing") : t("firestore.refresh")}
        </button>
      </div>
      {query.isPending && (
        <p role="status" data-testid="rc-versions-loading" className="text-xs text-fg-muted">
          {t("rc.versionsLoading")}
        </p>
      )}
      {query.isError && (
        <div role="alert" data-testid="rc-versions-error" className="text-xs text-danger ">
          <p>
            {t("rc.versionsError", { message: describeError(t, query.error) })}
            <button type="button" className="ml-2 underline" onClick={() => void query.refetch()}>
              {t("connection.retry")}
            </button>
          </p>
          {technicalText(query.error) && <TechnicalDetails text={technicalText(query.error)!} testId="rc-versions-error-technical" />}
        </div>
      )}
      {query.isSuccess && versions.length === 0 && (
        <p data-testid="rc-versions-empty" className="text-xs text-fg-muted">
          {t("rc.versionsEmpty")}
        </p>
      )}
      {versions.length > 0 && (
        <div className="overflow-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-line ">
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
                  <tr key={v.versionNumber} data-testid={`rc-version-${v.versionNumber}`} className="border-b border-line align-top ">
                    <td className="py-1 pr-2 font-mono">
                      {v.versionNumber}
                      {current && (
                        <span data-testid="rc-version-current" className="ml-1 rounded bg-success/10 px-1 text-success ">
                          {t("rc.current")}
                        </span>
                      )}
                    </td>
                    <td className="py-1 pr-2">{formatDate(v.updateTime)}</td>
                    <td className="py-1 pr-2">{v.updateOrigin ? t(`rc.origins.${v.updateOrigin}`, { defaultValue: v.updateOrigin }) : "—"}</td>
                    <td className="py-1 pr-2 break-words">
                      {v.description || <span className="text-fg-muted">—</span>}
                      {v.rollbackSource && <span className="block text-fg-muted">{t("rc.rollbackOf", { version: v.rollbackSource })}</span>}
                    </td>
                    <td className="py-1">
                      <button
                        type="button"
                        data-testid={`rc-rollback-${v.versionNumber}`}
                        disabled={busy || current}
                        onClick={() => onRollback(v)}
                        className="rounded border border-line px-2 py-0.5 disabled:opacity-40"
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
          className="rounded border border-line px-2 py-0.5 text-xs disabled:opacity-50"
        >
          {query.isFetchingNextPage ? t("firestore.loadingMore") : t("firestore.loadMore")}
        </button>
      )}
    </section>
  );
}
