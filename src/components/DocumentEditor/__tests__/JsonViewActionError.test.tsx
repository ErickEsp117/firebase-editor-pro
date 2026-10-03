// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import i18n from "../../../i18n";
import { useKeyboardShortcuts } from "../../../hooks/shortcuts";
import type { FirestoreDocument } from "../../../core";
import { useConnection } from "../../../store/connection";
import { useEditorStore } from "../../../store/documentEditor";
import { useArea } from "../../../store/rcEditor";
import { DocumentEditor } from "../DocumentEditor";

// jsdom lacks the layout APIs CodeMirror measures with
Range.prototype.getClientRects ??= () => [] as unknown as DOMRectList;
Range.prototype.getBoundingClientRect ??= () => new DOMRect();

const DOC: FirestoreDocument = {
  name: "projects/p/databases/(default)/documents/fbep_test_x/d",
  fields: { a: { stringValue: "one" } },
  createTime: "2024-01-01T00:00:00Z",
  updateTime: "2024-01-01T00:00:00Z",
};
const KEY = "p/fbep_test_x/d";

function Keys() { useKeyboardShortcuts(); return null; }

function mount() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <Keys /><DocumentEditor path="fbep_test_x/d" serverDoc={DOC} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  useArea.setState({ area: "firestore" });
  useEditorStore.setState({ sessions: {}, view: "json", mode: "modified" });
  useConnection.setState({ phase: "connected", connection: { client: { request: async () => ({ data: DOC }) }, projectId: "p", clientEmail: "x" } as never });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("JSON format/repair failure", () => {
  it("follows the active language instead of freezing the text at failure time", async () => {
    await act(async () => {
      await i18n.changeLanguage("es");
    });
    mount();
    act(() => useEditorStore.getState().setText(KEY, "{ not json"));
    fireEvent.click(screen.getByTestId("json-format"));
    expect(screen.getByTestId("json-action-error").textContent).toBe(i18n.getFixedT("es")("editor.actionFailed"));
    await act(async () => {
      await i18n.changeLanguage("en");
    });
    expect(screen.getByTestId("json-action-error").textContent).toBe(i18n.getFixedT("en")("editor.actionFailed"));
  });

  it("⌘⇧F shows the same error as the Format button and leaves the text and save state alone", () => {
    vi.spyOn(navigator, "platform", "get").mockReturnValue("MacIntel");
    mount();
    act(() => useEditorStore.getState().setText(KEY, "{ not json"));
    act(() => { fireEvent.keyDown(window, { key: "f", metaKey: true, shiftKey: true }); });
    expect(screen.getByTestId("json-action-error")).toBeTruthy();
    expect(screen.queryByTestId("save-error")).toBeNull();
    expect(useEditorStore.getState().sessions[KEY].text).toBe("{ not json");
  });

  it("⌘⇧F formats exactly like the toolbar button", () => {
    vi.spyOn(navigator, "platform", "get").mockReturnValue("MacIntel");
    mount();
    act(() => useEditorStore.getState().setText(KEY, '{"a":"one","b":[1,2]}'));
    act(() => { fireEvent.keyDown(window, { key: "F", metaKey: true, shiftKey: true }); });
    const viaShortcut = useEditorStore.getState().sessions[KEY].text;
    act(() => useEditorStore.getState().setText(KEY, '{"a":"one","b":[1,2]}'));
    fireEvent.click(screen.getByTestId("json-format"));
    expect(useEditorStore.getState().sessions[KEY].text).toBe(viaShortcut);
    expect(viaShortcut).toContain("\n");
    expect(screen.queryByTestId("json-action-error")).toBeNull();
  });
});
