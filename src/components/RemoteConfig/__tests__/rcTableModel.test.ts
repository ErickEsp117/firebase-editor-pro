import { describe, expect, it } from "vitest";
import {
  addCondition,
  addParameter,
  conditionUsage,
  deleteCondition,
  deleteParameter,
  listConditions,
  listParameters,
  moveCondition,
  parameterExists,
  replaceCondition,
  replaceParameter,
  setConditionField,
  setConditionalValue,
  setDefaultValue,
  setParamField,
  validValue,
  valueKind,
} from "../rcTableModel";

const template = () => ({
  conditions: [
    { name: "ios", expression: "device.os == 'ios'", tagColor: "BLUE" },
    { name: "beta", expression: "percent <= 10" },
  ],
  parameters: {
    welcome: { defaultValue: { value: "hi" }, conditionalValues: { ios: { value: "hey" } }, valueType: "STRING", futureField: 1 },
    flag: { defaultValue: { useInAppDefault: true }, valueType: "BOOLEAN" },
  },
  parameterGroups: { checkout: { description: "g", parameters: { price: { defaultValue: { value: "9.5" }, valueType: "NUMBER" } } } },
  version: { versionNumber: "7" },
  unknownTopLevel: { keep: true },
});

describe("Remote Config table model", () => {
  it("never replaces a malformed section and keeps names like __proto__ as plain keys", () => {
    const bad = { conditions: { ios: { expression: "x" } }, parameters: ["oops"] };
    expect(addCondition(bad, "new", "true")).toBe(bad);
    expect(addParameter(bad, "p", "STRING", "")).toBe(bad);
    const withProto = setConditionalValue(addParameter({}, "p", "STRING", ""), { key: "p", group: null }, "__proto__", { value: "x" });
    expect(JSON.stringify(withProto)).toContain('"conditionalValues":{"__proto__":{"value":"x"}}');
    expect(conditionUsage(template(), "toString")).toBe(0);
  });

  it("lists top-level parameters first, then grouped ones, and the conditions in order", () => {
    const t = template();
    expect(listParameters(t).map((r) => `${r.group ?? "-"}:${r.key}`)).toEqual(["-:welcome", "-:flag", "checkout:price"]);
    expect(listConditions(t).map((c) => c.name)).toEqual(["ios", "beta"]);
    expect(parameterExists(t, "price")).toBe(true);
    expect(conditionUsage(t, "ios")).toBe(1);
    expect(conditionUsage(t, "beta")).toBe(0);
  });

  it("edits a parameter without touching anything else and never mutates the input", () => {
    const t = template();
    const before = JSON.stringify(t);
    const next = setDefaultValue(t, { key: "welcome", group: null }, { value: "hello" });
    expect(JSON.stringify(t)).toBe(before);
    expect(next.parameters).toMatchObject({ welcome: { defaultValue: { value: "hello" }, futureField: 1 } });
    expect(next.version).toEqual({ versionNumber: "7" });
    expect(next.unknownTopLevel).toEqual({ keep: true });
    const typed = setParamField(next, { key: "price", group: "checkout" }, "valueType", "STRING");
    expect((typed.parameterGroups as never as Record<string, { parameters: Record<string, { valueType: string }> }>).checkout.parameters.price.valueType).toBe("STRING");
    const described = setParamField(typed, { key: "flag", group: null }, "description", "");
    expect((described.parameters as Record<string, object>).flag).not.toHaveProperty("description");
  });

  it("adds and removes conditional values, dropping an empty conditionalValues", () => {
    const ref = { key: "welcome", group: null };
    const added = setConditionalValue(template(), ref, "beta", { value: "b" });
    expect((added.parameters as Record<string, { conditionalValues: object }>).welcome.conditionalValues).toEqual({ ios: { value: "hey" }, beta: { value: "b" } });
    const cleared = setConditionalValue(setConditionalValue(added, ref, "ios", undefined), ref, "beta", undefined);
    expect((cleared.parameters as Record<string, object>).welcome).not.toHaveProperty("conditionalValues");
  });

  it("adds and deletes parameters (top level or in a group)", () => {
    const added = addParameter(template(), "fbep_new", "NUMBER", "3");
    expect((added.parameters as Record<string, object>).fbep_new).toEqual({ defaultValue: { value: "3" }, valueType: "NUMBER" });
    const removed = deleteParameter(added, { key: "price", group: "checkout" });
    expect(parameterExists(removed, "price")).toBe(false);
    expect(addParameter({}, "a", "STRING", "")).toEqual({ parameters: { a: { defaultValue: { value: "" }, valueType: "STRING" } } });
  });

  it("edits, reorders, adds and deletes conditions, keeping their order meaningful", () => {
    let t: Record<string, unknown> = template();
    t = setConditionField(t, "beta", "expression", "percent <= 20");
    t = setConditionField(t, "ios", "tagColor", undefined);
    expect(listConditions(t)).toEqual([{ name: "ios", expression: "device.os == 'ios'" }, { name: "beta", expression: "percent <= 20" }]);
    t = moveCondition(t, "beta", -1);
    expect(listConditions(t).map((c) => c.name)).toEqual(["beta", "ios"]);
    expect(listConditions(moveCondition(t, "beta", -1)).map((c) => c.name)).toEqual(["beta", "ios"]);
    t = addCondition(t, "android", "device.os == 'android'", "GREEN");
    expect(listConditions(t).at(-1)).toEqual({ name: "android", expression: "device.os == 'android'", tagColor: "GREEN" });
    t = deleteCondition(deleteCondition(deleteCondition(t, "android"), "beta"), "ios");
    expect(t).not.toHaveProperty("conditions");
  });

  it("classifies values and validates them by type", () => {
    expect(valueKind({ value: "x" })).toBe("value");
    expect(valueKind({ useInAppDefault: true })).toBe("inAppDefault");
    expect(valueKind({ personalizationValue: { personalizationId: "p" } })).toBe("special");
    expect(valueKind(undefined)).toBe("none");
    expect(valueKind("x")).toBe("special");
    expect(validValue("BOOLEAN", "true")).toBe(true);
    expect(validValue("BOOLEAN", "yes")).toBe(false);
    expect(validValue("NUMBER", "1.5e3")).toBe(true);
    expect(validValue("NUMBER", "abc")).toBe(false);
    expect(validValue("NUMBER", "")).toBe(false);
    expect(validValue("JSON", '{"a":1}')).toBe(true);
    expect(validValue("JSON", "{a")).toBe(false);
    expect(validValue("JSON", "")).toBe(true);
    expect(validValue("STRING", "")).toBe(true);
    expect(validValue(undefined, "anything")).toBe(true);
  });
});

describe("whole-parameter and condition edits (visual editor dialogs)", () => {
  it("replaces a parameter, renaming it in place and keeping unknown fields", () => {
    const t = template();
    const welcome = (t.parameters as Record<string, Record<string, unknown>>).welcome;
    const next = replaceParameter(t, { key: "welcome", group: null }, "greeting", { ...welcome, description: "new" });
    expect(Object.keys(next.parameters as object)).toEqual(["greeting", "flag"]);
    expect((next.parameters as Record<string, Record<string, unknown>>).greeting).toMatchObject({ description: "new", futureField: 1 });
    const grouped = replaceParameter(t, { key: "price", group: "checkout" }, "price", { defaultValue: { value: "1" } });
    expect((grouped.parameterGroups as never as Record<string, { parameters: object; description: string }>).checkout).toMatchObject({ description: "g", parameters: { price: { defaultValue: { value: "1" } } } });
    const created = replaceParameter({}, { key: "fresh", group: null }, "fresh", { valueType: "STRING" });
    expect(created).toEqual({ parameters: { fresh: { valueType: "STRING" } } });
  });

  it("renames a condition everywhere it is used, keeping the order of conditional values", () => {
    const t = template();
    const withBoth = setConditionalValue(t, { key: "welcome", group: null }, "beta", { value: "b" });
    const next = replaceCondition(withBoth, "ios", { name: "apple", expression: "device.os == 'ios'", tagColor: "GREEN" });
    expect(listConditions(next)[0]).toEqual({ name: "apple", expression: "device.os == 'ios'", tagColor: "GREEN" });
    const values = (next.parameters as Record<string, { conditionalValues: object }>).welcome.conditionalValues;
    expect(Object.keys(values)).toEqual(["apple", "beta"]);
    expect(conditionUsage(next, "ios")).toBe(0);
    expect(conditionUsage(next, "apple")).toBe(1);
    const recolored = replaceCondition(next, "apple", { name: "apple", expression: "true" });
    expect(listConditions(recolored)[0]).toEqual({ name: "apple", expression: "true" });
  });
});
