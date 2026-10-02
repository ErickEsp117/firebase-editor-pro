// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { generateKeyPairSync, createVerify, webcrypto } from "node:crypto";
import { BrowserPlatform } from "../BrowserPlatform";
import { detectMode, getPlatform } from "../index";

const unb64 = (s: string) => Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64");

describe("BrowserPlatform", () => {
  beforeEach(() => localStorage.clear());

  it("detects browser mode outside Tauri", () => {
    expect(detectMode()).toBe("browser");
    expect(getPlatform().mode).toBe("browser");
  });

  it("stores values in localStorage with the fbep: prefix", async () => {
    const p = new BrowserPlatform();
    expect(await p.secureStore.get("cred")).toBeNull();
    await p.secureStore.set("cred", "v");
    expect(localStorage.getItem("fbep:cred")).toBe("v");
    expect(await p.secureStore.get("cred")).toBe("v");
    await p.secureStore.delete("cred");
    expect(localStorage.getItem("fbep:cred")).toBeNull();
  });

  it("signs a verifiable RS256 JWT with kid in header", async () => {
    if (!globalThis.crypto?.subtle) Object.defineProperty(globalThis, "crypto", { value: webcrypto });
    const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const pem = privateKey.export({ type: "pkcs8", format: "pem" }) as string;
    const token = await new BrowserPlatform().signJwtRsa(
      pem,
      { typ: "JWT", kid: "k1" },
      { iss: "svc", iat: 1 },
    );
    const [h, c, s] = token.split(".");
    expect(JSON.parse(unb64(h).toString())).toEqual({ typ: "JWT", kid: "k1", alg: "RS256" });
    expect(JSON.parse(unb64(c).toString())).toEqual({ iss: "svc", iat: 1 });
    const v = createVerify("RSA-SHA256").update(`${h}.${c}`);
    expect(v.verify(publicKey, unb64(s))).toBe(true);
  });

  it("rejects an invalid PEM with a controlled error", async () => {
    await expect(new BrowserPlatform().signJwtRsa("garbage", {}, {})).rejects.toThrow(
      /invalid private key PEM/,
    );
  });
});
