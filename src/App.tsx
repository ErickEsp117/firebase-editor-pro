import { useKeyboardShortcuts } from "./hooks/shortcuts";
import { useResolvedTheme } from "./store/useResolvedTheme";
import { syncWindowTheme, refreshAppearance } from "./platform/appearance";
import { QueryClientProvider } from "@tanstack/react-query";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { ConnectedView } from "./components/ConnectedView";
import { OfflineBanner } from "./components/errors/OfflineBanner";
import { SettingsBar } from "./components/SettingsBar";
import { WelcomeView } from "./components/WelcomeView";
import { queryClient } from "./queryClient";
import { useConnection } from "./store/connection";
import { useSettings } from "./store/settings";

function useApplyTheme() {
  const theme = useSettings((s) => s.theme);
  const resolved = useResolvedTheme();
  useEffect(() => { void syncWindowTheme(theme); }, [theme]);
  useEffect(() => {
    document.documentElement.classList.toggle("dark", resolved === "dark");
    void refreshAppearance();
  }, [resolved]);
}

function Shell() {
  const { t } = useTranslation();
  const phase = useConnection((s) => s.phase);
  const activeId = useConnection((s) => s.activeId);
  const connection = useConnection((s) => s.connection);
  const restore = useConnection((s) => s.restore);
  useApplyTheme();
  useKeyboardShortcuts();
  useEffect(() => {
    void restore();
  }, [restore]);

  // While an added key is being verified the current session stays on screen; the welcome screen only
  // shows the verifying state when there is no connection yet. The key remount drops stale project data.
  const showConnected = phase === "connected" || (phase === "verifying" && connection !== null);

  return (
    <div className="flex h-screen flex-col text-fg">
      <OfflineBanner />
      {showConnected ? <ConnectedView key={activeId ?? "none"} /> : (
        <div className="flex h-full flex-col bg-surface">
          <header className="welcome-toolbar editor-toolbar flex items-center justify-between gap-4 px-6" data-tauri-drag-region="deep">
            <h1 className="font-semibold">{t("app.title")}</h1><SettingsBar />
          </header>
          <main className="mx-auto w-full max-w-2xl p-8">
            {phase === "restoring" && <p>{t("connection.connecting")}</p>}
            {(phase === "welcome" || phase === "verifying") && <WelcomeView />}
          </main>
        </div>
      )}
    </div>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Shell />
    </QueryClientProvider>
  );
}
