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
    expect(valueKind(undefined)).toBe("special");
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
