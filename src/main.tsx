import { initNativeAppearance } from "./platform/appearance";
import { useSettings } from "./store/settings";
import React from "react";
import ReactDOM from "react-dom/client";
import "./i18n";
import "./index.css";
import App from "./App";

initNativeAppearance();
// Apply the saved or system theme before the first paint so a dark launch never flashes white.
{
  const { theme } = useSettings.getState();
  const systemDark = window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
  document.documentElement.classList.toggle("dark", theme === "dark" || (theme === "system" && systemDark));
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
