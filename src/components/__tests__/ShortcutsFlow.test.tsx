// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "../../i18n";
import { useKeyboardShortcuts } from "../../hooks/shortcuts";
import { useConnection } from "../../store/connection";
import { useEditorStore } from "../../store/documentEditor";
import { useFirestoreNav } from "../../store/firestoreNav";
import { useArea, useRcEditor } from "../../store/rcEditor";
import { useSettings } from "../../store/settings";
import { ConnectedView } from "../ConnectedView";

// jsdom lacks the layout APIs CodeMirror measures with
Range.prototype.getClientRects ??= () => [] as unknown as DOMRectList;
Range.prototype.getBoundingClientRect ??= () => new DOMRect();

const NAME = "projects/p/databases/(default)/documents/fbep_test_keys/d";
let doc: { name: string; fields: Record<string, unknown>; createTime: string; updateTime: string };
let calls: { method: string; url: string; body?: unknown }[];

const ok = (data: unknown, headers: Record<string, string> = {}) => ({ status: 200, data, text: JSON.stringify(data), headers: new Headers(headers) });
const request = async (url: string, opts: { method?: string; body?: unknown } = {}) => {
  const method = opts.method ?? "GET";
  calls.push({ method, url, body: opts.body });
  if (url.includes("remoteConfig:listVersions")) return ok({ versions: [] });
  if (url.includes("/remoteConfig")) return ok({ version: { versionNumber: "3" } }, { ETag: "etag-3" });
  if (url.includes(":listCollectionIds")) return ok({ collectionIds: ["fbep_test_keys"] });
  if (method === "PATCH") {
    doc = { ...doc, fields: { ...doc.fields, ...(opts.body as { fields: Record<string, unknown> }).fields }, updateTime: "2024-02-02T00:00:00Z" };
    return ok(doc);
  }
  if (url.includes("fbep_test_keys/d")) return ok(doc);
  if (url.includes("fbep_test_keys")) return ok({ documents: [doc] });
  return ok({});
};

const count = (pred: (c: { method: string; url: string }) => boolean) => calls.filter(pred).length;
const listCalls = () => count((c) => c.url.includes(":listCollectionIds"));
const docGets = () => count((c) => c.method === "GET" && c.url.endsWith("fbep_test_keys/d"));
const publishes = () => count((c) => c.method === "PUT" && c.url.includes("/remoteConfig") && !c.url.includes("validate_only"));

function Keys() { useKeyboardShortcuts(); return null; }
function mount() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}><Keys /><ConnectedView /></QueryClientProvider>);
}
const press = (init: KeyboardEventInit) => {
  const event = new KeyboardEvent("keydown", { cancelable: true, bubbles: true, ...init });
  act(() => { window.dispatchEvent(event); });
  return event;
};

beforeEach(() => {
  vi.spyOn(navigator, "platform", "get").mockReturnValue("MacIntel");
  doc = { name: NAME, fields: { a: { stringValue: "one" } }, createTime: "2024-01-01T00:00:00Z", updateTime: "2024-01-01T00:00:00Z" };
  calls = [];
  useSettings.getState().setLanguage("en");
  useArea.setState({ area: "firestore" });
  useRcEditor.getState().reset();
  useEditorStore.setState({ sessions: {}, view: "table", mode: "modified" });
  useFirestoreNav.setState({ expanded: {}, selectedDoc: null });
  useConnection.setState({ phase: "connected", connection: { client: { request }, projectId: "p", clientEmail: "x@y" } as never });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("⌘/Ctrl+R in Firestore", () => {
  it("refreshes the tree even with no document open, without reloading the page", async () => {
    mount();
    await screen.findByTestId("collection:fbep_test_keys");
    const before = listCalls();
    const event = press({ key: "r", metaKey: true });
    expect(event.defaultPrevented).toBe(true);
    await waitFor(() => expect(listCalls()).toBeGreaterThan(before));
  });

  it("refetches the open clean document and the tree together", async () => {
    useFirestoreNav.setState({ expanded: { "c:fbep_test_keys": true }, selectedDoc: "fbep_test_keys/d" });
    mount();
    await screen.findByTestId("document-editor");
    const lists = listCalls();
    const gets = docGets();
    doc = { ...doc, fields: { a: { stringValue: "server" } }, updateTime: "2024-03-03T00:00:00Z" };
    press({ key: "r", metaKey: true });
    await waitFor(() => expect(docGets()).toBeGreaterThan(gets));
    expect(listCalls()).toBeGreaterThan(lists);
    await waitFor(() => expect(useEditorStore.getState().sessions["p/fbep_test_keys/d"].text).toContain("server"));
  });

  it("uses Ctrl on Windows", async () => {
    vi.spyOn(navigator, "platform", "get").mockReturnValue("Win32");
    mount();
    await screen.findByTestId("collection:fbep_test_keys");
    const before = listCalls();
    const event = press({ key: "r", ctrlKey: true });
    expect(event.defaultPrevented).toBe(true);
    await waitFor(() => expect(listCalls()).toBeGreaterThan(before));
    expect(press({ key: "r", metaKey: true }).defaultPrevented).toBe(false);
  });
});

describe("⌘/Ctrl+S", () => {
  it("commits a focused table cell first, so the save includes it", async () => {
    useFirestoreNav.setState({ expanded: {}, selectedDoc: "fbep_test_keys/d" });
    mount();
    await screen.findByTestId("document-editor");
    const input = screen.getByTestId("row-a").querySelector("input")!;
    input.focus();
    fireEvent.change(input, { target: { value: "typed" } });
    expect(screen.getByTestId("status-save").textContent).toBe("Unsaved changes");
    press({ key: "s", metaKey: true });
    await waitFor(() => expect(count((c) => c.method === "PATCH")).toBe(1));
    const patch = calls.find((c) => c.method === "PATCH")!;
    expect(JSON.stringify(patch.body)).toContain("typed");
    await screen.findByTestId("save-status");
  });

  it("does nothing on a clean document", async () => {
    useFirestoreNav.setState({ expanded: {}, selectedDoc: "fbep_test_keys/d" });
    mount();
    await screen.findByTestId("document-editor");
    expect(press({ key: "s", metaKey: true }).defaultPrevented).toBe(true);
    await new Promise((r) => setTimeout(r, 10));
    expect(count((c) => c.method === "PATCH")).toBe(0);
  });

  it("in Remote Config only opens the confirmation; pressing again or Escape never publishes", async () => {
    mount();
    press({ key: "2", metaKey: true });
    await screen.findByTestId("rc-view");
    act(() => useRcEditor.getState().setText('{"parameters":{"fbep_test_m7_param":{"defaultValue":{"value":"x"}}}}'));
    press({ key: "s", metaKey: true });
    expect(screen.getByTestId("rc-publish-dialog")).toBeTruthy();
    press({ key: "s", metaKey: true });
    press({ key: "s", metaKey: true });
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByTestId("rc-publish-dialog")).toBeNull();
    press({ key: "s", metaKey: true });
    fireEvent.click(screen.getByTestId("rc-publish-cancel"));
    await new Promise((r) => setTimeout(r, 10));
    expect(publishes()).toBe(0);
  });
});

it("ignores shortcuts while an account action is in progress", async () => {
  mount();
  await screen.findByTestId("collection:fbep_test_keys");
  act(() => useConnection.setState({ phase: "verifying" }));
  press({ key: "2", metaKey: true });
  expect(useArea.getState().area).toBe("firestore");
});

it("every icon-only control has a name and a translated tooltip with its shortcut", async () => {
  useFirestoreNav.setState({ expanded: { "c:fbep_test_keys": true }, selectedDoc: "fbep_test_keys/d" });
  mount();
  await screen.findByTestId("document-editor");
  await screen.findByTestId("doc-toggle:fbep_test_keys/d");
  const iconOnly = () => [...document.querySelectorAll<HTMLElement>("button, [role=separator]")].filter((el) => !el.textContent?.trim());
  expect(iconOnly().length).toBeGreaterThan(8);
  for (const lang of ["en", "es"] as const) {
    act(() => useSettings.getState().setLanguage(lang));
    const missing = iconOnly().filter((el) => !el.getAttribute("aria-label")?.trim() || !el.getAttribute("title")?.trim());
    expect(missing.map((el) => el.outerHTML.slice(0, 80))).toEqual([]);
  }
  expect(screen.getByTestId("save-button").getAttribute("title")).toContain("⌘S");
  expect(screen.getByTestId("document-reload").getAttribute("title")).toContain("⌘R");
  expect(screen.getByTestId("json-format").getAttribute("title")).toContain("⌘⇧F");
  expect(screen.getByTestId("nav-firestore").getAttribute("title")).toContain("⌘1");
  expect(screen.getByTestId("nav-remote-config").getAttribute("title")).toContain("⌘2");
  act(() => useSettings.getState().setLanguage("en"));
  expect(screen.getByTestId("save-button").getAttribute("title")).toBe("Save (⌘S)");
  act(() => useSettings.getState().setLanguage("es"));
  expect(screen.getByTestId("save-button").getAttribute("title")).toBe("Guardar (⌘S)");
});

it("Ctrl+S saves a dirty document on Windows (and ⌘S does not)", async () => {
  vi.spyOn(navigator, "platform", "get").mockReturnValue("Win32");
  useFirestoreNav.setState({ expanded: {}, selectedDoc: "fbep_test_keys/d" });
  mount();
  await screen.findByTestId("document-editor");
  act(() => useEditorStore.getState().setText("p/fbep_test_keys/d", '{"a":"windows"}'));
  expect(press({ key: "s", metaKey: true }).defaultPrevented).toBe(false);
  await new Promise((r) => setTimeout(r, 10));
  expect(count((c) => c.method === "PATCH")).toBe(0);
  expect(press({ key: "s", ctrlKey: true }).defaultPrevented).toBe(true);
  await waitFor(() => expect(count((c) => c.method === "PATCH")).toBe(1));
  expect(JSON.stringify(calls.find((c) => c.method === "PATCH")!.body)).toContain("windows");
});

it("⌘R on a document with a draft asks first and never refetches it behind the editor", async () => {
  useFirestoreNav.setState({ expanded: {}, selectedDoc: "fbep_test_keys/d" });
  mount();
  await screen.findByTestId("document-editor");
  act(() => useEditorStore.getState().setText("p/fbep_test_keys/d", '{"a":"draft"}'));
  const gets = docGets();
  press({ key: "r", metaKey: true });
  await screen.findByTestId("reload-document-dialog");
  await new Promise((r) => setTimeout(r, 20));
  expect(docGets()).toBe(gets);
  fireEvent.click(screen.getByTestId("reload-document-cancel"));
  expect(useEditorStore.getState().sessions["p/fbep_test_keys/d"].text).toBe('{"a":"draft"}');
  expect(screen.getByTestId("document-editor")).toBeTruthy();
});

it("Discard also drops an invalid, uncommitted table cell", async () => {
  doc = { ...doc, fields: { a: { stringValue: "one" }, n: { integerValue: "5" } } };
  useFirestoreNav.setState({ expanded: {}, selectedDoc: "fbep_test_keys/d" });
  mount();
  await screen.findByTestId("document-editor");
  act(() => useEditorStore.getState().setText("p/fbep_test_keys/d", '{"a":"changed","n":5}'));
  const cell = screen.getByTestId("row-n").querySelector("input")!;
  fireEvent.change(cell, { target: { value: "5x" } });
  expect(screen.getByTestId("status-save").textContent).toBe("Unsaved changes");
  fireEvent.click(screen.getByTestId("discard-button"));
  await waitFor(() => expect((screen.getByTestId("row-n").querySelector("input") as HTMLInputElement).value).toBe("5"));
  expect(screen.getByTestId("status-save").textContent).toBe("All changes saved");
});
