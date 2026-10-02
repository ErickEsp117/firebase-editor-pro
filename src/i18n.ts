import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "./locales/en.json";
import es from "./locales/es.json";
import { useSettings } from "./store/settings";

void i18n.use(initReactI18next).init({
  resources: { es: { translation: es }, en: { translation: en } },
  lng: useSettings.getState().language,
  fallbackLng: "es",
  interpolation: { escapeValue: false },
});

useSettings.subscribe((s) => {
  if (i18n.language !== s.language) void i18n.changeLanguage(s.language);
  document.documentElement.lang = s.language;
});
document.documentElement.lang = useSettings.getState().language;

export default i18n;
