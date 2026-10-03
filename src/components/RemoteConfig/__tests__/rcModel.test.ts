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

  describe("condition order (first-match-wins priority)", () => {
    const c = (name: string, expression = name) => ({ name, expression });
    const names = (t: { conditions?: unknown }) => (t.conditions as { name: string }[]).map((x) => x.name);

    it("keeps an order-only edit of the conditions instead of dropping it", () => {
      const b = { conditions: [c("a"), c("b"), c("c")] };
      const edited = { conditions: [c("c"), c("a"), c("b")] };
      const latest = { version: { versionNumber: "2" }, conditions: [c("a"), c("b"), c("c")] };
      const res = reapplyEdits(b, edited, latest);
      expect(names(res.template)).toEqual(["c", "a", "b"]);
      expect(res.applied).toEqual(["conditions[order]"]);
      expect(res.overridden).toEqual([]);
    });

    it("keeps order and content edits together, with server-only conditions after the user's", () => {
      const b = { conditions: [c("a"), c("b")] };
      const edited = { conditions: [c("b"), c("a", "changed")] };
      const latest = { conditions: [c("a"), c("b"), c("theirs")] };
      const res = reapplyEdits(b, edited, latest);
      expect(res.template.conditions).toEqual([c("b"), c("a", "changed"), c("theirs")]);
      expect(res.applied).toEqual(["conditions.a", "conditions[order]"]);
      expect(res.overridden).toEqual([]);
    });

    it("warns when the server also reordered the conditions to a different sequence", () => {
      const b = { conditions: [c("a"), c("b"), c("c")] };
      const edited = { conditions: [c("c"), c("a"), c("b")] };
      const latest = { conditions: [c("b"), c("a"), c("c")] };
      const res = reapplyEdits(b, edited, latest);
      expect(names(res.template)).toEqual(["c", "a", "b"]);
      expect(res.overridden).toEqual(["conditions[order]"]);
    });

    it("does not warn when the server reordered to the very same sequence as the user", () => {
      const b = { conditions: [c("a"), c("b")] };
      const edited = { conditions: [c("b"), c("a")] };
      const res = reapplyEdits(b, edited, { conditions: [c("b"), c("a")] });
      expect(names(res.template)).toEqual(["b", "a"]);
      expect(res.overridden).toEqual([]);
    });

    it("keeps the fresh server order, without noise, when only the server reordered", () => {
      const b = { conditions: [c("a"), c("b"), c("c")] };
      const edited = { conditions: [c("a", "mine"), c("b"), c("c")] };
      const latest = { conditions: [c("c"), c("b"), c("a")] };
      const res = reapplyEdits(b, edited, latest);
      expect(res.template.conditions).toEqual([c("c"), c("b"), c("a", "mine")]);
      expect(res.applied).toEqual(["conditions.a"]);
      expect(res.overridden).toEqual([]);
    });

    it("keeps the user's order when they also added a condition (table: move up + add)", () => {
      const b = { conditions: [c("ios"), c("beta")] };
      const edited = { conditions: [c("beta"), c("ios"), c("android")] };
      const latest = { conditions: [c("ios"), c("beta")], parameters: { theirs: {} } };
      const res = reapplyEdits(b, edited, latest);
      expect(names(res.template)).toEqual(["beta", "ios", "android"]);
      expect(res.applied).toContain("conditions[order]");
    });

    it("keeps the user's order when they also deleted a condition", () => {
      const b = { conditions: [c("a"), c("b"), c("c")] };
      const res = reapplyEdits(b, { conditions: [c("c"), c("a")] }, { conditions: [c("a"), c("b"), c("c")] });
      expect(names(res.template)).toEqual(["c", "a"]);
    });

    it("keeps a new condition the user placed before existing ones; server-only ones go last", () => {
      const b = { conditions: [c("a"), c("b")] };
      const res = reapplyEdits(b, { conditions: [c("new"), c("a"), c("b")] }, { conditions: [c("a"), c("b"), c("theirs")] });
      expect(names(res.template)).toEqual(["new", "a", "b", "theirs"]);
    });

    it("leaves parameters and groups alone when only conditions were reordered", () => {
      const b = { conditions: [c("a"), c("b")], parameters: { p: { defaultValue: { value: "1" } } } };
      const edited = { ...b, conditions: [c("b"), c("a")] };
      const latest = { conditions: [c("a"), c("b")], parameters: { p: { defaultValue: { value: "1" } }, q: {} } };
      const res = reapplyEdits(b, edited, latest);
      expect(res.template.parameters).toEqual(latest.parameters);
      expect(names(res.template)).toEqual(["b", "a"]);
    });
  });

  it("does not touch the fresh template when the user changed nothing", () => {
    const latest = { parameters: { x: {} } };
    const res = reapplyEdits(base, base, latest);
    expect(res.template).toEqual(latest);
    expect(res.applied).toEqual([]);
  });
});
