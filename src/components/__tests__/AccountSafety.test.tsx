// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const store = new Map<string, string>();
const flags = vi.hoisted(() => ({ failDeleteFor: null as string | null }));
vi.mock("../../platform", () => ({
  getPlatform: () => ({
    mode: "browser",
    signJwtRsa: async () => "a.b.c",
    secureStore: {
      get: async (k: string) => store.get(k) ?? null,
      set: async (k: string, v: string) => void store.set(k, v),
      delete: async (k: string) => {
        if (flags.failDeleteFor === k) throw new Error("keychain unavailable");
        store.delete(k);
      },
    },
    pickJsonFile: async () => null,
  }),
}));

import "../../i18n";
import type { FirestoreDocument } from "../../core";
import { docToText } from "../DocumentEditor/editorModel";
import { AccountSwitcher } from "../AccountSwitcher";
import { ConnectedView } from "../ConnectedView";
import { WelcomeView } from "../WelcomeView";
import { useConnection } from "../../store/connection";
import { useEditorStore } from "../../store/documentEditor";
import { useRcEditor } from "../../store/rcEditor";
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
  orphaned: null,
};

const baseDoc: FirestoreDocument = {
  name: "projects/proj-b/databases/(default)/documents/users/u1",
  fields: { name: { stringValue: "Ana" } },
  createTime: "2026-01-01T00:00:00Z",
  updateTime: "2026-01-01T00:00:00Z",
};

function dirtyDocument() {
  useEditorStore.getState().open("proj-b/users/u1", { baseDoc, text: docToText(baseDoc) });
  useEditorStore.getState().setText("proj-b/users/u1", JSON.stringify({ name: "Bea" }));
}

function dirtyTemplate() {
  const base = JSON.stringify({ parameters: {} }, null, 2);
  useRcEditor.getState().open({ projectId: "proj-b", etag: "e", baseText: base, text: base });
  useRcEditor.getState().setText(JSON.stringify({ parameters: { fbep_test_x: {} } }));
}

function withQuery(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

beforeEach(() => {
  store.clear();
  flags.failDeleteFor = null;
  window.matchMedia ??= ((q: string) => ({
    matches: false,
    media: q,
    addEventListener() {},
    removeEventListener() {},
  })) as unknown as typeof window.matchMedia;
  vi.stubGlobal("fetch", okFetch());
  useConnection.setState(initial);
  useEditorStore.getState().clear();
  useRcEditor.getState().reset();
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

describe("account switching with unsaved changes", () => {
  it("asks for confirmation; cancel keeps the account and both drafts intact", async () => {
    const [a, b] = await addTwo();
    dirtyDocument();
    await openSwitcher();
    fireEvent.click(await screen.findByTestId(`account-item:${a.id}`));
    const dialog = await screen.findByTestId("switch-account-dialog");
    expect(dialog.textContent).toContain("cambios sin guardar");
    fireEvent.click(screen.getByTestId("switch-account-cancel"));
    await waitFor(() => expect(screen.queryByTestId("switch-account-dialog")).toBeNull());
    expect(useConnection.getState().activeId).toBe(b.id);
    expect(useConnection.getState().connection?.projectId).toBe("proj-b");
    expect(useEditorStore.getState().sessions["proj-b/users/u1"].text).toContain("Bea");
  });

  it("confirming switches the account and discards the drafts", async () => {
    const [a] = await addTwo();
    dirtyDocument();
    await openSwitcher();
    fireEvent.click(await screen.findByTestId(`account-item:${a.id}`));
    fireEvent.click(await screen.findByTestId("switch-account-confirm"));
    await waitFor(() => expect(useConnection.getState().activeId).toBe(a.id));
    expect(useConnection.getState().connection?.projectId).toBe("proj-a");
    expect(useEditorStore.getState().sessions).toEqual({});
  });

  it("also asks when only the Remote Config draft is dirty", async () => {
    const [a] = await addTwo();
    dirtyTemplate();
    await openSwitcher();
    fireEvent.click(await screen.findByTestId(`account-item:${a.id}`));
    expect(await screen.findByTestId("switch-account-dialog")).toBeTruthy();
  });

  it("switches without asking when there are no unsaved changes", async () => {
    const [a] = await addTwo();
    await openSwitcher();
    fireEvent.click(await screen.findByTestId(`account-item:${a.id}`));
    expect(screen.queryByTestId("switch-account-dialog")).toBeNull();
    await waitFor(() => expect(useConnection.getState().activeId).toBe(a.id));
  });

  it("shows the dialog in English after switching the language", async () => {
    const [a] = await addTwo();
    dirtyDocument();
    useSettings.getState().setLanguage("en");
    await openSwitcher();
    fireEvent.click(await screen.findByTestId(`account-item:${a.id}`));
    const dialog = await screen.findByTestId("switch-account-dialog");
    expect(dialog.textContent).toContain("Discard unsaved changes?");
    expect(dialog.textContent).toContain("Remote Config");
    expect(screen.getByTestId("switch-account-confirm").textContent).toBe("Discard and switch");
  });
});

describe("adding a key with a draft", () => {
  it("asks before opening the picker and cancel preserves the draft", async () => {
    await addTwo();
    dirtyDocument();
    await openSwitcher();
    fireEvent.click(screen.getByTestId("add-account"));
    expect(await screen.findByTestId("add-account-dialog")).toBeTruthy();
    fireEvent.click(screen.getByTestId("add-account-cancel"));
    expect(useEditorStore.getState().sessions["proj-b/users/u1"].text).toContain("Bea");
  });
});

describe("sign out with unsaved changes", () => {
  it("asks first; cancel keeps the session and the draft, confirm signs out and discards it", async () => {
    await addTwo();
    dirtyDocument();
    withQuery(<ConnectedView />);
    fireEvent.click(await screen.findByTestId("disconnect"));
    const dialog = await screen.findByTestId("disconnect-dialog");
    expect(dialog.textContent).toContain("cambios sin guardar");
    expect(dialog.textContent).toContain("se conservan");
    fireEvent.click(screen.getByTestId("disconnect-cancel"));
    await waitFor(() => expect(screen.queryByTestId("disconnect-dialog")).toBeNull());
    expect(useConnection.getState().phase).toBe("connected");
    expect(useEditorStore.getState().sessions["proj-b/users/u1"].text).toContain("Bea");
    fireEvent.click(screen.getByTestId("disconnect"));
    fireEvent.click(await screen.findByTestId("disconnect-confirm"));
    await waitFor(() => expect(useConnection.getState().phase).toBe("welcome"));
    expect(useConnection.getState().accounts).toHaveLength(2);
    expect(useEditorStore.getState().sessions).toEqual({});
    expect(store.has("sa:" + useConnection.getState().accounts[0].id)).toBe(true);
  });

  it("signs out directly when there are no unsaved changes", async () => {
    await addTwo();
    withQuery(<ConnectedView />);
    fireEvent.click(await screen.findByTestId("disconnect"));
    expect(screen.queryByTestId("disconnect-dialog")).toBeNull();
    await waitFor(() => expect(useConnection.getState().phase).toBe("welcome"));
    expect(useConnection.getState().accounts).toHaveLength(2);
  });
});

describe("delete key", () => {
  it("asks for confirmation; cancel keeps the list, the index and the credential", async () => {
    const [a, b] = await addTwo();
    await openSwitcher();
    fireEvent.click(await screen.findByTestId(`remove-account:${a.id}`));
    const dialog = await screen.findByTestId("remove-account-dialog");
    expect(dialog.textContent).toContain("proj-a");
    fireEvent.click(screen.getByTestId("remove-account-cancel"));
    await waitFor(() => expect(screen.queryByTestId("remove-account-dialog")).toBeNull());
    expect(useConnection.getState().accounts).toHaveLength(2);
    expect(store.has(`sa:${a.id}`)).toBe(true);
    expect(useConnection.getState().activeId).toBe(b.id);
  });

  it("confirming removes a non-active account and its credential without touching the session", async () => {
    const [a, b] = await addTwo();
    const connection = useConnection.getState().connection;
    await openSwitcher();
    fireEvent.click(await screen.findByTestId(`remove-account:${a.id}`));
    fireEvent.click(await screen.findByTestId("remove-account-confirm"));
    await waitFor(() => expect(useConnection.getState().accounts.map((x) => x.id)).toEqual([b.id]));
    expect(store.has(`sa:${a.id}`)).toBe(false);
    expect(useConnection.getState().activeId).toBe(b.id);
    expect(useConnection.getState().connection).toBe(connection);
  });

  it("mentions unsaved changes when removing the active account while dirty", async () => {
    const [, b] = await addTwo();
    dirtyDocument();
    await openSwitcher();
    fireEvent.click(await screen.findByTestId(`remove-account:${b.id}`));
    const dialog = await screen.findByTestId("remove-account-dialog");
    expect(screen.getByTestId("unsaved-warning").textContent).toContain("cambios sin guardar");
    expect(dialog.textContent).toContain("proj-b");
  });

  it("shows a localized notice when the credential cannot be deleted (orphaned)", async () => {
    const [a] = await addTwo();
    flags.failDeleteFor = `sa:${a.id}`;
    await openSwitcher();
    fireEvent.click(await screen.findByTestId(`remove-account:${a.id}`));
    fireEvent.click(await screen.findByTestId("remove-account-confirm"));
    const notice = await screen.findByTestId("account-orphaned-notice");
    expect(notice.textContent).toContain("no se pudo borrar la credencial");
    expect(useConnection.getState().accounts.map((x) => x.id)).not.toContain(a.id);
    expect(store.has(`sa:${a.id}`)).toBe(true);
    useSettings.getState().setLanguage("en");
    await waitFor(() =>
      expect(screen.getByTestId("account-orphaned-notice").textContent).toContain("could not be deleted"),
    );
    fireEvent.click(screen.getByText("Dismiss"));
    await waitFor(() => expect(screen.queryByTestId("account-orphaned-notice")).toBeNull());
  });

  it("offers delete on the welcome list too, and removing the last account leaves no credential keys", async () => {
    await useConnection.getState().addText(keyJson());
    const [a] = useConnection.getState().accounts;
    await useConnection.getState().signOut();
    render(<WelcomeView />);
    fireEvent.click(await screen.findByTestId(`remove-account:${a.id}`));
    fireEvent.click(await screen.findByTestId("remove-account-confirm"));
    await waitFor(() => expect(useConnection.getState().accounts).toHaveLength(0));
    expect([...store.keys()].filter((k) => k.startsWith("sa:"))).toEqual([]);
    expect(useConnection.getState().phase).toBe("welcome");
  });
});

describe("account list in the sidebar (M7 layout)", () => {
  it("is an expanded list whose header toggle collapses and expands it", async () => {
    const [a] = await addTwo();
    render(<AccountSwitcher sidebar />);
    const toggle = screen.getByTestId("account-switcher-toggle");
    expect(toggle.hidden).toBe(false);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByTestId(`account-item:${a.id}`).getAttribute("role")).toBeNull();
    expect(screen.queryByRole("menu")).toBeNull();
    fireEvent.click(toggle);
    expect(screen.queryByTestId(`account-item:${a.id}`)).toBeNull();
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(toggle);
    expect(screen.getByTestId("add-account")).toBeTruthy();
  });

  it("shows a rejected key's error and the duplicate notice in the flow of the sidebar, not as clipped popovers", async () => {
    await addTwo();
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: "invalid_grant" }), { status: 400 })));
    render(<AccountSwitcher sidebar />);
    await useConnection.getState().addText(keyJson({ private_key_id: "kid-new", client_email: "other@proj-a.iam.gserviceaccount.com" }), "bad.json");
    const error = await screen.findByTestId("connection-error");
    expect(error.closest(".absolute")).toBeNull();
    vi.stubGlobal("fetch", okFetch());
    await useConnection.getState().addText(keyJson());
    const notice = await screen.findByTestId("account-duplicate-notice");
    expect(notice.className).not.toContain("absolute");
  });
});

describe("welcome with saved accounts", () => {
  it("offers 'Añadir key' / 'Add key' on the import button", async () => {
    await addTwo();
    await useConnection.getState().signOut();
    render(<WelcomeView />);
    expect(screen.getByTestId("import-key").textContent).toBe("Añadir key");
    useSettings.getState().setLanguage("en");
    await waitFor(() => expect(screen.getByTestId("import-key").textContent).toBe("Add key"));
  });
});

describe("switching accounts with a document open", () => {
  it("never requests the previous account's document from the new project", async () => {
    const [a] = await addTwo(); // proj-b active
    const { useFirestoreNav } = await import("../../store/firestoreNav");
    useFirestoreNav.setState({ expanded: { "c:only_in_b": true }, selectedDoc: "only_in_b/doc1" });
    const urls: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      urls.push(String(url));
      return url.includes("oauth2")
        ? new Response(JSON.stringify({ access_token: "tok", expires_in: 3600 }), { status: 200 })
        : new Response(JSON.stringify({ collectionIds: [] }), { status: 200 });
    }));
    function Keyed() {
      const activeId = useConnection((s) => s.activeId);
      return <ConnectedView key={activeId ?? "none"} />;
    }
    withQuery(<Keyed />);
    await useConnection.getState().switchTo(a.id);
    await waitFor(() => expect(useConnection.getState().connection?.projectId).toBe("proj-a"));
    await new Promise((r) => setTimeout(r, 20));
    expect(urls.filter((u) => u.includes("proj-a") && u.includes("only_in_b"))).toEqual([]);
    expect(useFirestoreNav.getState().selectedDoc).toBeNull();
  });
});

describe("deleting a document with a draft", () => {
  it("forgets the draft so it no longer counts as unsaved", async () => {
    const { hasUnsavedChanges } = await import("../../store/unsavedChanges");
    dirtyDocument();
    expect(hasUnsavedChanges()).toBe(true);
    useEditorStore.getState().drop("proj-b", "users/u1");
    expect(hasUnsavedChanges()).toBe(false);
    dirtyDocument();
    useEditorStore.getState().drop("proj-b", "users", true);
    expect(hasUnsavedChanges()).toBe(false);
  });
});
