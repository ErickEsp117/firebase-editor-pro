import { useTranslation } from "react-i18next";
import { useSettings } from "../store/settings";

export function SidebarResize() {
  const { t } = useTranslation();
  const width = useSettings((s) => s.sidebarWidth);
  const setWidth = useSettings((s) => s.setSidebarWidth);
  return <div role="separator" aria-orientation="vertical" aria-label={t("layout.resizeSidebar")}
    aria-valuemin={220} aria-valuemax={420} aria-valuenow={width} tabIndex={0} data-testid="sidebar-resize"
    className="absolute right-0 top-0 z-10 h-full w-1 cursor-col-resize touch-none hover:bg-accent"
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
        event.preventDefault(); setWidth(event.key === "Home" ? 220 : 420);
      }
    }} />;
}
