import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { FirestoreBrowser } from "./Firestore/FirestoreBrowser";
import { RemoteConfigView } from "./RemoteConfig/RemoteConfigView";
import { useConnection } from "../store/connection";
import { useArea, type Area } from "../store/rcEditor";

const AREAS: { area: Area; testId: string; label: string }[] = [
  { area: "firestore", testId: "nav-firestore", label: "nav.firestore" },
  { area: "remoteConfig", testId: "nav-remote-config", label: "nav.remoteConfig" },
];

export function ConnectedView() {
  const { t } = useTranslation();
  const connection = useConnection((s) => s.connection);
  const signOut = useConnection((s) => s.signOut);
  const area = useArea((s) => s.area);
  const setArea = useArea((s) => s.setArea);
  const [confirming, setConfirming] = useState(false);
  const [visitedRc, setVisitedRc] = useState(area === "remoteConfig");

  useEffect(() => () => setArea("firestore"), [setArea]);

  const openArea = (next: Area) => {
    if (next === "remoteConfig") setVisitedRc(true);
    setArea(next);
  };

  if (!connection) return null;

  return (
    <section data-testid="connected" className="flex flex-col gap-4">
      <h2 className="text-2xl font-semibold" data-testid="connected-title">
        {t("connection.connectedTo", { project: connection.projectId })}
      </h2>
      <p className="text-sm text-slate-600 dark:text-slate-400">
        {t("connection.serviceAccount", { email: connection.clientEmail })}
      </p>
      <nav aria-label={t("nav.areas")} className="flex gap-2 border-b border-slate-200 dark:border-slate-700">
        {AREAS.map((a) => (
          <button
            key={a.area}
            type="button"
            data-testid={a.testId}
            aria-current={area === a.area ? "page" : undefined}
            onClick={() => openArea(a.area)}
            className={`-mb-px border-b-2 px-3 py-1.5 text-sm ${
              area === a.area ? "border-blue-700 font-semibold" : "border-transparent text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
            }`}
          >
            {t(a.label)}
          </button>
        ))}
      </nav>
      {/* Both areas stay mounted once opened (just hidden) so an open document and its unsaved edits survive switching. */}
      <div data-testid="area-firestore" hidden={area !== "firestore"}>
        <FirestoreBrowser />
      </div>
      {visitedRc && (
        <div data-testid="area-remote-config" hidden={area !== "remoteConfig"}>
          <RemoteConfigView />
        </div>
      )}
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
                  void signOut();
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
