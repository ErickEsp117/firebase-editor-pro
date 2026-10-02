import { useTranslation } from "react-i18next";
import { useSettings, type Language, type ThemeMode } from "../store/settings";

const selectCls =
  "rounded border border-slate-300 bg-white px-2 py-1 text-sm dark:border-slate-600 dark:bg-slate-800";

export function SettingsBar() {
  const { t } = useTranslation();
  const { language, theme, setLanguage, setTheme } = useSettings();
  return (
    <div className="flex items-center gap-4 text-sm">
      <label className="flex items-center gap-2">
        {t("settings.language")}
        <select
          data-testid="language-select"
          className={selectCls}
          value={language}
          onChange={(e) => setLanguage(e.target.value as Language)}
        >
          <option value="es">Español</option>
          <option value="en">English</option>
        </select>
      </label>
      <label className="flex items-center gap-2">
        {t("settings.theme")}
        <select
          data-testid="theme-select"
          className={selectCls}
          value={theme}
          onChange={(e) => setTheme(e.target.value as ThemeMode)}
        >
          <option value="light">{t("settings.themeLight")}</option>
          <option value="dark">{t("settings.themeDark")}</option>
          <option value="system">{t("settings.themeSystem")}</option>
        </select>
      </label>
    </div>
  );
}
