// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import "../../../i18n";
import { ApiError } from "../../../core";
import { useConnection } from "../../../store/connection";
import { useEditorStore } from "../../../store/documentEditor";
import { useFirestoreNav } from "../../../store/firestoreNav";
import { DocumentView } from "../DocumentView";

const cached = {
  name: "projects/p/databases/(default)/documents/fbep_test_x/d",
  fields: { a: { stringValue: "one" } },
  createTime: "2024-01-01T00:00:00Z",
  updateTime: "2024-01-01T00:00:00Z",
};

beforeEach(() => {
  useEditorStore.setState({ sessions: {} });
  useFirestoreNav.getState().reset();
  useFirestoreNav.setState({ selectedDoc: "fbep_test_x/d" });
  const request = async () => {
    throw new ApiError(404, "NOT_FOUND", "gone");
  };
  useConnection.setState({ phase: "connected", connection: { client: { request }, projectId: "p", clientEmail: "x" } as never });
});
afterEach(cleanup);

describe("DocumentView", () => {
  it("does not mount the editor when the query errored, even with cached data", async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    qc.setQueryData(["fs", "p", "doc", "fbep_test_x/d"], cached);
    render(
      <QueryClientProvider client={qc}>
        <DocumentView />
      </QueryClientProvider>,
    );
    await qc.invalidateQueries({ queryKey: ["fs", "p", "doc"] });
    await waitFor(() => expect(screen.getByTestId("document-missing")).toBeTruthy());
    expect(qc.getQueryData(["fs", "p", "doc", "fbep_test_x/d"])).toBeTruthy();
    expect(screen.queryByTestId("document-editor")).toBeNull();
    expect(screen.queryByTestId("save-button")).toBeNull();
  });
});
