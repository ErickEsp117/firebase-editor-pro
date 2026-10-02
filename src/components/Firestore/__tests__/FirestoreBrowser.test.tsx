// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import "../../../i18n";
import { ApiError } from "../../../core";
import { useConnection } from "../../../store/connection";
import { useFirestoreNav } from "../../../store/firestoreNav";
import { FirestoreBrowser } from "../FirestoreBrowser";

const ROOT = "projects/p/databases/(default)/documents";
const doc = (path: string, fields = true) => ({
  name: `${ROOT}/${path}`,
  ...(fields ? { fields: { n: { stringValue: path } }, createTime: "2024-01-01T00:00:00Z", updateTime: "2024-01-01T00:00:00Z" } : {}),
});

let calls: string[] = [];
let extraDocs: ReturnType<typeof doc>[] = [];

const request = async (url: string, opts?: { method?: string; body?: { pageToken?: string } }) => {
  calls.push(url);
  const u = decodeURIComponent(url);
  const path = u.slice(u.indexOf("/documents") + "/documents".length);
  if (path === ":listCollectionIds") return { data: { collectionIds: ["items", "tiny"] } };
  if (path === "/items/parent:listCollectionIds") return { data: { collectionIds: ["sub"] } };
  if (path.endsWith(":listCollectionIds")) return { data: {} };
  if (path.startsWith("/items?")) {
    const token = new URL(url).searchParams.get("pageToken");
    expect(new URL(url).searchParams.get("showMissing")).toBe("true");
    expect(new URL(url).searchParams.get("pageSize")).toBe("25");
    const all = [...Array.from({ length: 30 }, (_, i) => doc(`items/d${String(i).padStart(2, "0")}`)), doc("items/ghost", false), ...extraDocs];
    return token ? { data: { documents: all.slice(25) } } : { data: { documents: all.slice(0, 25), nextPageToken: "t1" } };
  }
  if (path.startsWith("/tiny?")) return { data: { documents: [doc("tiny/a")] } };
  if (path === "/items/sub-missing") throw new ApiError(404, "NOT_FOUND", "nf");
  if (path === "/items/ghost") throw new ApiError(404, "NOT_FOUND", "nf");
  if (path === "/items/parent/sub") throw new ApiError(404, "NOT_FOUND", "nf");
  if (path.startsWith("/items/parent/sub?")) return { data: { documents: [doc("items/parent/sub/s1")] } };
  if (path.startsWith("/items/")) return { data: doc(path.slice(1)) };
  void opts;
  throw new ApiError(500, "INTERNAL", `unexpected ${url}`);
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
  calls = [];
  extraDocs = [];
  useFirestoreNav.getState().reset();
  useConnection.setState({
    phase: "connected",
    connection: { client: { request }, projectId: "p", clientEmail: "x" } as never,
  });
});
afterEach(cleanup);

describe("FirestoreBrowser", () => {
  it("lists root collections and only lists documents once expanded", async () => {
    mount();
    await screen.findByTestId("collection:items");
    expect(screen.getByTestId("collection:tiny")).toBeTruthy();
    expect(calls.some((c) => c.includes("/items?"))).toBe(false);
    fireEvent.click(screen.getByTestId("collection:items"));
    await screen.findByTestId("doc:items/d00");
    expect(calls.some((c) => c.includes("/items?"))).toBe(true);
    expect(calls.some((c) => c.includes("/tiny?"))).toBe(false);
  });

  it("paginates with load more without duplicates", async () => {
    mount();
    fireEvent.click(await screen.findByTestId("collection:items"));
    await screen.findByTestId("doc:items/d00");
    expect(screen.getByTestId("docs:items").children.length).toBe(25);
    fireEvent.click(screen.getByTestId("load-more:items"));
    await waitFor(() => expect(screen.getByTestId("docs:items").children.length).toBe(31));
    expect(screen.queryByTestId("load-more:items")).toBeNull();
    const ids = [...screen.getByTestId("docs:items").querySelectorAll("[data-testid^='doc:']")].map((e) => e.getAttribute("data-testid"));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("marks missing documents and loads subcollections lazily on doc expand", async () => {
    mount();
    fireEvent.click(await screen.findByTestId("collection:items"));
    await screen.findByTestId("doc:items/d00");
    fireEvent.click(screen.getByTestId("load-more:items"));
    await screen.findByTestId("doc:items/ghost");
    expect(screen.getByTestId("missing-badge:items/ghost")).toBeTruthy();
    expect(screen.queryByTestId("missing-badge:items/d00")).toBeNull();
    expect(calls.some((c) => c.includes("/items/d00:listCollectionIds"))).toBe(false);
  });

  it("expands a document into its subcollections and opens a subdocument", async () => {
    extraDocs = [doc("items/parent")];
    mount();
    fireEvent.click(await screen.findByTestId("collection:items"));
    fireEvent.click(await screen.findByTestId("load-more:items"));
    fireEvent.click(await screen.findByTestId("doc-toggle:items/parent"));
    fireEvent.click(await screen.findByTestId("collection:items/parent/sub"));
    fireEvent.click(await screen.findByTestId("doc:items/parent/sub/s1"));
    expect(await screen.findByTestId("document-editor")).toBeTruthy();
    expect(screen.getByTestId("document-path").textContent).toBe("items/parent/sub/s1");
  });

  it("opens a document and shows its fields", async () => {
    mount();
    fireEvent.click(await screen.findByTestId("collection:items"));
    fireEvent.click(await screen.findByTestId("doc:items/d03"));
    const row = await screen.findByTestId("row-n");
    expect((row.querySelector("input") as HTMLInputElement).value).toBe("items/d03");
  });

  it("shows a clear message when selecting a missing document", async () => {
    mount();
    fireEvent.click(await screen.findByTestId("collection:items"));
    fireEvent.click(await screen.findByTestId("load-more:items"));
    fireEvent.click(await screen.findByTestId("doc:items/ghost"));
    expect(await screen.findByTestId("document-missing")).toBeTruthy();
  });

  it("refresh re-fetches queries and shows new documents", async () => {
    mount();
    fireEvent.click(await screen.findByTestId("collection:tiny"));
    await screen.findByTestId("doc:tiny/a");
    const before = calls.filter((c) => c.includes("/tiny?")).length;
    fireEvent.click(screen.getByTestId("refresh"));
    await waitFor(() => expect(calls.filter((c) => c.includes("/tiny?")).length).toBe(before + 1));
  });

  it("shows an error with retry when listing fails", async () => {
    useConnection.setState({
      connection: {
        client: { request: async () => { throw new ApiError(403, "PERMISSION_DENIED", "denied"); } },
        projectId: "p",
        clientEmail: "x",
      } as never,
    });
    mount();
    const err = await screen.findByTestId("collections-error");
    expect(err.textContent).toContain("denied");
  });
});
