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
import App from "../../App";
import { WelcomeView } from "../WelcomeView";
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
  window.matchMedia ??= ((q: string) => ({
    matches: false,
    media: q,
    addEventListener() {},
    removeEventListener() {},
  })) as unknown as typeof window.matchMedia;
  vi.stubGlobal("fetch", okFetch());
  useConnection.setState(initial);
  useSettings.getState().setLanguage("es");
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

async function addTwoThenSignOut() {
  await useConnection.getState().addText(keyJson());
  await useConnection.getState().addText(keyB());
  const accounts = useConnection.getState().accounts;
  await useConnection.getState().signOut();
  return accounts;
}

describe("WelcomeView with saved accounts", () => {
  it("lists the saved accounts with project id and client email plus the add-key button", async () => {
    await addTwoThenSignOut();
    render(<WelcomeView />);
    const list = await screen.findByTestId("welcome-accounts");
    expect(list.textContent).toContain("proj-a");
    expect(list.textContent).toContain("sa@proj-a.iam.gserviceaccount.com");
    expect(list.textContent).toContain("proj-b");
    expect(list.textContent).toContain("sa@proj-b.iam.gserviceaccount.com");
    expect(screen.getByTestId("import-key")).toBeTruthy();
  });

  it("connects to a saved account in one click without opening the file picker", async () => {
    const [a] = await addTwoThenSignOut();
    render(<WelcomeView />);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    fireEvent.click(await screen.findByTestId(`account-item:${a.id}`));
    await waitFor(() => expect(useConnection.getState().phase).toBe("connected"));
    expect(useConnection.getState().connection?.projectId).toBe("proj-a");
    expect(useConnection.getState().activeId).toBe(a.id);
    expect(picked.calls).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("shows no account list when there are no saved accounts", async () => {
    useConnection.setState({ phase: "welcome" });
    render(<WelcomeView />);
    expect(screen.getByTestId("welcome")).toBeTruthy();
    expect(screen.queryByTestId("welcome-accounts")).toBeNull();
    expect(screen.getByTestId("import-key")).toBeTruthy();
  });

  it("shows the localized error for a corrupt accounts index and adding a key still works", async () => {
    store.set("accounts", "{corrupt!");
    render(<App />);
    const alert = await screen.findByTestId("connection-error");
    expect(alert.textContent).toContain("No se pudo leer la clave privada");
    picked.file = { name: "k.json", contents: keyJson() };
    fireEvent.click(screen.getByTestId("import-key"));
    await waitFor(() => expect(useConnection.getState().phase).toBe("connected"));
    const index = JSON.parse(store.get("accounts")!);
    expect(index.accounts).toHaveLength(1);
    expect(index.accounts[0].projectId).toBe("proj-a");
    expect(index.activeId).toBe(index.accounts[0].id);
  });
});
