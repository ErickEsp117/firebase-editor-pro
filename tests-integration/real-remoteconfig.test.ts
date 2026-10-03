import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ApiClient } from "../src/core/ApiClient";
import {
  RemoteConfigApi,
  isRemoteConfigConflict,
  type RemoteConfigTemplate,
} from "../src/core/RemoteConfigApi";
import { ServiceAccountAuth } from "../src/core/ServiceAccountAuth";
import { BrowserPlatform } from "../src/platform/BrowserPlatform";

const keyPath = resolve(__dirname, "../dev-secrets/test-key.json");
const PREFIX = "fbep_test_";
const PARAM = `${PREFIX}param`;
const COND = `${PREFIX}cond`;

type Params = Record<string, { defaultValue?: { value?: string }; conditionalValues?: Record<string, { value?: string }> }>;
type Cond = { name: string; expression: string; tagColor?: string };

const isTestName = (n: string) => n.startsWith(PREFIX);

/** Returns a copy without any fbep_test_* parameter or condition; everything else is left as is. */
function withoutTestEntries(template: RemoteConfigTemplate): RemoteConfigTemplate {
  const next: RemoteConfigTemplate = { ...template };
  if (next.parameters) {
    next.parameters = Object.fromEntries(Object.entries(next.parameters as Params).filter(([k]) => !isTestName(k)));
  }
  if (next.conditions) next.conditions = (next.conditions as Cond[]).filter((c) => !isTestName(c.name));
  return next;
}

const testEntryCount = (t: RemoteConfigTemplate) =>
  Object.keys((t.parameters ?? {}) as Params).filter(isTestName).length +
  ((t.conditions ?? []) as Cond[]).filter((c) => isTestName(c.name)).length;

// Every publish/force/rollback creates a version in the real project, and Firebase keeps only the last 300.
// Write cases therefore run only with FBEP_RC_WRITE_TESTS=1 (services.yaml: commands.test_rc_writes).
const writesEnabled = process.env.FBEP_RC_WRITE_TESTS === "1";

describe.skipIf(!existsSync(keyPath))("real Remote Config (project of dev-secrets/test-key.json)", () => {
  let api: RemoteConfigApi;

  beforeAll(() => {
    const auth = ServiceAccountAuth.fromKeyJson(readFileSync(keyPath, "utf8"), { platform: new BrowserPlatform() });
    api = new RemoteConfigApi(new ApiClient(auth, { platform: { mode: "browser" } }), auth.projectId);
  });

  const testTemplate = (base: RemoteConfigTemplate, value: string): RemoteConfigTemplate => {
    const clean = withoutTestEntries(base);
    return {
      ...clean,
      parameters: {
        ...((clean.parameters ?? {}) as Params),
        [PARAM]: {
          defaultValue: { value },
          conditionalValues: { [COND]: { value: `${value}-ios` } },
          valueType: "STRING",
          description: "integration test",
        },
      },
      conditions: [...((clean.conditions ?? []) as Cond[]), { name: COND, expression: "device.os == 'ios'", tagColor: "BLUE" }],
    };
  };

  it("gets the template with an ETag from the response header", async () => {
    const { template, etag } = await api.getTemplate();
    expect(etag).toMatch(/^etag-\d+-\d+$/);
    expect(typeof template).toBe("object");
  });

  it("validate_only succeeds without creating a version or changing the ETag", async () => {
    const before = await api.getTemplate();
    const versionsBefore = await api.listVersions({ pageSize: 50 });

    await expect(api.validate(testTemplate(before.template, "validated"), before.etag)).resolves.toBeUndefined();

    const after = await api.getTemplate();
    expect(after.etag).toBe(before.etag);
    expect(testEntryCount(after.template)).toBe(0);
    const versionsAfter = await api.listVersions({ pageSize: 50 });
    expect(versionsAfter.versions.map((v) => v.versionNumber)).toEqual(versionsBefore.versions.map((v) => v.versionNumber));
  });

  it("downloads defaults as JSON", async () => {
    const { template } = await api.getTemplate();
    const text = await api.downloadDefaults("JSON");
    // Google answers with an empty body when the template has no parameters.
    if (Object.keys((template.parameters ?? {}) as Params).length === 0) {
      expect(text.trim()).toBe("");
    } else {
      expect(() => JSON.parse(text)).not.toThrow();
    }
  });

  // Writes only add/remove fbep_test_* entries; the final cleanup republishes the template without them.
  describe.skipIf(!writesEnabled)("write cases (opt-in: set FBEP_RC_WRITE_TESTS=1)", () => {
    afterAll(async () => {
      const { template, etag } = await api.getTemplate();
      if (testEntryCount(template) > 0) {
        await api.publish(withoutTestEntries(template), etag, "test cleanup", { force: true });
      }
      expect(testEntryCount((await api.getTemplate()).template)).toBe(0);
    });

    it("publishes, lists the version with its description, detects stale ETags, forces, and rolls back", async () => {
      const start = await api.getTemplate();

      // publish v1
      const one = await api.publish(testTemplate(start.template, "one"), start.etag, "fbep test one");
      expect(one.etag).not.toBe(start.etag);
      const readOne = await api.getTemplate();
      expect(readOne.etag).toBe(one.etag);
      const paramsOne = readOne.template.parameters as Params;
      expect(paramsOne[PARAM].defaultValue?.value).toBe("one");
      expect(paramsOne[PARAM].conditionalValues?.[COND]?.value).toBe("one-ios");
      expect((readOne.template.conditions as Cond[]).find((c) => c.name === COND)?.expression).toBe("device.os == 'ios'");

      const versions = await api.listVersions({ pageSize: 10 });
      const versionOne = versions.versions[0];
      expect(versionOne.description).toBe("fbep test one");
      expect(versionOne.versionNumber).toMatch(/^\d+$/);

      // validate_only does not enforce a well-formed but outdated ETag; only a real publish does
      await expect(api.validate(testTemplate(readOne.template, "stale"), start.etag)).resolves.toBeUndefined();
      const stale = await api.publish(testTemplate(readOne.template, "stale"), start.etag, "stale").catch((e: unknown) => e);
      expect(isRemoteConfigConflict(stale)).toBe(true);
      expect((await api.getTemplate()).etag).toBe(one.etag);

      // publish v2 with the current ETag, then force v3 with an old one
      const two = await api.publish(testTemplate(readOne.template, "two"), one.etag, "fbep test two");
      const three = await api.publish(testTemplate(readOne.template, "three"), one.etag, "fbep test forced", { force: true });
      expect(three.etag).not.toBe(two.etag);
      expect(((await api.getTemplate()).template.parameters as Params)[PARAM].defaultValue?.value).toBe("three");

      // roll back to v1
      const rolled = await api.rollback(versionOne.versionNumber);
      expect(((rolled.template.parameters as Params)[PARAM]).defaultValue?.value).toBe("one");
      const current = await api.getTemplate();
      expect(current.etag).toBe(rolled.etag);
      expect(((current.template.parameters as Params)[PARAM]).defaultValue?.value).toBe("one");
      expect((await api.listVersions({ pageSize: 1 })).versions[0].updateType).toBe("ROLLBACK");
    }, 60_000);
  });
});
