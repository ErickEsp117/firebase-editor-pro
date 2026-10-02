// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import "../../../i18n";
import { ApiError } from "../../../core";
import { useConnection } from "../../../store/connection";
import { useCrudDialog } from "../../../store/crudDialog";
import { useFirestoreNav } from "../../../store/firestoreNav";
import { FirestoreBrowser } from "../FirestoreBrowser";

const ROOT = "projects/p/databases/(default)/documents";
const doc = (path: string) => ({
  name: `${ROOT}/${path}`,
  fields: { n: { stringValue: path } },
  createTime: "2024-01-01T00:00:00Z",
  updateTime: "2024-01-01T00:00:00Z",
});

interface Req {
  method: string;
  path: string;
  body?: unknown;
}
let reqs: Req[] = [];
let store: Record<string, ReturnType<typeof doc>> = {};

const request = async (url: string, opts?: { method?: string; body?: unknown }) => {
  const method = opts?.method ?? "GET";
  const u = new URL(url);
  const path = decodeURIComponent(u.pathname).replace(/^.*\/documents/, "");
  reqs.push({ method, path, body: opts?.body });
  if (path === ":listCollectionIds") {
    return { data: { collectionIds: [...new Set(Object.keys(store).map((k) => k.split("/")[0]))] } };
  }
  if (path.endsWith(":listCollectionIds")) return { data: {} };
  if (method === "POST") {
    const id = u.searchParams.get("documentId")!;
    const full = `${path.slice(1)}/${id}`;
    if (store[full]) throw new ApiError(409, "ALREADY_EXISTS", "exists");
    store[full] = doc(full);
    return { data: store[full] };
  }
  if (method === "DELETE") {
    delete store[path.slice(1)];
    return { data: {} };
  }
  const coll = path.slice(1);
  if (!coll.includes("/")) {
    return { data: { documents: Object.entries(store).filter(([k]) => k.startsWith(`${coll}/`)).map(([, v]) => v) } };
  }
  if (store[coll]) return { data: store[coll] };
  throw new ApiError(404, "NOT_FOUND", "nf");
};

function mount() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <FirestoreBrowser />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  reqs = [];
  store = { "fbep_a/one": doc("fbep_a/one"), "fbep_a/two": doc("fbep_a/two") };
  useFirestoreNav.getState().reset();
  useCrudDialog.getState().close();
  useConnection.setState({ phase: "connected", connection: { client: { request }, projectId: "p", clientEmail: "x" } as never });
});
afterEach(cleanup);

describe("Firestore create/delete", () => {
  it("creates a document with an explicit id in a new collection, then shows it in the tree", async () => {
    mount();
    await screen.findByTestId("collection:fbep_a");
    fireEvent.click(screen.getByTestId("new-collection"));
    fireEvent.change(screen.getByTestId("create-collection-id"), { target: { value: "fbep_b" } });
    fireEvent.change(screen.getByTestId("create-doc-id"), { target: { value: "primer" } });
    fireEvent.change(screen.getByTestId("create-doc-json"), { target: { value: '{"a": 1}' } });
    fireEvent.click(screen.getByTestId("create-doc-submit"));
    await screen.findByTestId("doc-node:fbep_b/primer");
    expect(reqs.find((r) => r.method === "POST" && !r.path.endsWith(":listCollectionIds"))?.path).toBe("/fbep_b");
    expect(screen.queryByTestId("create-doc-dialog")).toBeNull();
    expect(useFirestoreNav.getState().selectedDoc).toBe("fbep_b/primer");
  });

  it("reports ALREADY_EXISTS clearly and keeps the dialog open", async () => {
    mount();
    await screen.findByTestId("collection:fbep_a");
    fireEvent.click(screen.getByTestId("collection-add:fbep_a"));
    fireEvent.change(screen.getByTestId("create-doc-id"), { target: { value: "one" } });
    fireEvent.click(screen.getByTestId("create-doc-submit"));
    const err = await screen.findByTestId("create-doc-error");
    expect(err.textContent).toContain("fbep_a/one");
    expect(screen.getByTestId("create-doc-dialog")).toBeTruthy();
    expect(reqs.filter((r) => r.method !== "GET" && r.method !== "POST")).toHaveLength(0);
  });

  it("uses an auto id when the id is empty and blocks invalid JSON", async () => {
    mount();
    await screen.findByTestId("collection:fbep_a");
    fireEvent.click(screen.getByTestId("collection-add:fbep_a"));
    fireEvent.change(screen.getByTestId("create-doc-json"), { target: { value: "{oops" } });
    expect((screen.getByTestId("create-doc-submit") as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByTestId("create-doc-json"), { target: { value: "{}" } });
    fireEvent.click(screen.getByTestId("create-doc-submit"));
    await waitFor(() => expect(Object.keys(store)).toHaveLength(3));
    expect(Object.keys(store).some((k) => /^fbep_a\/[A-Za-z0-9]{20}$/.test(k))).toBe(true);
  });

  it("qualifies relative references when creating a document", async () => {
    mount();
    await screen.findByTestId("collection:fbep_a");
    fireEvent.click(screen.getByTestId("collection-add:fbep_a"));
    fireEvent.change(screen.getByTestId("create-doc-id"), { target: { value: "withref" } });
    fireEvent.change(screen.getByTestId("create-doc-json"), { target: { value: '{"r": {"__type__": "reference", "__value__": "fbep_a/one"}}' } });
    fireEvent.click(screen.getByTestId("create-doc-submit"));
    await waitFor(() => expect(reqs.some((r) => r.method === "POST" && !r.path.endsWith(":listCollectionIds"))).toBe(true));
    const post = reqs.find((r) => r.method === "POST" && !r.path.endsWith(":listCollectionIds"))!;
    expect((post.body as { fields: unknown }).fields).toEqual({ r: { referenceValue: `${ROOT}/fbep_a/one` } });
  });

  it("qualifies a relative 'projects/team' reference when creating a document", async () => {
    mount();
    await screen.findByTestId("collection:fbep_a");
    fireEvent.click(screen.getByTestId("collection-add:fbep_a"));
    fireEvent.change(screen.getByTestId("create-doc-id"), { target: { value: "withproj" } });
    fireEvent.change(screen.getByTestId("create-doc-json"), { target: { value: '{"r": {"__type__": "reference", "__value__": "projects/team"}}' } });
    fireEvent.click(screen.getByTestId("create-doc-submit"));
    await waitFor(() => expect(reqs.some((r) => r.method === "POST" && !r.path.endsWith(":listCollectionIds"))).toBe(true));
    const post = reqs.find((r) => r.method === "POST" && !r.path.endsWith(":listCollectionIds"))!;
    expect((post.body as { fields: unknown }).fields).toEqual({ r: { referenceValue: `${ROOT}/projects/team` } });
  });

  it("deletes a document only after confirming with its path", async () => {
    mount();
    fireEvent.click(await screen.findByTestId("collection:fbep_a"));
    fireEvent.click(await screen.findByTestId("doc:fbep_a/one"));
    fireEvent.click(await screen.findByTestId("delete-document"));
    expect(screen.getByTestId("delete-doc-body").textContent).toContain("fbep_a/one");
    expect(reqs.some((r) => r.method === "DELETE")).toBe(false);
    fireEvent.click(screen.getByTestId("delete-confirm"));
    await waitFor(() => expect(screen.queryByTestId("doc-node:fbep_a/one")).toBeNull());
    expect(store["fbep_a/one"]).toBeUndefined();
    expect(useFirestoreNav.getState().selectedDoc).toBeNull();
  });

  it("deletes every document of a collection after showing the count", async () => {
    mount();
    await screen.findByTestId("collection:fbep_a");
    fireEvent.click(screen.getByTestId("collection-delete:fbep_a"));
    await waitFor(() => expect(screen.getByTestId("delete-coll-body").textContent).toContain("2"));
    fireEvent.click(screen.getByTestId("delete-confirm"));
    await waitFor(() => expect(screen.queryByTestId("collection:fbep_a")).toBeNull());
    expect(Object.keys(store)).toHaveLength(0);
  });

  it("cancel leaves everything untouched", async () => {
    mount();
    await screen.findByTestId("collection:fbep_a");
    fireEvent.click(screen.getByTestId("collection-delete:fbep_a"));
    await screen.findByTestId("delete-coll-body");
    fireEvent.click(screen.getByTestId("delete-cancel"));
    expect(screen.queryByTestId("delete-collection-dialog")).toBeNull();
    expect(reqs.some((r) => r.method === "DELETE")).toBe(false);
  });
});
