// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import "../../../i18n";
import { ApiError } from "../../../core";
import { useConnection } from "../../../store/connection";
import { useEditorStore } from "../../../store/documentEditor";
import { useFirestoreNav } from "../../../store/firestoreNav";
import { useRcEditor } from "../../../store/rcEditor";
import { useSettings } from "../../../store/settings";
import { DocumentEditor } from "../../DocumentEditor/DocumentEditor";
import { DocumentView } from "../../Firestore/DocumentView";
import { FirestoreBrowser } from "../../Firestore/FirestoreBrowser";
import { RemoteConfigView } from "../../RemoteConfig/RemoteConfigView";

Range.prototype.getClientRects ??= () => [] as unknown as DOMRectList;
Range.prototype.getBoundingClientRect ??= () => new DOMRect();

const NAME = "projects/p/databases/(default)/documents/fbep_test_x/d";
const doc = { name: NAME, fields: { a: { stringValue: "one" } }, createTime: "2024-01-01T00:00:00Z", updateTime: "2024-01-01T00:00:00Z" };

const offline = () => new ApiError(0, "UNAVAILABLE", "Failed to fetch");
const forbidden = () => new ApiError(403, "PERMISSION_DENIED", "The caller does not have permission");

function connect(request: (url: string, opts?: { method?: string }) => Promise<unknown>) {
  useConnection.setState({ phase: "connected", connection: { client: { request }, projectId: "p", clientEmail: "x" } as never });
}

function wrap(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

beforeEach(() => {
  useSettings.getState().setLanguage("es");
  useFirestoreNav.getState().reset();
  useEditorStore.setState({ sessions: {}, view: "table", mode: "modified" });
  useRcEditor.getState().reset();
});
afterEach(cleanup);

describe("network failure", () => {
  it("shows a translated offline message in the tree and recovers on retry", async () => {
    let down = true;
    connect(async () => {
      if (down) throw offline();
      return { data: { collectionIds: ["users"] } };
    });
    wrap(<FirestoreBrowser />);
    const err = await screen.findByTestId("collections-error");
    expect(err.textContent).toContain("Sin conexión");
    expect(err.textContent).not.toContain("Failed to fetch");
    act(() => useSettings.getState().setLanguage("en"));
    expect(screen.getByTestId("collections-error").textContent).toContain("No connection");
    down = false;
    fireEvent.click(screen.getByText("Retry"));
    await screen.findByTestId("collection:users");
  });

  it("keeps the editor content when a save fails offline, and a retry saves", async () => {
    let down = true;
    connect(async (_url, opts) => {
      if (opts?.method === "PATCH") {
        if (down) throw offline();
        return { data: { ...doc, updateTime: "2024-02-02T00:00:00Z" } };
      }
      return { data: doc };
    });
    wrap(<DocumentEditor path="fbep_test_x/d" serverDoc={doc} />);
    const input = screen.getByTestId("row-a").querySelector("input")!;
    fireEvent.change(input, { target: { value: "two" } });
    fireEvent.blur(input);
    fireEvent.click(screen.getByTestId("save-button"));
    const err = await screen.findByTestId("save-error");
    expect(err.textContent).toContain("Sin conexión");
    expect(err.textContent).toContain("Tus cambios siguen en el editor");
    expect((screen.getByTestId("row-a").querySelector("input") as HTMLInputElement).value).toBe("two");
    down = false;
    fireEvent.click(screen.getByTestId("save-button"));
    await screen.findByTestId("save-status");
  });
});

describe("Remote Config offline", () => {
  it("explains a failed validation as a connection problem, not as a rejected template", async () => {
    let down = false;
    connect(async (url) => {
      if (url.includes(":listVersions")) return { data: { versions: [] }, headers: new Headers() };
      if (down) throw offline();
      return { data: {}, headers: new Headers({ ETag: "e1" }), status: 200 };
    });
    wrap(<RemoteConfigView />);
    await screen.findByTestId("rc-etag");
    down = true;
    fireEvent.click(screen.getByTestId("rc-validate"));
    const msg = await screen.findByTestId("rc-validation-error");
    expect(msg.textContent).toContain("Sin conexión");
    expect(msg.textContent).not.toContain("rechazó");
  });
});

describe("403 explainer", () => {
  it.each([
    ["es", "Permiso denegado", "rol IAM"],
    ["en", "Permission denied", "IAM role"],
  ] as const)("document load in %s names the missing role or disabled API", async (lang, head, role) => {
    useSettings.getState().setLanguage(lang);
    useFirestoreNav.setState({ selectedDoc: "fbep_test_x/d" });
    connect(async () => {
      throw forbidden();
    });
    wrap(<DocumentView />);
    const err = await screen.findByTestId("document-error");
    expect(err.getAttribute("data-error-kind")).toBe("forbidden");
    const msg = screen.getByTestId("document-error-message").textContent!;
    expect(msg).toContain(head);
    expect(msg).toContain(role);
    expect(err.textContent).not.toMatch(/\n\s+at /);
  });

  it("a failed save with 403 explains permissions and keeps the draft", async () => {
    connect(async (_url, opts) => {
      if (opts?.method === "PATCH") throw forbidden();
      return { data: doc };
    });
    wrap(<DocumentEditor path="fbep_test_x/d" serverDoc={doc} />);
    const input = screen.getByTestId("row-a").querySelector("input")!;
    fireEvent.change(input, { target: { value: "two" } });
    fireEvent.blur(input);
    fireEvent.click(screen.getByTestId("save-button"));
    const err = await screen.findByTestId("save-error");
    expect(err.textContent).toContain("Permiso denegado");
    expect(err.textContent).not.toContain("The caller does not have permission");
  });

  it("Remote Config load failure with 403 offers a working retry", async () => {
    let denied = true;
    connect(async (url) => {
      if (denied) throw forbidden();
      if (url.includes(":listVersions")) return { data: { versions: [] }, headers: new Headers() };
      return { data: {}, headers: new Headers({ ETag: "e1" }), status: 200 };
    });
    wrap(<RemoteConfigView />);
    const err = await screen.findByTestId("rc-load-error");
    expect(err.getAttribute("data-error-kind")).toBe("forbidden");
    expect(err.textContent).toContain("Permiso denegado");
    denied = false;
    fireEvent.click(screen.getByTestId("rc-retry"));
    await screen.findByTestId("rc-etag");
  });
});

describe("404", () => {
  it("shows a clear 'does not exist' message and a way back to the list", async () => {
    useFirestoreNav.setState({ selectedDoc: "fbep_test_x/gone" });
    connect(async () => {
      throw new ApiError(404, "NOT_FOUND", "Document not found");
    });
    wrap(<DocumentView />);
    const missing = await screen.findByTestId("document-missing");
    expect(missing.textContent).toContain("no existe");
    act(() => useSettings.getState().setLanguage("en"));
    expect(screen.getByTestId("document-missing").textContent).toContain("does not exist");
    fireEvent.click(screen.getByTestId("document-back"));
    await waitFor(() => expect(screen.getByTestId("doc-empty")).toBeTruthy());
    expect(useFirestoreNav.getState().selectedDoc).toBeNull();
  });
});
