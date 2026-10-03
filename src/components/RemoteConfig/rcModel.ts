import type { RemoteConfigTemplate } from "../../core";

type Obj = Record<string, unknown>;

/** A problem with the template text that can be reported locally, before touching the network. */
export interface RcIssue {
  key: string;
  params?: Record<string, string>;
}

export type RcDraft =
  | { ok: true; template: RemoteConfigTemplate }
  | { ok: false; issues: RcIssue[] };

const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);

export function templateToText(template: RemoteConfigTemplate): string {
  return JSON.stringify(template, null, 2);
}

export function countEntries(template: RemoteConfigTemplate): { parameters: number; conditions: number } {
  let parameters = isObj(template.parameters) ? Object.keys(template.parameters).length : 0;
  if (isObj(template.parameterGroups)) {
    for (const g of Object.values(template.parameterGroups)) {
      if (isObj(g) && isObj(g.parameters)) parameters += Object.keys(g.parameters).length;
    }
  }
  return { parameters, conditions: Array.isArray(template.conditions) ? template.conditions.length : 0 };
}

function parameterMaps(template: Obj): { label: string; params: Obj }[] {
  const out: { label: string; params: Obj }[] = [];
  if (isObj(template.parameters)) out.push({ label: "", params: template.parameters });
  if (isObj(template.parameterGroups)) {
    for (const [group, g] of Object.entries(template.parameterGroups)) {
      if (isObj(g) && isObj(g.parameters)) out.push({ label: group, params: g.parameters });
    }
  }
  return out;
}

/** Structural checks the server would reject with a vague 400; reported here with the offending names. */
export function checkTemplate(template: Obj): RcIssue[] {
  const issues: RcIssue[] = [];
  const names = new Set<string>();
  if (template.conditions !== undefined) {
    if (!Array.isArray(template.conditions)) {
      issues.push({ key: "rc.issues.conditionsNotArray" });
    } else {
      for (const c of template.conditions) if (isObj(c) && typeof c.name === "string") names.add(c.name);
    }
  }
  if (template.parameters !== undefined && !isObj(template.parameters)) {
    issues.push({ key: "rc.issues.parametersNotObject" });
  }
  for (const { params } of parameterMaps(template)) {
    for (const [name, p] of Object.entries(params)) {
      if (!isObj(p)) {
        issues.push({ key: "rc.issues.parameterNotObject", params: { param: name } });
        continue;
      }
      if (p.conditionalValues === undefined) continue;
      if (!isObj(p.conditionalValues)) {
        issues.push({ key: "rc.issues.conditionalValuesNotObject", params: { param: name } });
        continue;
      }
      for (const condition of Object.keys(p.conditionalValues)) {
        if (!names.has(condition)) issues.push({ key: "rc.issues.unknownCondition", params: { param: name, condition } });
      }
    }
  }
  return issues;
}

export function parseTemplateText(text: string): RcDraft {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (e) {
    return { ok: false, issues: [{ key: "rc.issues.invalidJson", params: { message: e instanceof Error ? e.message : String(e) } }] };
  }
  if (!isObj(value)) return { ok: false, issues: [{ key: "rc.issues.notObject" }] };
  const issues = checkTemplate(value);
  return issues.length > 0 ? { ok: false, issues } : { ok: true, template: value };
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a)) return Array.isArray(b) && a.length === b.length && a.every((x, i) => deepEqual(x, b[i]));
  if (isObj(a) && isObj(b)) {
    const ka = Object.keys(a);
    return ka.length === Object.keys(b).length && ka.every((k) => k in b && deepEqual(a[k], b[k]));
  }
  return false;
}

export function sameTemplate(a: RemoteConfigTemplate, b: RemoteConfigTemplate): boolean {
  return deepEqual(a, b);
}

export interface Reapplied {
  template: RemoteConfigTemplate;
  /** Entries the user changed that were carried onto the fresh template. */
  applied: string[];
  /** Entries changed both by the user and externally to different values; the user's version was kept. */
  overridden: string[];
}

function namedList(v: unknown): Obj[] | null {
  if (v === undefined) return [];
  return Array.isArray(v) && v.every((c) => isObj(c) && typeof c.name === "string") ? (v as Obj[]) : null;
}

/**
 * Carries the user's edits (base → edited) onto the freshly downloaded template, entry by entry
 * (parameters, groups, conditions by name), so concurrent external changes to other entries survive.
 * `version` is read-only metadata and always comes from the fresh template.
 */
export function reapplyEdits(base: RemoteConfigTemplate, edited: RemoteConfigTemplate, latest: RemoteConfigTemplate): Reapplied {
  const result: Obj = structuredClone(latest);
  const applied: string[] = [];
  const overridden: string[] = [];
  const keys = new Set([...Object.keys(base), ...Object.keys(edited)]);
  keys.delete("version");

  const setOrDelete = (target: Obj, key: string, value: unknown) => {
    if (value === undefined) delete target[key];
    else target[key] = structuredClone(value);
  };

  for (const k of keys) {
    const b = base[k];
    const e = edited[k];
    if (deepEqual(b, e)) continue;

    const baseList = namedList(b);
    const editedList = namedList(e);
    const latestList = namedList(latest[k]);
    if (k === "conditions" && baseList && editedList && latestList) {
      const merged = structuredClone(latestList);
      const byName = (list: Obj[]) => new Map(list.map((c) => [c.name as string, c]));
      const bm = byName(baseList);
      const em = byName(editedList);
      const lm = byName(latestList);
      for (const name of new Set([...bm.keys(), ...em.keys()])) {
        if (deepEqual(bm.get(name), em.get(name))) continue;
        const label = `conditions.${name}`;
        applied.push(label);
        const theirs = lm.get(name);
        if (!deepEqual(theirs, bm.get(name)) && !deepEqual(theirs, em.get(name))) overridden.push(label);
        const idx = merged.findIndex((c) => c.name === name);
        const mine = em.get(name);
        if (!mine) {
          if (idx >= 0) merged.splice(idx, 1);
        } else if (idx >= 0) {
          merged[idx] = structuredClone(mine);
        } else {
          merged.push(structuredClone(mine));
        }
      }
      if (merged.length > 0 || e !== undefined) result[k] = merged;
      else delete result[k];
      continue;
    }

    if ((b === undefined || isObj(b)) && (e === undefined || isObj(e)) && (latest[k] === undefined || isObj(latest[k]))) {
      const bm = (b ?? {}) as Obj;
      const em = (e ?? {}) as Obj;
      const target: Obj = isObj(result[k]) ? (result[k] as Obj) : {};
      const lm = (latest[k] ?? {}) as Obj;
      for (const name of new Set([...Object.keys(bm), ...Object.keys(em)])) {
        if (deepEqual(bm[name], em[name])) continue;
        const label = `${k}.${name}`;
        applied.push(label);
        if (!deepEqual(lm[name], bm[name]) && !deepEqual(lm[name], em[name])) overridden.push(label);
        setOrDelete(target, name, em[name]);
      }
      if (e === undefined && Object.keys(target).length === 0) delete result[k];
      else result[k] = target;
      continue;
    }

    applied.push(k);
    if (!deepEqual(latest[k], b) && !deepEqual(latest[k], e)) overridden.push(k);
    setOrDelete(result, k, e);
  }
  return { template: result, applied, overridden };
}
