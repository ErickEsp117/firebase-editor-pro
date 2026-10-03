import { useTranslation } from "react-i18next";
import { SIDEBAR_MAX, SIDEBAR_MIN, useSettings } from "../store/settings";

export function SidebarResize() {
  const { t } = useTranslation();
  const width = useSettings((s) => s.sidebarWidth);
  const setWidth = useSettings((s) => s.setSidebarWidth);
  return <div role="separator" aria-orientation="vertical" aria-label={t("layout.resizeSidebar")} title={t("layout.resizeSidebar")}
    aria-valuemin={SIDEBAR_MIN} aria-valuemax={SIDEBAR_MAX} aria-valuenow={width} tabIndex={0} data-testid="sidebar-resize"
    className="absolute -right-1 top-0 z-10 h-full w-2 cursor-col-resize touch-none hover:bg-accent/40 focus-visible:bg-accent/40"
    onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); }}
    onPointerMove={(event) => {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        setWidth(event.clientX - (event.currentTarget.parentElement?.getBoundingClientRect().left ?? 0));
      }
    }}
    onPointerUp={(event) => { event.currentTarget.releasePointerCapture(event.pointerId); }}
    onKeyDown={(event) => {
      if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        event.preventDefault(); setWidth(width + (event.key === "ArrowLeft" ? -10 : 10));
      } else if (event.key === "Home" || event.key === "End") {
        event.preventDefault(); setWidth(event.key === "Home" ? SIDEBAR_MIN : SIDEBAR_MAX);
      }
    }} />;
}
