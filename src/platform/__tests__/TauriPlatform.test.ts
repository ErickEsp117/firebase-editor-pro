import { describe, expect, it, vi } from "vitest";

const invoke = vi.fn();
const open = vi.fn();
vi.mock("@tauri-apps/plugin-dialog", () => ({ open }));
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

  it("picks a JSON file via the native dialog and the bounded Rust reader", async () => {
    const { TauriPlatform } = await import("../TauriPlatform");
    const p = new TauriPlatform();
    open.mockResolvedValueOnce("/tmp/key.json");
    invoke.mockResolvedValueOnce({ name: "key.json", contents: "{}" });
    await expect(p.pickJsonFile()).resolves.toEqual({ name: "key.json", contents: "{}" });
    expect(open).toHaveBeenCalledWith(expect.objectContaining({ multiple: false, directory: false }));
    expect(invoke).toHaveBeenLastCalledWith("read_text_file", { path: "/tmp/key.json" });
  });

  it("returns null when the dialog is cancelled", async () => {
    const { TauriPlatform } = await import("../TauriPlatform");
    invoke.mockClear();
    open.mockResolvedValueOnce(null);
    await expect(new TauriPlatform().pickJsonFile()).resolves.toBeNull();
    expect(invoke).not.toHaveBeenCalled();
  });

  it("detects tauri mode via isTauri", async () => {
    const { detectMode } = await import("../index");
    expect(detectMode()).toBe("tauri");
  });
});
