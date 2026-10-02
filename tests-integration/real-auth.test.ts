import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { ApiClient } from "../src/core/ApiClient";
import { ServiceAccountAuth } from "../src/core/ServiceAccountAuth";
import { BrowserPlatform } from "../src/platform/BrowserPlatform";

const keyPath = resolve(__dirname, "../dev-secrets/test-key.json");

// Read-only against the real project: no writes are performed here.
describe.skipIf(!existsSync(keyPath))("real auth + transport (project of dev-secrets/test-key.json)", () => {
  const setup = () => {
    const auth = ServiceAccountAuth.fromKeyJson(readFileSync(keyPath, "utf8"), {
      platform: new BrowserPlatform(),
    });
    const client = new ApiClient(auth, { platform: { mode: "browser" } });
    const listUrl = `https://firestore.googleapis.com/v1/projects/${auth.projectId}/databases/(default)/documents:listCollectionIds`;
    return { auth, client, listUrl };
  };

  it("mints a real access token", async () => {
    const { auth } = setup();
    const token = await auth.getAccessToken();
    expect(token.length).toBeGreaterThan(20);
  });

  it("lists root collection ids (200)", async () => {
    const { client, listUrl } = setup();
    const res = await client.request<{ collectionIds?: string[] }>(listUrl, { method: "POST", body: {} });
    expect(res.status).toBe(200);
    expect(res.data.collectionIds).toEqual(expect.arrayContaining(["users"]));
  });

  it("re-mints transparently after simulated token expiry", async () => {
    const { auth, client, listUrl } = setup();
    const first = await auth.getAccessToken();
    auth.invalidate();
    const res = await client.request(listUrl, { method: "POST", body: {} });
    expect(res.status).toBe(200);
    expect(await auth.getAccessToken()).not.toBe(first);
  });
});
