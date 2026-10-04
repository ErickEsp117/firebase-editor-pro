import { isMac, useKeyboardShortcuts } from "./hooks/shortcuts";
import { useResolvedTheme } from "./store/useResolvedTheme";
import { syncWindowTheme, refreshAppearance } from "./platform/appearance";
import { QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useLayoutEffect } from "react";
import { useTranslation } from "react-i18next";
import { ConnectedView } from "./components/ConnectedView";
import { OfflineBanner } from "./components/errors/OfflineBanner";
import { SettingsBar } from "./components/SettingsBar";
import { WelcomeView } from "./components/WelcomeView";
import { queryClient } from "./queryClient";
import { useConnection } from "./store/connection";
import { useSettings } from "./store/settings";
import { getPlatform } from "./platform";

function useApplyTheme() {
  const theme = useSettings((s) => s.theme);
  const resolved = useResolvedTheme();
  useEffect(() => { void syncWindowTheme(theme); }, [theme]);
  // Layout effect: the class must be on <html> before the browser paints the new theme.
  useLayoutEffect(() => {
    document.documentElement.classList.toggle("dark", resolved === "dark");
  }, [resolved]);
  useEffect(() => { void refreshAppearance(); }, [resolved]);
}

/**
 * Account actions make the connected view inert, which drops keyboard focus to <body>, and switching
 * remounts it. Afterwards focus lands on the account list toggle (or the welcome import button).
 */
function useRestoreFocusAfterAccountActions() {
  useEffect(
    () =>
      useConnection.subscribe((state, previous) => {
        if (previous.phase !== "verifying" || state.phase === "verifying") return;
        requestAnimationFrame(() => {
          if (document.activeElement && document.activeElement !== document.body) return;
          document.querySelector<HTMLElement>('[data-testid="account-switcher-toggle"], [data-testid="import-key"]')?.focus();
        });
      }),
    [],
  );
}

function Shell() {
  const { t } = useTranslation();
  const phase = useConnection((s) => s.phase);
  const activeId = useConnection((s) => s.activeId);
  const connection = useConnection((s) => s.connection);
  const restore = useConnection((s) => s.restore);
  useApplyTheme();
  useKeyboardShortcuts();
  useRestoreFocusAfterAccountActions();
  useEffect(() => {
    void restore();
  }, [restore]);

  // While an added key is being verified the current session stays on screen; the welcome screen only
  // shows the verifying state when there is no connection yet. The key remount drops stale project data.
  const showConnected = phase === "connected" || (phase === "verifying" && connection !== null);

  return (
    <div className="flex h-screen flex-col text-fg">
      {showConnected ? <ConnectedView key={activeId ?? "none"} /> : (
        <div className="flex h-full flex-col bg-surface">
          <header className="welcome-toolbar editor-toolbar justify-between" data-tauri-drag-region="deep">
            <h1 className="font-semibold">{t("app.title")}</h1><SettingsBar />
          </header>
          <OfflineBanner />
          <main className="mx-auto w-full max-w-2xl p-8">
            {phase === "restoring" && (
              <div className="space-y-2">
                <p>{t("connection.connecting")}</p>
                {/* Only the macOS keychain asks for a password; Windows Credential Manager never prompts. */}
                {getPlatform().mode === "tauri" && isMac() && <p data-testid="keychain-hint" className="text-sm text-fg-muted">{t("connection.keychainHint")}</p>}
              </div>
            )}
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
