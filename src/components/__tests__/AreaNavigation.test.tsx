// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import "../../i18n";
import { useConnection } from "../../store/connection";
import { useEditorStore } from "../../store/documentEditor";
import { useFirestoreNav } from "../../store/firestoreNav";
import { useArea, useRcEditor } from "../../store/rcEditor";
import { useSettings } from "../../store/settings";
import { ConnectedView } from "../ConnectedView";

// jsdom lacks the layout APIs CodeMirror measures with
Range.prototype.getClientRects ??= () => [] as unknown as DOMRectList;
Range.prototype.getBoundingClientRect ??= () => new DOMRect();

const DOC = {
  name: "projects/p/databases/(default)/documents/fbep_test_nav/d",
  fields: { a: { stringValue: "one" } },
  createTime: "2024-01-01T00:00:00Z",
  updateTime: "2024-01-01T00:00:00Z",
};

const request = async (url: string) => {
  const ok = (data: unknown, headers: Record<string, string> = {}) => ({ status: 200, data, text: JSON.stringify(data), headers: new Headers(headers) });
  if (url.includes("remoteConfig:listVersions")) return ok({ versions: [] });
  if (url.includes("/remoteConfig")) return ok({ version: { versionNumber: "3" } }, { ETag: "etag-3" });
  if (url.includes("fbep_test_nav/d")) return ok(DOC);
  return ok({});
};

beforeEach(() => {
  useSettings.getState().setLanguage("en");
  useArea.setState({ area: "firestore" });
  useRcEditor.getState().reset();
  useEditorStore.setState({ sessions: {}, view: "table", mode: "modified" });
  useFirestoreNav.setState({ expanded: {}, selectedDoc: "fbep_test_nav/d" });
  useConnection.setState({ phase: "connected", connection: { client: { request }, projectId: "p", clientEmail: "x@y" } as never });
});
afterEach(cleanup);

function mount() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ConnectedView />
    </QueryClientProvider>,
  );
}

describe("Firestore <-> Remote Config navigation", () => {
  it("keeps the open document and its unsaved edit while Remote Config is shown", async () => {
    mount();
    await screen.findByTestId("document-view");
    act(() => useEditorStore.getState().setText("p/fbep_test_nav/d", '{"a":"edited"}'));
    expect(screen.queryByTestId("rc-view")).toBeNull();

    fireEvent.click(screen.getByTestId("nav-remote-config"));
    await screen.findByTestId("rc-view");
    expect(screen.getByTestId("area-firestore").hidden).toBe(true);
    expect(screen.getByTestId("area-remote-config").hidden).toBe(false);
    expect(screen.getByTestId("nav-remote-config").getAttribute("aria-current")).toBe("page");

    fireEvent.click(screen.getByTestId("nav-firestore"));
    await waitFor(() => expect(screen.getByTestId("area-firestore").hidden).toBe(false));
    expect(screen.getByTestId("document-path").textContent).toBe("fbep_test_nav/d");
    expect(screen.getByTestId("dirty-indicator")).toBeTruthy();
    expect(useEditorStore.getState().sessions["p/fbep_test_nav/d"].text).toBe('{"a":"edited"}');
    // Remote Config keeps its own state too
    expect(screen.getByTestId("rc-etag").textContent).toBe("ETag: etag-3");
  });
});
