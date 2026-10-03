import { expect, it } from "vitest";
import { shortcutAction } from "../shortcuts";
it("uses Command on macOS and Control elsewhere", () => {
  expect(shortcutAction({ key: "s", metaKey: true }, true)).toBe("save");
  expect(shortcutAction({ key: "s", ctrlKey: true }, true)).toBeNull();
  expect(shortcutAction({ key: "s", ctrlKey: true }, false)).toBe("save");
  expect(shortcutAction({ key: "r", ctrlKey: true }, false)).toBe("reload");
  expect(shortcutAction({ key: "F", metaKey: true, shiftKey: true }, true)).toBe("format");
  expect(shortcutAction({ key: "1", metaKey: true }, true)).toBe("firestore");
  expect(shortcutAction({ key: "2", metaKey: true }, true)).toBe("remoteConfig");
  expect(shortcutAction({ key: "s", metaKey: true, altKey: true }, true)).toBeNull();
});
