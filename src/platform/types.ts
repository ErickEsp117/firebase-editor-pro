export interface PickedFile {
  name: string;
  contents: string;
}

export interface SecureStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
}

export interface Platform {
  readonly mode: "tauri" | "browser";
  signJwtRsa(
    privateKeyPem: string,
    header: Record<string, unknown>,
    claims: Record<string, unknown>,
  ): Promise<string>;
  secureStore: SecureStore;
  pickJsonFile(): Promise<PickedFile | null>;
}
