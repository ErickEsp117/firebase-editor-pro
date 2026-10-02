import { invoke } from "@tauri-apps/api/core";
import { pickJsonFileViaInput } from "./pickFile";
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

  pickJsonFile(): Promise<PickedFile | null> {
    return pickJsonFileViaInput();
  }
}
