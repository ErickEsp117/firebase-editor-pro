import { describe, expect, it } from "vitest";
import { countEntries, parseTemplateText, reapplyEdits } from "../rcModel";

describe("parseTemplateText", () => {
  it("accepts an empty template", () => {
    expect(parseTemplateText("{}")).toEqual({ ok: true, template: {} });
  });

  it("reports malformed JSON and non-objects", () => {
    const bad = parseTemplateText('{"parameters": ');
    expect(bad.ok).toBe(false);
    expect(!bad.ok && bad.issues[0].key).toBe("rc.issues.invalidJson");
    const arr = parseTemplateText("[]");
    expect(!arr.ok && arr.issues[0].key).toBe("rc.issues.notObject");
  });

  it("names the parameter and the missing condition", () => {
    const text = JSON.stringify({
      conditions: [{ name: "fbep_test_cond", expression: "device.os == 'ios'" }],
      parameters: { p: { conditionalValues: { fbep_test_cond: { value: "a" }, ghost: { value: "b" } } } },
      parameterGroups: { g: { parameters: { q: { conditionalValues: { other: { value: "c" } } } } } },
    });
    const res = parseTemplateText(text);
    expect(res.ok).toBe(false);
    expect(!res.ok && res.issues).toEqual([
      { key: "rc.issues.unknownCondition", params: { param: "p", condition: "ghost" } },
      { key: "rc.issues.unknownCondition", params: { param: "q", condition: "other" } },
    ]);
  });

  it("keeps unknown keys untouched", () => {
    const res = parseTemplateText('{"futureKey":{"a":1},"parameters":{}}');
    expect(res.ok && res.template.futureKey).toEqual({ a: 1 });
  });
});

describe("countEntries", () => {
  it("counts parameters, grouped ones and conditions", () => {
    expect(countEntries({})).toEqual({ parameters: 0, conditions: 0 });
    expect(
      countEntries({ parameters: { a: {} }, parameterGroups: { g: { parameters: { b: {}, c: {} } } }, conditions: [{ name: "x" }] }),
    ).toEqual({ parameters: 3, conditions: 1 });
  });
});

describe("reapplyEdits", () => {
  const base = { version: { versionNumber: "1" }, parameters: { a: { defaultValue: { value: "1" } } } };

  it("carries the user's added parameter onto an externally changed template", () => {
    const edited = { ...base, parameters: { ...base.parameters, mine: { defaultValue: { value: "m" } } } };
    const latest = { version: { versionNumber: "2" }, parameters: { ...base.parameters, theirs: { defaultValue: { value: "t" } } } };
    const res = reapplyEdits(base, edited, latest);
    expect(Object.keys(res.template.parameters as object).sort()).toEqual(["a", "mine", "theirs"]);
    expect(res.template.version).toEqual({ versionNumber: "2" });
    expect(res.applied).toEqual(["parameters.mine"]);
    expect(res.overridden).toEqual([]);
  });

  it("applies deletions and flags entries both sides changed differently", () => {
    const edited = { ...base, parameters: {} };
    const latest = { version: {}, parameters: { a: { defaultValue: { value: "external" } } } };
    const res = reapplyEdits(base, edited, latest);
    expect(res.template.parameters).toEqual({});
    expect(res.overridden).toEqual(["parameters.a"]);
  });

  it("merges conditions by name and preserves unknown top-level keys of the fresh copy", () => {
    const b = { conditions: [{ name: "c1", expression: "x" }] };
    const edited = { conditions: [{ name: "c1", expression: "y" }, { name: "mine", expression: "z" }] };
    const latest = { conditions: [{ name: "c1", expression: "x" }, { name: "theirs", expression: "w" }], extra: { k: 1 } };
    const res = reapplyEdits(b, edited, latest);
    expect(res.template.conditions).toEqual([
      { name: "c1", expression: "y" },
      { name: "theirs", expression: "w" },
      { name: "mine", expression: "z" },
    ]);
    expect(res.template.extra).toEqual({ k: 1 });
  });

  it("does not touch the fresh template when the user changed nothing", () => {
    const latest = { parameters: { x: {} } };
    const res = reapplyEdits(base, base, latest);
    expect(res.template).toEqual(latest);
    expect(res.applied).toEqual([]);
  });
});
