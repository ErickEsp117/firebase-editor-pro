// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "../../../i18n";
import { setPlatformForTests } from "../../../platform";
import { useConnection } from "../../../store/connection";
import { ExportDialog } from "../crud/ExportDialog";
import { ImportDialog } from "../crud/ImportDialog";

const ROOT = "projects/p/databases/(default)/documents";
const saveTextFile = vi.fn();
const request = vi.fn();

function mountWith(node: React.ReactNode) {
  render(<QueryClientProvider client={new QueryClient()}>{node}</QueryClientProvider>);
}

beforeEach(() => {
  saveTextFile.mockReset().mockResolvedValue(true);
  request.mockReset();
  setPlatformForTests({ mode: "browser", saveTextFile, pickImportFile: vi.fn() } as never);
  useConnection.setState({ phase: "connected", connection: { client: { request }, projectId: "p", clientEmail: "x" } as never });
});
afterEach(() => {
  cleanup();
  setPlatformForTests(undefined);
});

describe("import dialog", () => {
  it("writes nothing and shows a clear error for broken JSON", async () => {
    mountWith(<ImportDialog scope="doc" path="fbep_x/d" />);
    fireEvent.change(screen.getByTestId("import-json"), { target: { value: "{broken" } });
    fireEvent.click(screen.getByTestId("import-submit"));
    expect((await screen.findByTestId("import-error")).textContent).toContain("Nothing was written");
    expect(request).not.toHaveBeenCalled();
  });

  it("validates the whole payload before the first write", async () => {
    mountWith(<ImportDialog scope="collection" path="fbep_x" />);
    fireEvent.change(screen.getByTestId("import-json"), { target: { value: '{"ok":{"a":1},"bad":{"a":{"__type__":"wat"}}}' } });
    fireEvent.click(screen.getByTestId("import-submit"));
    await screen.findByTestId("import-error");
    expect(request).not.toHaveBeenCalled();
  });

  it("imports documents and subcollections with PATCH and no mask", async () => {
    request.mockResolvedValue({ data: {} });
    mountWith(<ImportDialog scope="collection" path="fbep_x" />);
    fireEvent.change(screen.getByTestId("import-json"), {
      target: { value: '{"d1":{"n":9007199254740993,"__collections__":{"s":{"e":{"ok":true}}}}}' },
    });
    fireEvent.click(screen.getByTestId("import-submit"));
    expect((await screen.findByTestId("import-done")).textContent).toContain("2 documents");
    const calls = request.mock.calls.map(([url, o]) => [new URL(url).pathname, o.method, o.body]);
    expect(calls[0]).toEqual([`/v1/${ROOT}/fbep_x/d1`, "PATCH", { fields: { n: { integerValue: "9007199254740993" } } }]);
    expect(calls[1][0]).toContain("/fbep_x/d1/s/e");
    expect(String(request.mock.calls[0][0])).not.toContain("updateMask");
  });
});

describe("export dialog", () => {
  it("saves the tagged JSON of a document under {id}.json", async () => {
    request.mockResolvedValue({ data: { name: `${ROOT}/c/d`, fields: { t: { timestampValue: "2026-01-02T03:04:05Z" } } } });
    mountWith(<ExportDialog scope="doc" path="c/d" />);
    await waitFor(() => expect(saveTextFile).toHaveBeenCalled());
    const [name, text] = saveTextFile.mock.calls[0];
    expect(name).toBe("d.json");
    expect(JSON.parse(text)).toEqual({ t: { __type__: "timestamp", __value__: "2026-01-02T03:04:05Z" } });
    expect((await screen.findByTestId("export-done")).textContent).toContain("d.json");
  });

  it("reports a cancelled save", async () => {
    saveTextFile.mockResolvedValue(false);
    request.mockResolvedValue({ data: { name: `${ROOT}/c/d`, fields: {} } });
    mountWith(<ExportDialog scope="doc" path="c/d" />);
    await screen.findByTestId("export-cancelled");
  });
});
