import { isTauri } from "@tauri-apps/api/core";
import { BrowserPlatform } from "./BrowserPlatform";
import { TauriPlatform } from "./TauriPlatform";
import type { Platform } from "./types";

export type { PickedFile, Platform, SecureStore } from "./types";
export { BrowserPlatform, TauriPlatform };

export function detectMode(): "tauri" | "browser" {
  return isTauri() ? "tauri" : "browser";
}

let current: Platform | undefined;

export function getPlatform(): Platform {
  current ??= detectMode() === "tauri" ? new TauriPlatform() : new BrowserPlatform();
  return current;
}

export function setPlatformForTests(p: Platform | undefined): void {
  current = p;
}
