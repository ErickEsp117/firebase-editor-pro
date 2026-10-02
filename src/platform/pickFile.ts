import type { PickedFile } from "./types";

/** Browser-mode picker: a transient `<input type="file">` read through the DOM. */
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

/** Browser-mode save: a blob URL clicked through a transient anchor. */
export function downloadTextViaBlob(name: string, contents: string): boolean {
  const url = URL.createObjectURL(new Blob([contents], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return true;
}
