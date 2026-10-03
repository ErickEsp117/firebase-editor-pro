// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const store = new Map<string, string>();
const picked = vi.hoisted(() => ({ file: null as { name: string; contents: string } | null, calls: 0 }));
vi.mock("../../platform", () => ({
  getPlatform: () => ({
    mode: "browser",
    signJwtRsa: async () => "a.b.c",
    secureStore: {
      get: async (k: string) => store.get(k) ?? null,
      set: async (k: string, v: string) => void store.set(k, v),
      delete: async (k: string) => void store.delete(k),
    },
    pickJsonFile: async () => {
      picked.calls++;
      return picked.file;
    },
  }),
}));

import "../../i18n";
import { AccountSwitcher } from "../AccountSwitcher";
import { useConnection } from "../../store/connection";
import { useSettings } from "../../store/settings";

const PEM = `-----BEGIN ${"PRIVATE"} KEY-----\nAAAA\n-----END PRIVATE KEY-----\n`;
const keyJson = (over: Record<string, unknown> = {}) =>
  JSON.stringify({
    type: "service_account",
    project_id: "proj-a",
    private_key: PEM,
    private_key_id: "kid-a",
    client_email: "sa@proj-a.iam.gserviceaccount.com",
    token_uri: "https://oauth2.googleapis.com/token",
    ...over,
  });
const keyB = () =>
  keyJson({ project_id: "proj-b", private_key_id: "kid-b", client_email: "sa@proj-b.iam.gserviceaccount.com" });
const keyC = () =>
  keyJson({ project_id: "proj-c", private_key_id: "kid-c", client_email: "sa@proj-c.iam.gserviceaccount.com" });

const okFetch = () =>
  vi.fn(async (url: string) =>
    url.includes("oauth2")
      ? new Response(JSON.stringify({ access_token: "tok", expires_in: 3600 }), { status: 200 })
      : new Response(JSON.stringify({ collectionIds: ["users"] }), { status: 200 }),
  );

const initial = {
  phase: "restoring" as const,
  accounts: [],
  activeId: null,
  connection: null,
  error: null,
  duplicateOf: null,
};

beforeEach(() => {
  store.clear();
  picked.file = null;
  picked.calls = 0;
  vi.stubGlobal("fetch", okFetch());
  useConnection.setState(initial);
  useSettings.getState().setLanguage("es");
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

async function addTwo() {
  await useConnection.getState().addText(keyJson());
  await useConnection.getState().addText(keyB());
  return useConnection.getState().accounts;
}

async function openSwitcher() {
  render(<AccountSwitcher />);
  fireEvent.click(screen.getByTestId("account-switcher-toggle"));
}

describe("AccountSwitcher", () => {
  it("lists the saved accounts and marks the active one", async () => {
    const [a, b] = await addTwo();
    await openSwitcher();
    const activeItem = await screen.findByTestId(`account-item:${b.id}`);
    expect(activeItem.getAttribute("aria-current")).toBe("true");
    expect(activeItem.textContent).toContain("proj-b");
    expect(activeItem.textContent).toContain("sa@proj-b.iam.gserviceaccount.com");
    expect(activeItem.textContent).toContain("activa");
    const other = screen.getByTestId(`account-item:${a.id}`);
    expect(other.getAttribute("aria-current")).toBeNull();
    expect(other.textContent).toContain("proj-a");
    expect(screen.getByTestId("add-account")).toBeTruthy();
  });

  it("switches to another account in one click, without the file picker or the network", async () => {
    const [a] = await addTwo();
    await openSwitcher();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    fireEvent.click(await screen.findByTestId(`account-item:${a.id}`));
    await waitFor(() => expect(useConnection.getState().activeId).toBe(a.id));
    expect(useConnection.getState().connection?.projectId).toBe("proj-a");
    expect(picked.calls).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("adds a valid key, stores it and makes it the active account", async () => {
    await addTwo();
    await openSwitcher();
    picked.file = { name: "c.json", contents: keyC() };
    fireEvent.click(screen.getByTestId("add-account"));
    await waitFor(() => expect(useConnection.getState().accounts).toHaveLength(3));
    const added = useConnection.getState().accounts[2];
    expect(useConnection.getState().activeId).toBe(added.id);
    expect(useConnection.getState().connection?.projectId).toBe("proj-c");
    expect((await screen.findByTestId(`account-item:${added.id}`)).getAttribute("aria-current")).toBe("true");
  });

  it("shows the localized diagnostics for a rejected key and keeps the previous account active", async () => {
    const [, b] = await addTwo();
    await openSwitcher();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ error: "invalid_grant", error_description: "bad sig" }), { status: 400 })),
    );
    picked.file = { name: "fake.json", contents: keyC() };
    fireEvent.click(screen.getByTestId("add-account"));
    const alert = await screen.findByTestId("connection-error");
    expect(alert.textContent).toContain("Google rechazó la credencial");
    const tech = screen.getByTestId("connection-error-technical").textContent!;
    expect(tech).toContain("fake.json");
    expect(tech).toContain("kid-c");
    expect(useConnection.getState().accounts).toHaveLength(2);
    expect(useConnection.getState().activeId).toBe(b.id);
    expect(useConnection.getState().connection?.projectId).toBe("proj-b");
  });

  it("re-importing a saved key selects the existing account and shows a notice instead of duplicating", async () => {
    const [a] = await addTwo();
    await openSwitcher();
    picked.file = { name: "k.json", contents: keyJson() };
    fireEvent.click(screen.getByTestId("add-account"));
    const notice = await screen.findByTestId("account-duplicate-notice");
    expect(notice.textContent).toContain("ya estaba guardada");
    expect(useConnection.getState().accounts).toHaveLength(2);
    expect(useConnection.getState().activeId).toBe(a.id);
    expect((await screen.findByTestId(`account-item:${a.id}`)).getAttribute("aria-current")).toBe("true");
  });
});
