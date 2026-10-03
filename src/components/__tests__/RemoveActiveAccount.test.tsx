// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const store = new Map<string, string>();
const flags = vi.hoisted(() => ({ slowKey: null as string | null }));
vi.mock("../../platform", () => ({
  getPlatform: () => ({
    mode: "browser",
    signJwtRsa: async (_pk: string, _h: unknown, claims: { iss: string }) => `jwt.${claims.iss}`,
    secureStore: {
      get: async (k: string) => {
        // The next account's keychain read takes a moment (IPC, keychain prompt).
        if (flags.slowKey === k) await new Promise((r) => setTimeout(r, 60));
        return store.get(k) ?? null;
      },
      set: async (k: string, v: string) => void store.set(k, v),
      delete: async (k: string) => void store.delete(k),
    },
    pickJsonFile: async () => null,
  }),
}));

import "../../i18n";
import App from "../../App";
import { accountSecretKey } from "../../core/accounts";
import { useConnection } from "../../store/connection";
import { useArea, useRcEditor } from "../../store/rcEditor";
import { useSettings } from "../../store/settings";

Range.prototype.getClientRects ??= () => [] as unknown as DOMRectList;
Range.prototype.getBoundingClientRect ??= () => new DOMRect();

const PEM = `-----BEGIN ${"PRIVATE"} KEY-----\nAAAA\n-----END PRIVATE KEY-----\n`;
// Two service accounts of the same project; only "a" may read Remote Config.
const key = (who: string) =>
  JSON.stringify({
    type: "service_account",
    project_id: "p",
    private_key: PEM,
    private_key_id: `kid-${who}`,
    client_email: `${who}@p.iam.gserviceaccount.com`,
    token_uri: "https://oauth2.googleapis.com/token",
  });

let calls: { url: string; auth: string | undefined }[] = [];
beforeEach(() => {
  store.clear();
  localStorage.clear();
  calls = [];
  flags.slowKey = null;
  window.matchMedia ??= ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;
  vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit = {}) => {
    const auth = (init.headers as Record<string, string> | undefined)?.Authorization;
    calls.push({ url, auth });
    if (url.includes("oauth2")) {
      const iss = new URLSearchParams(String(init.body)).get("assertion")!.slice(4);
      return new Response(JSON.stringify({ access_token: `tok-${iss}`, expires_in: 3600 }), { status: 200 });
    }
    if (url.includes("remoteConfig:listVersions")) return new Response(JSON.stringify({ versions: [] }), { status: 200 });
    if (url.includes("/remoteConfig")) {
      return auth?.includes("tok-a@")
        ? new Response(JSON.stringify({ parameters: { only_a_can_read: { defaultValue: { value: "x" } } }, version: { versionNumber: "7" } }), { status: 200, headers: { ETag: "etag-a" } })
        : new Response(JSON.stringify({ error: { code: 403, status: "PERMISSION_DENIED", message: "denied" } }), { status: 403 });
    }
    if (url.includes(":listCollectionIds")) return new Response(JSON.stringify({ collectionIds: ["users"] }), { status: 200 });
    return new Response("{}", { status: 200 });
  }));
  useConnection.setState({ phase: "restoring", accounts: [], activeId: null, connection: null, error: null, duplicateOf: null, orphaned: null });
  useRcEditor.getState().reset();
  useSettings.getState().setLanguage("en");
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it("removing the active account never requests with its key again nor hands its data to the next account", async () => {
  await useConnection.getState().addText(key("b"));
  await useConnection.getState().addText(key("a"));
  const [b, a] = useConnection.getState().accounts;
  useArea.setState({ area: "remoteConfig" });
  render(<App />);
  await screen.findByTestId("rc-view");
  expect(useRcEditor.getState().session?.text).toContain("only_a_can_read");

  flags.slowKey = accountSecretKey(b.id);
  const mark = calls.length;
  await act(async () => {
    await useConnection.getState().remove(a.id);
  });
  expect(useConnection.getState().activeId).toBe(b.id);
  await act(async () => {
    await new Promise((r) => setTimeout(r, 100));
  });
  expect(calls.slice(mark).filter((c) => c.auth?.includes("tok-a@"))).toEqual([]);
  expect(useRcEditor.getState().session?.text ?? "").not.toContain("only_a_can_read");
  expect(await screen.findByTestId("rc-load-error")).toBeTruthy();
});
