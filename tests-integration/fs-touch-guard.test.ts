import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

const run = (path: string) => spawnSync(process.execPath, ["scripts/fs-touch.mjs", path], { encoding: "utf8" });

describe("scripts/fs-touch.mjs path guard", () => {
  it.each(["fbep_test_x/../users/abc", "fbep_test_x/./doc", "fbep_test_x/doc/../.."])("rejects %s before any network access", (path) => {
    const r = run(path);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("not allowed");
  });

  it("still rejects paths outside fbep_test_*", () => {
    const r = run("users/abc");
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("refusing");
  });
});
