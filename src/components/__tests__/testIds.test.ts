import { readFileSync, readdirSync } from "node:fs";
import { resolve, join } from "node:path";
import { expect, it } from "vitest";

it("preserves every static UI test ID captured before the redesign", () => {
  const root = resolve(__dirname, "../../..");
  const walk = (directory: string): string[] => readdirSync(directory, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? (entry.name === "__tests__" ? [] : walk(join(directory, entry.name))) : entry.name.endsWith(".tsx") ? [readFileSync(join(directory, entry.name), "utf8")] : [],
  );
  const ids = (text: string) => [...text.matchAll(/(?:data-testid|testId)="([^"]+)"/g)].map((match) => match[1]);
  const current = new Set(ids(walk(join(root, "src")).join("\n")));
  const missing = ids(readFileSync(join(root, "docs/testid-baseline.md"), "utf8")).filter((id) => !current.has(id));
  expect(missing).toEqual([]);
});
