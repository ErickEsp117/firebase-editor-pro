import type { PickedFile } from "./types";

/**
 * Opens a native file chooser through a transient `<input type="file">`.
 * Reading through the DOM avoids needing a filesystem plugin scope in Tauri.
 */
export function pickJsonFileViaInput(): Promise<PickedFile | null> {
  return new Promise((resolve, reject) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json,application/json";
    input.style.display = "none";
    let settled = false;
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      input.remove();
      fn();
    };
    input.addEventListener("change", () => {
      const file = input.files?.[0];
      if (!file) return finish(() => resolve(null));
      file
        .text()
        .then((contents) => finish(() => resolve({ name: file.name, contents })))
        .catch((e) => finish(() => reject(e)));
    });
    input.addEventListener("cancel", () => finish(() => resolve(null)));
    document.body.appendChild(input);
    input.click();
  });
}
