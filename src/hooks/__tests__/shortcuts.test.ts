// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { shortcutAction, shortcutLabel, withShortcut } from "../shortcuts";

afterEach(() => vi.restoreAllMocks());

it("uses Command on macOS and Control elsewhere", () => {
  expect(shortcutAction({ key: "s", metaKey: true }, true)).toBe("save");
  expect(shortcutAction({ key: "s", ctrlKey: true }, true)).toBeNull();
  expect(shortcutAction({ key: "s", ctrlKey: true }, false)).toBe("save");
  expect(shortcutAction({ key: "r", ctrlKey: true }, false)).toBe("reload");
  expect(shortcutAction({ key: "F", metaKey: true, shiftKey: true }, true)).toBe("format");
  expect(shortcutAction({ key: "F", ctrlKey: true, shiftKey: true }, false)).toBe("format");
  expect(shortcutAction({ key: "1", metaKey: true }, true)).toBe("firestore");
  expect(shortcutAction({ key: "2", metaKey: true }, true)).toBe("remoteConfig");
  expect(shortcutAction({ key: "1", ctrlKey: true }, false)).toBe("firestore");
  expect(shortcutAction({ key: "s", metaKey: true, altKey: true }, true)).toBeNull();
  // AltGr on Windows arrives as Ctrl+Alt and must type, not trigger commands.
  expect(shortcutAction({ key: "s", ctrlKey: true, altKey: true }, false)).toBeNull();
  expect(shortcutAction({ key: "s", metaKey: true, shiftKey: true }, true)).toBeNull();
});

it("selects areas by the physical digit key on layouts without unshifted digits (AZERTY)", () => {
  expect(shortcutAction({ key: "&", code: "Digit1", metaKey: true }, true)).toBe("firestore");
  expect(shortcutAction({ key: "é", code: "Digit2", ctrlKey: true }, false)).toBe("remoteConfig");
  expect(shortcutAction({ key: "&", code: "Digit3", metaKey: true }, true)).toBeNull();
});

it("labels shortcuts with the platform modifier (Windows: Ctrl+…)", () => {
  expect(shortcutLabel("save", true)).toBe("⌘S");
  expect(shortcutLabel("reload", true)).toBe("⌘R");
  expect(shortcutLabel("format", true)).toBe("⌘⇧F");
  expect(shortcutLabel("firestore", true)).toBe("⌘1");
  expect(shortcutLabel("remoteConfig", true)).toBe("⌘2");
  expect(shortcutLabel("save", false)).toBe("Ctrl+S");
  expect(shortcutLabel("reload", false)).toBe("Ctrl+R");
  expect(shortcutLabel("format", false)).toBe("Ctrl+Shift+F");
  expect(shortcutLabel("firestore", false)).toBe("Ctrl+1");
  expect(shortcutLabel("remoteConfig", false)).toBe("Ctrl+2");
});

it("tooltips follow the detected platform", () => {
  vi.spyOn(navigator, "platform", "get").mockReturnValue("Win32");
  expect(withShortcut("Guardar", "save")).toBe("Guardar (Ctrl+S)");
  vi.spyOn(navigator, "platform", "get").mockReturnValue("MacIntel");
  expect(withShortcut("Save", "format")).toBe("Save (⌘⇧F)");
});
