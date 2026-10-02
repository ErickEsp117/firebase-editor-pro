import { describe, expect, it, vi } from "vitest";

const invoke = vi.fn();
const open = vi.fn();
const save = vi.fn();
vi.mock("@tauri-apps/plugin-dialog", () => ({ open, save }));
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

  it("saves exports through the save dialog and the Rust writer", async () => {
    const { TauriPlatform } = await import("../TauriPlatform");
    const p = new TauriPlatform();
    invoke.mockClear();
    save.mockResolvedValueOnce("/tmp/out.json");
    invoke.mockResolvedValueOnce(undefined);
    await expect(p.saveTextFile("doc.json", "{}")).resolves.toBe(true);
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ defaultPath: "doc.json" }));
    expect(invoke).toHaveBeenCalledWith("write_text_file", { path: "/tmp/out.json", contents: "{}" });
    invoke.mockClear();
    save.mockResolvedValueOnce(null);
    await expect(p.saveTextFile("doc.json", "{}")).resolves.toBe(false);
    expect(invoke).not.toHaveBeenCalled();
  });

  it("reads import files with the large-file Rust reader", async () => {
    const { TauriPlatform } = await import("../TauriPlatform");
    open.mockResolvedValueOnce("/tmp/export.json");
    invoke.mockResolvedValueOnce({ name: "export.json", contents: "{}" });
    await new TauriPlatform().pickImportFile();
    expect(invoke).toHaveBeenLastCalledWith("read_import_file", { path: "/tmp/export.json" });
  });

  it("detects tauri mode via isTauri", async () => {
    const { detectMode } = await import("../index");
    expect(detectMode()).toBe("tauri");
  });
});

describe("TauriPlatform file errors and size limit", () => {
  it("turns native error codes into PlatformFileError for read and write", async () => {
    const { TauriPlatform } = await import("../TauriPlatform");
    const { PlatformFileError } = await import("../errors");
    const p = new TauriPlatform();
    for (const code of ["file_read_failed", "file_not_regular", "file_too_large", "file_not_utf8"]) {
      open.mockResolvedValueOnce("/tmp/x.json");
      invoke.mockRejectedValueOnce(code);
      await expect(p.pickImportFile()).rejects.toEqual(new PlatformFileError(code as never));
    }
    save.mockResolvedValueOnce("/tmp/out.json");
    invoke.mockRejectedValueOnce("file_write_failed");
    await expect(p.saveTextFile("a.json", "{}")).rejects.toMatchObject({ code: "file_write_failed" });
    open.mockResolvedValueOnce("/tmp/x.json");
    invoke.mockRejectedValueOnce("something else");
    await expect(p.pickJsonFile()).rejects.toBe("something else");
  });

  it("rejects exports over 32 MiB before opening the save dialog", async () => {
    const { TauriPlatform } = await import("../TauriPlatform");
    save.mockClear();
    invoke.mockClear();
    const big = "a".repeat(32 * 1024 * 1024 + 1);
    await expect(new TauriPlatform().saveTextFile("big.json", big)).rejects.toMatchObject({ code: "file_too_large" });
    expect(save).not.toHaveBeenCalled();
    expect(invoke).not.toHaveBeenCalled();
  });

  it("counts UTF-8 bytes, not characters, against the limit", async () => {
    const { assertWithinFileLimit } = await import("../errors");
    expect(() => assertWithinFileLimit("é".repeat(16 * 1024 * 1024 + 1))).toThrow();
    expect(() => assertWithinFileLimit("é".repeat(16 * 1024 * 1024))).not.toThrow();
  });
});
