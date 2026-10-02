// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import "../../../i18n";
import { ApiError, type FirestoreDocument } from "../../../core";
import { useConnection } from "../../../store/connection";
import { useEditorStore } from "../../../store/documentEditor";
import { useSettings } from "../../../store/settings";
import { DocumentEditor } from "../DocumentEditor";

const NAME = "projects/p/databases/(default)/documents/fbep_test_x/d";
const mk = (fields: FirestoreDocument["fields"], updateTime: string): FirestoreDocument => ({ name: NAME, fields, createTime: "2024-01-01T00:00:00Z", updateTime });

let server: FirestoreDocument;
let writes: { url: URL; body: { fields: Record<string, unknown> } }[];
let failNext: ApiError | null;

const request = async (url: string, opts?: { method?: string; body?: { fields: Record<string, unknown> } }) => {
  if (opts?.method === "PATCH") {
    const u = new URL(url);
    writes.push({ url: u, body: opts.body! });
    if (failNext) {
      const e = failNext;
      failNext = null;
      throw e;
    }
    server = mk({ ...server.fields, ...opts.body!.fields } as never, "2024-02-02T00:00:00Z");
    return { data: server };
  }
  return { data: server };
};

function mount() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <DocumentEditor path="fbep_test_x/d" serverDoc={server} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  server = mk({ a: { stringValue: "one" }, b: { integerValue: "9007199254740993" }, c: { booleanValue: true } }, "2024-01-01T00:00:00Z");
  writes = [];
  failNext = null;
  useEditorStore.setState({ sessions: {}, view: "table", mode: "modified" });
  useConnection.setState({ phase: "connected", connection: { client: { request }, projectId: "p", clientEmail: "x" } as never });
});
afterEach(cleanup);

describe("DocumentEditor", () => {
  it("shows a typed badge per row and keeps int64 exact in the JSON text", () => {
    mount();
    const types = screen.getAllByTestId("type-badge").map((b) => b.getAttribute("data-type"));
    expect(types).toEqual(["string", "integer", "boolean"]);
    expect(useEditorStore.getState().sessions["p/fbep_test_x/d"].text).toContain("9007199254740993");
  });

  it("saves only the edited field with a precise mask and the retained updateTime", async () => {
    mount();
    const input = screen.getByTestId("row-a").querySelector("input")!;
    fireEvent.change(input, { target: { value: "two" } });
    fireEvent.blur(input);
    fireEvent.click(screen.getByTestId("delete-c"));
    fireEvent.click(screen.getByTestId("save-button"));
    await waitFor(() => expect(screen.getByTestId("save-status")).toBeTruthy());
    expect(writes).toHaveLength(1);
    const q = writes[0].url.searchParams;
    expect(q.getAll("updateMask.fieldPaths").sort()).toEqual(["a", "c"]);
    expect(q.get("currentDocument.updateTime")).toBe("2024-01-01T00:00:00Z");
    expect(Object.keys(writes[0].body.fields)).toEqual(["a"]);
    expect(screen.getByTestId("update-time").textContent).toContain("2024-02-02T00:00:00Z");
  });

  it("full mode sends no mask", async () => {
    useEditorStore.setState({ mode: "full" });
    mount();
    const input = screen.getByTestId("row-a").querySelector("input")!;
    fireEvent.change(input, { target: { value: "two" } });
    fireEvent.blur(input);
    fireEvent.click(screen.getByTestId("save-button"));
    await waitFor(() => expect(writes).toHaveLength(1));
    expect(writes[0].url.searchParams.getAll("updateMask.fieldPaths")).toEqual([]);
    expect(Object.keys(writes[0].body.fields)).toEqual(["a", "b", "c"]);
  });

  it("blocks saving invalid JSON without any request", () => {
    mount();
    act(() => useEditorStore.getState().setText("p/fbep_test_x/d", '{"a": '));
    expect((screen.getByTestId("save-button") as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByTestId("draft-error")).toBeTruthy();
    expect(writes).toHaveLength(0);
  });

  it("conflict shows the dialog, keeps edits on cancel, and force re-saves without precondition after confirmation", async () => {
    mount();
    const input = screen.getByTestId("row-a").querySelector("input")!;
    fireEvent.change(input, { target: { value: "mine" } });
    fireEvent.blur(input);
    failNext = new ApiError(409, "ABORTED", "stale");
    fireEvent.click(screen.getByTestId("save-button"));
    await waitFor(() => expect(screen.getByTestId("conflict-dialog")).toBeTruthy());

    fireEvent.click(screen.getByTestId("conflict-cancel"));
    expect(screen.queryByTestId("conflict-dialog")).toBeNull();
    expect((screen.getByTestId("row-a").querySelector("input") as HTMLInputElement).value).toBe("mine");

    failNext = new ApiError(409, "ABORTED", "stale");
    fireEvent.click(screen.getByTestId("save-button"));
    await waitFor(() => expect(screen.getByTestId("conflict-dialog")).toBeTruthy());
    fireEvent.click(screen.getByTestId("conflict-force"));
    expect(writes).toHaveLength(2);
    fireEvent.click(screen.getByTestId("conflict-force-confirm"));
    await waitFor(() => expect(writes).toHaveLength(3));
    expect(writes[2].url.searchParams.get("currentDocument.updateTime")).toBeNull();
    await waitFor(() => expect(screen.getByTestId("save-status")).toBeTruthy());
  });

  it("reload discards local edits and loads the server version", async () => {
    mount();
    const input = screen.getByTestId("row-a").querySelector("input")!;
    fireEvent.change(input, { target: { value: "mine" } });
    fireEvent.blur(input);
    failNext = new ApiError(409, "ABORTED", "stale");
    fireEvent.click(screen.getByTestId("save-button"));
    await waitFor(() => expect(screen.getByTestId("conflict-dialog")).toBeTruthy());
    server = mk({ a: { stringValue: "remote" } }, "2024-03-03T00:00:00Z");
    fireEvent.click(screen.getByTestId("conflict-reload"));
    await waitFor(() => expect((screen.getByTestId("row-a").querySelector("input") as HTMLInputElement).value).toBe("remote"));
    expect(screen.queryByTestId("conflict-dialog")).toBeNull();
  });

  it("a generic save failure keeps the editor content and shows the error", async () => {
    mount();
    const input = screen.getByTestId("row-a").querySelector("input")!;
    fireEvent.change(input, { target: { value: "mine" } });
    fireEvent.blur(input);
    failNext = new ApiError(0, "UNAVAILABLE", "offline");
    fireEvent.click(screen.getByTestId("save-button"));
    await waitFor(() => expect(screen.getByTestId("save-error")).toBeTruthy());
    expect((screen.getByTestId("row-a").querySelector("input") as HTMLInputElement).value).toBe("mine");
    expect((screen.getByTestId("save-button") as HTMLButtonElement).disabled).toBe(false);
  });

  it("adds a nested field and keeps unsaved changes when the language changes", async () => {
    mount();
    fireEvent.change(screen.getByTestId("add-field-name"), { target: { value: "m" } });
    fireEvent.change(screen.getByTestId("add-field-type"), { target: { value: "map" } });
    fireEvent.click(screen.getByTestId("add-field-button"));
    fireEvent.click(screen.getByTestId("toggle-m"));
    fireEvent.change(screen.getByTestId("add-m-name"), { target: { value: "k" } });
    fireEvent.click(screen.getByTestId("add-m-button"));
    expect(screen.getByTestId("row-m.k")).toBeTruthy();
    const other = useSettings.getState().language === "es" ? "en" : "es";
    await act(async () => useSettings.getState().setLanguage(other));
    expect(screen.getByTestId("row-m.k")).toBeTruthy();
    expect(screen.getByTestId("dirty-indicator")).toBeTruthy();
    fireEvent.click(screen.getByTestId("save-button"));
    await waitFor(() => expect(screen.getByTestId("save-status")).toBeTruthy());
    expect(writes[0].url.searchParams.getAll("updateMask.fieldPaths")).toEqual(["m"]);
  });

  it("renders the JSON view with the same data and format/repair buttons", () => {
    useEditorStore.setState({ view: "json" });
    mount();
    expect(screen.getByTestId("json-view")).toBeTruthy();
    expect(screen.getByTestId("json-format")).toBeTruthy();
    expect(screen.getByTestId("json-repair")).toBeTruthy();
  });
});
