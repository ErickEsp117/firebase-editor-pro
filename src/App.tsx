import { QueryClientProvider } from "@tanstack/react-query";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { ConnectedView } from "./components/ConnectedView";
import { SettingsBar } from "./components/SettingsBar";
import { WelcomeView } from "./components/WelcomeView";
import { queryClient } from "./queryClient";
import { useConnection } from "./store/connection";
import { useSettings } from "./store/settings";

function useApplyTheme() {
  const theme = useSettings((s) => s.theme);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      const dark = theme === "dark" || (theme === "system" && mq.matches);
      document.documentElement.classList.toggle("dark", dark);
    };
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, [theme]);
}

function Shell() {
  const { t } = useTranslation();
  const phase = useConnection((s) => s.phase);
  const restore = useConnection((s) => s.restore);
  useApplyTheme();
  useEffect(() => {
    void restore();
  }, [restore]);

  return (
    <div className="min-h-screen bg-white text-slate-900 dark:bg-slate-900 dark:text-slate-100">
      <header className="flex items-center justify-between border-b border-slate-200 px-6 py-3 dark:border-slate-700">
        <h1 className="text-lg font-bold">{t("app.title")}</h1>
        <SettingsBar />
      </header>
      <main className="p-6">
        {phase === "restoring" && <p>{t("connection.connecting")}</p>}
        {(phase === "welcome" || phase === "verifying") && <WelcomeView />}
        {phase === "connected" && <ConnectedView />}
      </main>
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
