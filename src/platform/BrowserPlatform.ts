import { pickJsonFileViaInput } from "./pickFile";
import type { PickedFile, Platform } from "./types";

export const STORAGE_PREFIX = "fbep:";

const b64url = (bytes: ArrayBuffer | Uint8Array): string => {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let bin = "";
  for (const b of arr) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

const b64urlJson = (v: unknown) => b64url(new TextEncoder().encode(JSON.stringify(v)));

function pemToPkcs8(pem: string): ArrayBuffer {
  const body = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\s+/g, "");
  if (!body || pem.includes("RSA PRIVATE KEY")) {
    throw new Error("invalid private key PEM (expected PKCS#8)");
  }
  const bin = atob(body);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out.buffer;
}

export class BrowserPlatform implements Platform {
  readonly mode = "browser" as const;

  async signJwtRsa(
    privateKeyPem: string,
    header: Record<string, unknown>,
    claims: Record<string, unknown>,
  ): Promise<string> {
    let key: CryptoKey;
    try {
      key = await crypto.subtle.importKey(
        "pkcs8",
        pemToPkcs8(privateKeyPem),
        { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
        false,
        ["sign"],
      );
    } catch {
      throw new Error("invalid private key PEM");
    }
    const signingInput = `${b64urlJson({ ...header, alg: "RS256" })}.${b64urlJson(claims)}`;
    const sig = await crypto.subtle.sign(
      "RSASSA-PKCS1-v1_5",
      key,
      new TextEncoder().encode(signingInput),
    );
    return `${signingInput}.${b64url(sig)}`;
  }

  secureStore = {
    get: async (key: string) => localStorage.getItem(STORAGE_PREFIX + key),
    set: async (key: string, value: string) => {
      localStorage.setItem(STORAGE_PREFIX + key, value);
    },
    delete: async (key: string) => {
      localStorage.removeItem(STORAGE_PREFIX + key);
    },
  };

  pickJsonFile(): Promise<PickedFile | null> {
    return pickJsonFileViaInput();
  }
}
