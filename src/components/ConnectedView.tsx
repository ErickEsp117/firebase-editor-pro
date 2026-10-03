import { useShortcutActions, withShortcut } from "../hooks/shortcuts";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { AccountSwitcher } from "./AccountSwitcher";
import { SettingsBar } from "./SettingsBar";
import { SidebarResize } from "./SidebarResize";
import { StatusBar } from "./StatusBar";
import { useSettings } from "../store/settings";
import { Database, SlidersHorizontal, Flame, LogOut } from "lucide-react";
import { FirestoreBrowser, FirestoreSidebar } from "./Firestore/FirestoreBrowser";
import { AreaHeader } from "./Firestore/DocumentView";
import { RemoteConfigView } from "./RemoteConfig/RemoteConfigView";
import { ConfirmDialog } from "./ConfirmDialog";
import { OfflineBanner } from "./errors/OfflineBanner";
import { useConnection } from "../store/connection";
import { useArea, type Area } from "../store/rcEditor";
import { hasUnsavedChanges } from "../store/unsavedChanges";

export function ConnectedView() {
  const { t } = useTranslation();
  const busy = useConnection((s) => s.phase === "verifying");
  const connection = useConnection((s) => s.connection);
  const signOut = useConnection((s) => s.signOut);
  const area = useArea((s) => s.area);
  const setArea = useArea((s) => s.setArea);
  const sidebarWidth = useSettings((s) => s.sidebarWidth);
  const [confirming, setConfirming] = useState(false);
  const [visitedRc, setVisitedRc] = useState(area === "remoteConfig");


  const openArea = (next: Area) => {
    if (next === "remoteConfig") setVisitedRc(true);
    setArea(next);
  };

  useShortcutActions("navigation", {
    firestore: () => openArea("firestore"), remoteConfig: () => openArea("remoteConfig"),
  });

  // Signing out with unsaved drafts asks first; with a clean state it returns to the welcome screen
  // directly. Either way the saved keys are kept.
  const requestSignOut = () => {
    if (hasUnsavedChanges()) setConfirming(true);
    else void signOut();
  };

  if (!connection) return null;

  return (
    <section data-testid="connected" aria-busy={busy} inert={busy} className="flex h-full min-h-0">
      <aside data-testid="sidebar" aria-label={t("layout.sidebar")} className="native-sidebar relative flex shrink-0 flex-col select-none" style={{ width: sidebarWidth }}>
        <header className="sidebar-header gap-2 font-semibold" data-tauri-drag-region="deep">
          <Flame size={20} className="text-warning" aria-hidden="true" />{t("app.title")}
        </header>
        <div className="min-h-0 flex-1 overflow-auto">
          <section className="sidebar-section">
            <AccountSwitcher sidebar />
          </section>
          <nav aria-label={t("nav.areas")}>
            <div className="sidebar-section">
              <h2>
                <button type="button" data-testid="nav-firestore" aria-current={area === "firestore" ? "page" : undefined}
                  title={withShortcut(t("nav.firestore"), "firestore")}
                  onClick={() => openArea("firestore")} className="section-label mb-2 flex w-full items-center gap-2 text-left">
                  <Database size={14} aria-hidden="true" />{t("nav.firestore")}
                </button>
              </h2>
              <FirestoreSidebar />
            </div>
            <div className="sidebar-section">
              <h2 id="nav-rc-label" className="section-label mb-2 flex items-center gap-2">
                <SlidersHorizontal size={14} aria-hidden="true" />{t("nav.remoteConfig")}
              </h2>
              <button type="button" data-testid="nav-remote-config" aria-current={area === "remoteConfig" ? "page" : undefined}
                aria-labelledby="nav-rc-label nav-rc-template" title={withShortcut(t("nav.remoteConfig"), "remoteConfig")}
                onClick={() => openArea("remoteConfig")}
                className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left ${area === "remoteConfig" ? "bg-accent text-on-accent" : "hover:bg-hover"}`}>
                <SlidersHorizontal size={16} aria-hidden="true" /><span id="nav-rc-template">{t("layout.template")}</span>
              </button>
            </div>
          </nav>
        </div>
        <div className="space-y-3 border-t border-line p-3">
          <SettingsBar stacked />
          <button type="button" data-testid="disconnect" onClick={requestSignOut} className="flex items-center gap-1.5 text-xs text-fg-muted hover:text-fg">
            <LogOut size={13} aria-hidden="true" />{t("connection.disconnect")}
          </button>
        </div>
        <SidebarResize />
      </aside>
      <div className="flex min-w-0 flex-1 flex-col bg-surface">
        <h2 className="sr-only" data-testid="connected-title">{t("connection.connectedTo", { project: connection.projectId })}</h2>
        <OfflineBanner />
        <div className="min-h-0 flex-1 overflow-auto">
          <div data-testid="area-firestore" hidden={area !== "firestore"}><FirestoreBrowser showSidebar={false} /></div>
          {visitedRc && (
            <div data-testid="area-remote-config" hidden={area !== "remoteConfig"}>
              <AreaHeader title={t("nav.remoteConfig")} subtitle={`${connection.projectId} · ${t("layout.template")}`} />
              <div className="panel-body"><RemoteConfigView /></div>
            </div>
          )}
        </div>
        <StatusBar />
      </div>
      {confirming && (
        <ConfirmDialog
          testId="disconnect"
          danger
          title={t("connection.disconnectTitle")}
          confirmLabel={t("connection.disconnectConfirm")}
          onCancel={() => setConfirming(false)}
          onConfirm={() => {
            setConfirming(false);
            void signOut();
          }}
        >
          <p>{t("connection.disconnectDirtyBody")}</p>
        </ConfirmDialog>
      )}
    </section>
  );
}
