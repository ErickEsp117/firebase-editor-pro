import { describe, expect, it, vi } from "vitest";

const invoke = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({ invoke, isTauri: () => true }));

describe("TauriPlatform", () => {
  it("maps calls to the Rust command argument names", async () => {
    const { TauriPlatform } = await import("../TauriPlatform");
    const p = new TauriPlatform();
    invoke.mockResolvedValue("tok");
    await p.signJwtRsa("pem", { kid: "k" }, { iss: "i" });
    expect(invoke).toHaveBeenCalledWith("sign_jwt", {
      privateKeyPem: "pem",
      headerJson: { kid: "k" },
      claimsJson: { iss: "i" },
    });
    await p.secureStore.set("a", "b");
    expect(invoke).toHaveBeenCalledWith("secure_store_set", { key: "a", value: "b" });
    await p.secureStore.get("a");
    expect(invoke).toHaveBeenCalledWith("secure_store_get", { key: "a" });
    await p.secureStore.delete("a");
    expect(invoke).toHaveBeenCalledWith("secure_store_delete", { key: "a" });
  });

  it("detects tauri mode via isTauri", async () => {
    const { detectMode } = await import("../index");
    expect(detectMode()).toBe("tauri");
  });
});
