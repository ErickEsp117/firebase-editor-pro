import type { RemoteConfigTemplate } from "../../core";

/**
 * Pure edits behind the Remote Config table view. Every function returns a new template and keeps
 * everything it does not touch (unknown keys, groups, version metadata), because publishing replaces
 * the whole template.
 */
type Obj = Record<string, unknown>;

export const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);

export const RC_VALUE_TYPES = ["STRING", "BOOLEAN", "NUMBER", "JSON"] as const;
export type RcValueType = (typeof RC_VALUE_TYPES)[number];

export const RC_TAG_COLORS = [
  "BLUE", "BROWN", "CYAN", "DEEP_ORANGE", "GREEN", "INDIGO", "LIME", "ORANGE", "PINK", "PURPLE", "TEAL",
] as const;

/** `{ value }` or `{ useInAppDefault: true }`; anything else (personalization, rollout) is "special". */
export type RcValueKind = "value" | "inAppDefault" | "special";

export function valueKind(v: unknown): RcValueKind {
  if (!isObj(v)) return "special";
  const keys = Object.keys(v);
  if (keys.length === 1 && keys[0] === "useInAppDefault" && v.useInAppDefault === true) return "inAppDefault";
  if (keys.length === 1 && keys[0] === "value" && typeof v.value === "string") return "value";
  if (keys.length === 0) return "value";
  return "special";
}

export const valueText = (v: unknown): string => (isObj(v) && typeof v.value === "string" ? v.value : "");

/** Whether `text` is a value Remote Config accepts for a parameter of `type`. */
export function validValue(type: string | undefined, text: string): boolean {
  if (type === "BOOLEAN") return text === "true" || text === "false";
  if (type === "NUMBER") return text.trim() !== "" && Number.isFinite(Number(text));
  if (type === "JSON") {
    // Remote Config keeps an empty JSON value as is (the app then gets an empty string).
    if (text.trim() === "") return true;
    try {
      JSON.parse(text);
      return true;
    } catch {
      return false;
    }
  }
  return true;
}

/** A sensible starting value when a parameter is created with `type`. */
export function initialValue(type: RcValueType): string {
  return type === "BOOLEAN" ? "false" : type === "NUMBER" ? "0" : type === "JSON" ? "{}" : "";
}

export interface ParamRef {
  key: string;
  /** Parameter group name, or null for top-level `parameters`. */
  group: string | null;
}

export interface ParamRow extends ParamRef {
  param: Obj;
}

/** Top-level parameters first (in template order), then each group's parameters. */
export function listParameters(template: RemoteConfigTemplate): ParamRow[] {
  const rows: ParamRow[] = [];
  if (isObj(template.parameters)) {
    for (const [key, param] of Object.entries(template.parameters)) if (isObj(param)) rows.push({ key, group: null, param });
  }
  if (isObj(template.parameterGroups)) {
    for (const [group, g] of Object.entries(template.parameterGroups)) {
      if (!isObj(g) || !isObj(g.parameters)) continue;
      for (const [key, param] of Object.entries(g.parameters)) if (isObj(param)) rows.push({ key, group, param });
    }
  }
  return rows;
}

export function listConditions(template: RemoteConfigTemplate): Obj[] {
  return Array.isArray(template.conditions) ? template.conditions.filter((c): c is Obj => isObj(c) && typeof c.name === "string") : [];
}

/** Parameter keys are unique across top-level parameters and all groups. */
export function parameterExists(template: RemoteConfigTemplate, key: string): boolean {
  return listParameters(template).some((row) => row.key === key);
}

export function conditionUsage(template: RemoteConfigTemplate, name: string): number {
  return listParameters(template).filter(({ param }) => isObj(param.conditionalValues) && name in param.conditionalValues).length;
}

function paramsOf(template: Obj, group: string | null): Obj | null {
  if (group === null) return isObj(template.parameters) ? template.parameters : null;
  const g = isObj(template.parameterGroups) ? template.parameterGroups[group] : undefined;
  return isObj(g) && isObj(g.parameters) ? g.parameters : null;
}

function editParam(template: RemoteConfigTemplate, ref: ParamRef, edit: (param: Obj) => void): RemoteConfigTemplate {
  const next = structuredClone(template);
  const params = paramsOf(next, ref.group);
  const param = params?.[ref.key];
  if (isObj(param)) edit(param);
  return next;
}

/** Sets (or with `undefined` removes) a plain field such as `valueType` or `description`. */
export function setParamField(template: RemoteConfigTemplate, ref: ParamRef, field: "valueType" | "description", value: string | undefined): RemoteConfigTemplate {
  return editParam(template, ref, (param) => {
    if (value === undefined || value === "") delete param[field];
    else param[field] = value;
  });
}

export function setDefaultValue(template: RemoteConfigTemplate, ref: ParamRef, value: Obj): RemoteConfigTemplate {
  return editParam(template, ref, (param) => {
    param.defaultValue = value;
  });
}

/** Sets the value for one condition, or removes it with `undefined` (dropping an empty `conditionalValues`). */
export function setConditionalValue(template: RemoteConfigTemplate, ref: ParamRef, condition: string, value: Obj | undefined): RemoteConfigTemplate {
  return editParam(template, ref, (param) => {
    const values = isObj(param.conditionalValues) ? param.conditionalValues : {};
    if (value === undefined) delete values[condition];
    else values[condition] = value;
    if (Object.keys(values).length === 0) delete param.conditionalValues;
    else param.conditionalValues = values;
  });
}

export function deleteParameter(template: RemoteConfigTemplate, ref: ParamRef): RemoteConfigTemplate {
  const next = structuredClone(template);
  const params = paramsOf(next, ref.group);
  if (params) delete params[ref.key];
  return next;
}

/** Adds a top-level parameter with a default value of the given type. */
export function addParameter(template: RemoteConfigTemplate, key: string, valueType: RcValueType, value: string): RemoteConfigTemplate {
  const next = structuredClone(template);
  const params = isObj(next.parameters) ? next.parameters : {};
  params[key] = { defaultValue: { value }, valueType };
  next.parameters = params;
  return next;
}

function editConditions(template: RemoteConfigTemplate, edit: (list: Obj[]) => void): RemoteConfigTemplate {
  const next = structuredClone(template);
  const list = Array.isArray(next.conditions) ? (next.conditions as Obj[]) : [];
  edit(list);
  if (list.length > 0) next.conditions = list;
  else delete next.conditions;
  return next;
}

export function setConditionField(template: RemoteConfigTemplate, name: string, field: "expression" | "tagColor", value: string | undefined): RemoteConfigTemplate {
  return editConditions(template, (list) => {
    const c = list.find((x) => isObj(x) && x.name === name);
    if (!c) return;
    if (value === undefined || value === "") delete c[field];
    else c[field] = value;
  });
}

/** Conditions are evaluated first-match-wins, so their order is meaningful; `delta` is -1 (earlier) or +1. */
export function moveCondition(template: RemoteConfigTemplate, name: string, delta: -1 | 1): RemoteConfigTemplate {
  return editConditions(template, (list) => {
    const i = list.findIndex((x) => isObj(x) && x.name === name);
    const j = i + delta;
    if (i < 0 || j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
  });
}

/** Removes a condition; callers only offer it when no parameter uses the condition. */
export function deleteCondition(template: RemoteConfigTemplate, name: string): RemoteConfigTemplate {
  return editConditions(template, (list) => {
    const i = list.findIndex((x) => isObj(x) && x.name === name);
    if (i >= 0) list.splice(i, 1);
  });
}

export function addCondition(template: RemoteConfigTemplate, name: string, expression: string, tagColor?: string): RemoteConfigTemplate {
  return editConditions(template, (list) => {
    list.push({ name, expression, ...(tagColor ? { tagColor } : {}) });
  });
}
