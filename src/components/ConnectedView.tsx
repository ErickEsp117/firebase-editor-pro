import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { listRootCollections } from "../core/connection";
import { useConnection } from "../store/connection";

export function ConnectedView() {
  const { t } = useTranslation();
  const connection = useConnection((s) => s.connection);
  const disconnect = useConnection((s) => s.disconnect);
  const [confirming, setConfirming] = useState(false);

  const projectId = connection?.projectId;
  const collections = useQuery({
    queryKey: ["fs", projectId, "root-collections"],
    queryFn: () => listRootCollections(connection!),
    enabled: !!connection,
  });
  if (!connection) return null;

  return (
    <section data-testid="connected" className="mx-auto flex max-w-xl flex-col gap-4">
      <h2 className="text-2xl font-semibold" data-testid="connected-title">
        {t("connection.connectedTo", { project: connection.projectId })}
      </h2>
      <p className="text-sm text-slate-600 dark:text-slate-400">
        {t("connection.serviceAccount", { email: connection.clientEmail })}
      </p>
      <div>
        <h3 className="mb-2 font-medium">{t("connection.collections")}</h3>
        {collections.isPending && <p>{t("connection.collectionsLoading")}</p>}
        {collections.isError && (
          <div role="alert" data-testid="collections-error" className="text-sm text-red-700 dark:text-red-300">
            <p>{t("connection.collectionsError", { message: collections.error.message })}</p>
            <button type="button" className="underline" onClick={() => void collections.refetch()}>
              {t("connection.retry")}
            </button>
          </div>
        )}
        {collections.data?.length === 0 && <p>{t("connection.collectionsEmpty")}</p>}
        <ul data-testid="collections-list" className="space-y-1">
          {collections.data?.map((id) => (
            <li key={id} className="rounded bg-slate-100 px-3 py-1 font-mono text-sm dark:bg-slate-800">
              {id}
            </li>
          ))}
        </ul>
      </div>
      <button
        type="button"
        data-testid="disconnect"
        onClick={() => setConfirming(true)}
        className="self-start rounded border border-slate-400 px-3 py-1 text-sm hover:bg-slate-100 dark:hover:bg-slate-800"
      >
        {t("connection.disconnect")}
      </button>
      {confirming && (
        <div
          role="dialog"
          aria-modal="true"
          data-testid="disconnect-dialog"
          className="fixed inset-0 flex items-center justify-center bg-black/50"
        >
          <div className="max-w-sm space-y-3 rounded bg-white p-5 shadow-lg dark:bg-slate-800">
            <h3 className="font-semibold">{t("connection.disconnectTitle")}</h3>
            <p className="text-sm">{t("connection.disconnectBody")}</p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                data-testid="disconnect-cancel"
                className="rounded border border-slate-400 px-3 py-1 text-sm"
                onClick={() => setConfirming(false)}
              >
                {t("connection.cancel")}
              </button>
              <button
                type="button"
                data-testid="disconnect-confirm"
                className="rounded bg-red-600 px-3 py-1 text-sm text-white"
                onClick={() => {
                  setConfirming(false);
                  void disconnect();
                }}
              >
                {t("connection.disconnectConfirm")}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
