import { invoke } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";
import type { PickedFile, Platform } from "./types";

export class TauriPlatform implements Platform {
  readonly mode = "tauri" as const;

  signJwtRsa(
    privateKeyPem: string,
    header: Record<string, unknown>,
    claims: Record<string, unknown>,
  ): Promise<string> {
    return invoke<string>("sign_jwt", {
      privateKeyPem,
      headerJson: header,
      claimsJson: claims,
    });
  }

  secureStore = {
    get: (key: string) => invoke<string | null>("secure_store_get", { key }),
    set: (key: string, value: string) =>
      invoke<void>("secure_store_set", { key, value }),
    delete: (key: string) => invoke<void>("secure_store_delete", { key }),
  };

  async pickJsonFile(): Promise<PickedFile | null> {
    const path = await open({
      multiple: false,
      directory: false,
      filters: [{ name: "JSON", extensions: ["json"] }],
    });
    if (typeof path !== "string") return null;
    return invoke<PickedFile>("read_text_file", { path });
  }

  async pickImportFile(): Promise<PickedFile | null> {
    const path = await open({
      multiple: false,
      directory: false,
      filters: [{ name: "JSON", extensions: ["json"] }],
    });
    if (typeof path !== "string") return null;
    return invoke<PickedFile>("read_import_file", { path });
  }

  async saveTextFile(suggestedName: string, contents: string): Promise<boolean> {
    const path = await save({
      defaultPath: suggestedName,
      filters: [{ name: "JSON", extensions: ["json"] }],
    });
    if (!path) return false;
    await invoke<void>("write_text_file", { path, contents });
    return true;
  }
}
