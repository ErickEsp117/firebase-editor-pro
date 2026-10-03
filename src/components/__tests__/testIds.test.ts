import { readFileSync, readdirSync } from "node:fs";
import { resolve, join } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "../../..");
const walk = (directory: string): string[] => readdirSync(directory, { withFileTypes: true }).flatMap((entry) =>
  entry.isDirectory() ? (entry.name === "__tests__" ? [] : walk(join(directory, entry.name))) : entry.name.endsWith(".tsx") ? [readFileSync(join(directory, entry.name), "utf8")] : [],
);

/** Static IDs (string literals, both branches of a conditional) and dynamic patterns (`*` per interpolation). */
function extract(text: string): { statics: Set<string>; patterns: Set<string> } {
  const statics = new Set<string>();
  const patterns = new Set<string>();
  for (const match of text.matchAll(/(?:data-testid|testId|retryTestId)="([^"]+)"/g)) statics.add(match[1]);
  for (const match of text.matchAll(/(?:data-testid|testId|retryTestId)=\{/g)) {
    let depth = 1;
    let end = match.index + match[0].length;
    while (end < text.length && depth > 0) {
      if (text[end] === "{") depth++;
      else if (text[end] === "}") depth--;
      end++;
    }
    const expression = text.slice(match.index + match[0].length, end - 1);
    for (const literal of expression.matchAll(/"([^"]+)"/g)) statics.add(literal[1]);
    for (const template of expression.matchAll(/`([^`]*)`/g)) patterns.add(template[1].replace(/\$\{[^}]*\}/g, "*"));
  }
  return { statics, patterns };
}

function baseline(): { statics: string[]; patterns: string[] } {
  // Windows checkouts may convert the baseline to CRLF line endings.
  const text = readFileSync(join(root, "docs/testid-baseline.md"), "utf8").replace(/\r\n/g, "\n");
  const blocks = [...text.matchAll(/```text\n([\s\S]*?)```/g)].map((m) => m[1].split("\n").filter(Boolean));
  return { statics: blocks[0], patterns: blocks[1] };
}

describe("UI test IDs captured before the redesign", () => {
  const current = extract(walk(join(root, "src")).join("\n"));
  const base = baseline();

  it("reads a non-empty baseline", () => {
    expect(base.statics.length).toBeGreaterThan(100);
    expect(base.patterns).toContain("row-*");
  });

  it("keeps every static ID (directly, or composed by a component from a testId prop)", () => {
    const composed = (id: string) =>
      [...current.patterns].some((pattern) => {
        if (!pattern.startsWith("*")) return false;
        const suffix = pattern.slice(1);
        return id.endsWith(suffix) && current.statics.has(id.slice(0, -suffix.length));
      });
    expect(base.statics.filter((id) => !current.statics.has(id) && !composed(id))).toEqual([]);
  });

  it("keeps every dynamic ID pattern", () => {
    expect(base.patterns.filter((pattern) => !current.patterns.has(pattern))).toEqual([]);
  });
});
