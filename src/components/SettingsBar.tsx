import { useTranslation } from "react-i18next";
import { useSettings, type Language, type ThemeMode } from "../store/settings";

const selectCls =
  "rounded-md border border-line bg-surface px-2 py-1 text-sm";

/** Language and theme selectors; `stacked` is the sidebar layout (one labeled row per setting). */
export function SettingsBar({ stacked = false }: { stacked?: boolean }) {
  const { t } = useTranslation();
  const { language, theme, setLanguage, setTheme } = useSettings();
  const labelCls = `flex items-center gap-2${stacked ? " justify-between" : ""}`;
  return (
    <div data-testid="settings-bar" className={stacked ? "flex flex-col gap-2 text-sm" : "flex items-center gap-4 text-sm"}>
      <label className={labelCls}>
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
      <label className={labelCls}>
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
