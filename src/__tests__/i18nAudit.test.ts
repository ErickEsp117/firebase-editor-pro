import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import en from "../locales/en.json";
import es from "../locales/es.json";

type Tree = { [k: string]: string | Tree };

const flatten = (o: Tree, prefix = ""): Record<string, string> =>
  Object.entries(o).reduce<Record<string, string>>((acc, [k, v]) => {
    if (typeof v === "string") acc[prefix + k] = v;
    else Object.assign(acc, flatten(v, `${prefix}${k}.`));
    return acc;
  }, {});

const EN = flatten(en as Tree);
const ES = flatten(es as Tree);
const placeholders = (s: string) => [...s.matchAll(/{{\s*(\w+)\s*}}/g)].map((m) => m[1]).sort();

function sources(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name !== "__tests__" && name !== "locales") sources(p, out);
    } else if (/\.tsx?$/.test(name)) out.push(p);
  }
  return out;
}

const SRC = join(__dirname, "..");
const code = sources(SRC).map((f) => readFileSync(f, "utf8")).join("\n");

/** Keys of a plural family ("x_one"/"x_other") are looked up as "x". */
const hasKey = (table: Record<string, string>, key: string) =>
  key in table || `${key}_one` in table || `${key}_other` in table;

describe("i18n audit", () => {
  it("has the same keys in es.json and en.json", () => {
    expect(Object.keys(ES).sort()).toEqual(Object.keys(EN).sort());
  });

  it("has no empty translations and identical placeholders in both languages", () => {
    for (const [key, value] of Object.entries(EN)) {
      expect(value.trim(), key).not.toBe("");
      expect(ES[key].trim(), key).not.toBe("");
      expect(placeholders(ES[key]), `${key} placeholders`).toEqual(placeholders(value));
    }
  });

  it("defines every literal t() / i18nKey used in the source in both languages", () => {
    const used = new Set<string>();
    for (const m of code.matchAll(/\bt\(\s*(["'`])([\w.]+)\1/g)) used.add(m[2]);
    for (const m of code.matchAll(/i18nKey\s*[:=]\s*["']([\w.]+)["']/g)) used.add(m[1]);
    expect(used.size).toBeGreaterThan(100);
    const missing = [...used].filter((k) => !hasKey(EN, k) || !hasKey(ES, k));
    expect(missing).toEqual([]);
  });

  it("defines every dynamic key family the UI builds at runtime", () => {
    const families: Record<string, string[]> = {
      "errors.api": ["offline", "unauthenticated", "forbidden", "notFound", "rateLimited", "server"],
      "errors": ["keyInvalid", "keyUnreadable", "rejected", "offline", "forbidden", "unknown", "fileRead"],
      "errors.keyReason": ["notJson", "notObject", "badType", "badField", "badPem"],
      "editor.types": ["string", "integer", "double", "boolean", "null", "timestamp", "reference", "geopoint", "bytes", "array", "map"],
      "rc.origins": ["CONSOLE", "REST_API", "ADMIN_SDK_NODE", "ADMIN_SDK_JAVA", "ADMIN_SDK_PYTHON", "ADMIN_SDK_GO", "ADMIN_SDK_DOTNET", "REMOTE_CONFIG_UPDATE_ORIGIN_UNSPECIFIED"],
    };
    for (const [prefix, names] of Object.entries(families)) {
      for (const name of names) {
        expect(`${prefix}.${name}` in EN, `en ${prefix}.${name}`).toBe(true);
        expect(`${prefix}.${name}` in ES, `es ${prefix}.${name}`).toBe(true);
      }
    }
    // Codec, import and file error codes are emitted as i18n keys by the core; each must exist.
    for (const m of code.matchAll(/["'`]((?:codec|io)\.[\w.]+)["'`]/g)) {
      const key = m[1];
      if (key.endsWith(".")) continue;
      expect(hasKey(EN, key) && hasKey(ES, key), key).toBe(true);
    }
  });

  it("keeps hardcoded user-visible strings out of JSX attributes", () => {
    const offenders: string[] = [];
    for (const file of sources(SRC).filter((f) => f.endsWith(".tsx"))) {
      const text = readFileSync(file, "utf8");
      for (const m of text.matchAll(/\b(aria-label|placeholder|title|alt)="([^"{]*[A-Za-z]{2,}[^"{]*)"/g)) offenders.push(`${file}: ${m[0]}`);
    }
    expect(offenders).toEqual([]);
  });
});
