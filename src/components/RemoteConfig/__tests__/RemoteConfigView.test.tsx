// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "../../../i18n";
import { ApiError } from "../../../core";
import { setPlatformForTests } from "../../../platform";
import { useConnection } from "../../../store/connection";
import { useRcEditor } from "../../../store/rcEditor";
import { useSettings } from "../../../store/settings";
import { RemoteConfigView } from "../RemoteConfigView";

// jsdom lacks the layout APIs CodeMirror measures with
Range.prototype.getClientRects ??= () => [] as unknown as DOMRectList;
Range.prototype.getBoundingClientRect ??= () => new DOMRect();

type Tpl = Record<string, unknown>;
interface Call {
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: Tpl;
}

let server: { template: Tpl; etag: string; n: number };
let calls: Call[];
let versions: Record<string, unknown>[];
const saveTextFile = vi.fn();

const withVersion = (t: Tpl, n: number, description?: string): Tpl => ({ ...t, version: { versionNumber: String(n), description } });

function bump(template: Tpl, description?: string) {
  server.n += 1;
  server.etag = `etag-${server.n}`;
  server.template = withVersion(template, server.n, description);
  versions.unshift({ versionNumber: String(server.n), updateTime: "2026-01-01T00:00:00Z", updateOrigin: "REST_API", description });
}

const res = (data: unknown, etag = server.etag) => ({ status: 200, data, text: JSON.stringify(data), headers: new Headers({ ETag: etag }) });

const request = async (url: string, opts: { method?: string; headers?: Record<string, string>; body?: Tpl } = {}) => {
  const method = opts.method ?? "GET";
  calls.push({ url, method, headers: opts.headers ?? {}, body: opts.body });
  if (url.includes(":listVersions")) return res({ versions: [...versions] });
  if (url.includes(":downloadDefaults")) return res({ fbep_test_param: "test" });
  if (url.includes(":rollback")) {
    bump({ parameters: {} }, "Rollback");
    return res(server.template);
  }
  if (method === "PUT") {
    if (url.includes("validate_only=true")) {
      const params = (opts.body?.parameters ?? {}) as Record<string, { conditionalValues?: Record<string, unknown> }>;
      if (JSON.stringify(params).includes('"bad_cond"')) throw new ApiError(400, "INVALID_ARGUMENT", "unknown condition");
      return res({}, "etag-validated-0");
    }
    const ifMatch = opts.headers?.["If-Match"];
    if (ifMatch !== "*" && ifMatch !== server.etag) throw new ApiError(412, "FAILED_PRECONDITION", "VERSION_MISMATCH");
    const { version, ...rest } = opts.body!;
    bump(rest, (version as { description: string }).description);
    return res(server.template);
  }
  return res(server.template);
};

function mount() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <RemoteConfigView />
    </QueryClientProvider>,
  );
}

const edit = (template: Tpl) => act(() => useRcEditor.getState().setText(JSON.stringify(template, null, 2)));
const publishCalls = () => calls.filter((c) => c.method === "PUT" && !c.url.includes("validate_only"));

beforeEach(() => {
  server = { template: withVersion({}, 5, "initial"), etag: "etag-5", n: 5 };
  calls = [];
  versions = [{ versionNumber: "5", updateTime: "2026-01-01T00:00:00Z", updateOrigin: "CONSOLE", description: "initial" }];
  saveTextFile.mockReset().mockResolvedValue(true);
  setPlatformForTests({ mode: "browser", saveTextFile } as never);
  useRcEditor.getState().reset();
  useSettings.getState().setLanguage("en");
  useConnection.setState({ phase: "connected", connection: { client: { request }, projectId: "p", clientEmail: "x" } as never });
});
afterEach(() => {
  cleanup();
  setPlatformForTests(undefined);
});

describe("RemoteConfigView", () => {
  it("loads an empty template without error and shows the ETag and version", async () => {
    mount();
    expect((await screen.findByTestId("rc-etag")).textContent).toBe("ETag: etag-5");
    expect(screen.getByTestId("rc-version").textContent).toBe("Version 5");
    expect(screen.getByTestId("rc-counts").textContent).toContain("0 parameters");
    expect(screen.getByTestId("rc-empty-hint")).toBeTruthy();
    expect(screen.queryByTestId("rc-load-error")).toBeNull();
    expect(screen.queryByTestId("rc-draft-error")).toBeNull();
  });

  it("lists versions with number, date, origin and description", async () => {
    mount();
    const row = await screen.findByTestId("rc-version-5");
    expect(row.textContent).toContain("Console");
    expect(row.textContent).toContain("initial");
    expect((screen.getByTestId("rc-rollback-5") as HTMLButtonElement).disabled).toBe(true);
  });

  it("validates without writing and shows the result", async () => {
    mount();
    await screen.findByTestId("rc-etag");
    edit({ parameters: { fbep_test_param: { defaultValue: { value: "test" }, valueType: "STRING" } } });
    fireEvent.click(screen.getByTestId("rc-validate"));
    await screen.findByTestId("rc-validation-ok");
    const put = calls.find((c) => c.method === "PUT")!;
    expect(put.url).toContain("validate_only=true");
    expect(put.headers["If-Match"]).toBe("etag-5");
    expect(publishCalls()).toHaveLength(0);
  });

  it("reports a condition that does not exist and blocks publishing", async () => {
    mount();
    await screen.findByTestId("rc-etag");
    edit({ parameters: { p: { conditionalValues: { ghost: { value: "x" } } } } });
    fireEvent.click(screen.getByTestId("rc-validate"));
    const msg = await screen.findByTestId("rc-validation-error");
    expect(msg.textContent).toContain('"ghost"');
    expect((screen.getByTestId("rc-publish") as HTMLButtonElement).disabled).toBe(true);
    expect(calls.filter((c) => c.method === "PUT")).toHaveLength(0);
  });

  it("reports malformed JSON and blocks publishing", async () => {
    mount();
    await screen.findByTestId("rc-etag");
    act(() => useRcEditor.getState().setText('{"parameters": '));
    expect(screen.getByTestId("rc-draft-error").textContent).toContain("not valid");
    expect((screen.getByTestId("rc-publish") as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByTestId("rc-validate"));
    await screen.findByTestId("rc-validation-error");
    expect(calls.filter((c) => c.method === "PUT")).toHaveLength(0);
  });

  it("surfaces a server-side template rejection and does not publish", async () => {
    mount();
    await screen.findByTestId("rc-etag");
    edit({ parameters: { p: { note: "bad_cond" } } });
    fireEvent.click(screen.getByTestId("rc-publish"));
    fireEvent.click(screen.getByTestId("rc-publish-confirm"));
    const err = await screen.findByTestId("rc-publish-error");
    expect(err.textContent).toContain("unknown condition");
    expect(screen.queryByTestId("rc-conflict-dialog")).toBeNull();
    expect(publishCalls()).toHaveLength(0);
  });

  it("publishes with If-Match, version.description and every unknown key preserved", async () => {
    mount();
    await screen.findByTestId("rc-etag");
    const tpl = {
      futureKey: { nested: [1, 2] },
      conditions: [{ name: "fbep_test_cond", expression: "device.os == 'ios'" }],
      parameters: { fbep_test_param: { defaultValue: { value: "test" }, valueType: "STRING", conditionalValues: { fbep_test_cond: { value: "ios" } } } },
      version: { versionNumber: "5", description: "stale metadata" },
    };
    edit(tpl);
    fireEvent.click(screen.getByTestId("rc-publish"));
    fireEvent.change(screen.getByTestId("rc-description"), { target: { value: "validacion fbep" } });
    fireEvent.click(screen.getByTestId("rc-publish-confirm"));
    await waitFor(() => expect(screen.queryByTestId("rc-publish-dialog")).toBeNull());

    const [put] = publishCalls();
    expect(put.headers["If-Match"]).toBe("etag-5");
    expect(put.body).toEqual({ ...tpl, version: { description: "validacion fbep" } });
    expect(screen.getByTestId("rc-notice").textContent).toContain("Published. Current version: 6");
    expect(screen.getByTestId("rc-etag").textContent).toBe("ETag: etag-6");
    expect((await screen.findByTestId("rc-version-6")).textContent).toContain("validacion fbep");
    expect(screen.queryByTestId("rc-dirty")).toBeNull();
    expect(screen.getByTestId("rc-counts").textContent).toBe("1 parameter · 1 condition");

    edit({ ...tpl, parameters: {} });
    fireEvent.click(screen.getByTestId("rc-publish"));
    expect((screen.getByTestId("rc-description") as HTMLTextAreaElement).value).toBe("");
  });

  it("stale ETag opens the conflict dialog and never writes; Reload re-applies the edit onto the fresh template", async () => {
    mount();
    await screen.findByTestId("rc-etag");
    edit({ parameters: { fbep_test_mine: { defaultValue: { value: "m" } } } });
    bump({ parameters: { fbep_test_external: { defaultValue: { value: "e" } } } }, "external");

    fireEvent.click(screen.getByTestId("rc-publish"));
    fireEvent.click(screen.getByTestId("rc-publish-confirm"));
    const dialog = await screen.findByTestId("rc-conflict-dialog");
    expect(within(dialog).getByTestId("rc-conflict-reload")).toBeTruthy();
    expect(within(dialog).getByTestId("rc-conflict-force")).toBeTruthy();
    expect(server.template.parameters).toEqual({ fbep_test_external: { defaultValue: { value: "e" } } });

    fireEvent.click(within(dialog).getByTestId("rc-conflict-reload"));
    await waitFor(() => expect(screen.queryByTestId("rc-conflict-dialog")).toBeNull());
    expect(screen.getByTestId("rc-etag").textContent).toBe("ETag: etag-6");
    const text = useRcEditor.getState().session!.text;
    expect(Object.keys(JSON.parse(text).parameters).sort()).toEqual(["fbep_test_external", "fbep_test_mine"]);
    expect(screen.getByTestId("rc-notice").getAttribute("data-kind")).toBe("reapplied");
    expect(screen.getByTestId("rc-dirty")).toBeTruthy();
  });

  it("force needs an explicit second confirmation and then sends If-Match *", async () => {
    mount();
    await screen.findByTestId("rc-etag");
    edit({ parameters: { fbep_test_mine: {} } });
    bump({ parameters: { fbep_test_external: {} } });

    fireEvent.click(screen.getByTestId("rc-publish"));
    fireEvent.click(screen.getByTestId("rc-publish-confirm"));
    await screen.findByTestId("rc-conflict-dialog");
    fireEvent.click(screen.getByTestId("rc-conflict-force"));
    expect(screen.getByTestId("rc-force-warning")).toBeTruthy();
    expect(publishCalls().filter((c) => c.headers["If-Match"] === "*")).toHaveLength(0);

    fireEvent.click(screen.getByTestId("rc-conflict-force-confirm"));
    await waitFor(() => expect(screen.queryByTestId("rc-conflict-dialog")).toBeNull());
    expect(publishCalls().at(-1)!.headers["If-Match"]).toBe("*");
    expect(Object.keys(server.template.parameters as object)).toEqual(["fbep_test_mine"]);
  });

  it("rollback asks for confirmation, then restores the version and refreshes the editor", async () => {
    versions.push({ versionNumber: "4", updateTime: "2025-12-31T00:00:00Z", updateOrigin: "CONSOLE", description: "older" });
    mount();
    fireEvent.click(await screen.findByTestId("rc-rollback-4"));
    expect(calls.some((c) => c.url.includes(":rollback"))).toBe(false);
    expect(screen.getByTestId("rc-rollback-dialog").textContent).toContain("version 4");
    fireEvent.click(screen.getByTestId("rc-rollback-dialog-confirm"));
    await waitFor(() => expect(screen.getByTestId("rc-notice").textContent).toContain("Rolled back. Current version: 6"));
    const rb = calls.find((c) => c.url.includes(":rollback"))!;
    expect(rb.body).toEqual({ versionNumber: "4" });
    expect(screen.getByTestId("rc-version").textContent).toBe("Version 6");
  });

  it("downloads the defaults as JSON through the platform", async () => {
    mount();
    fireEvent.click(await screen.findByTestId("rc-defaults"));
    await waitFor(() => expect(saveTextFile).toHaveBeenCalled());
    const [name, text] = saveTextFile.mock.calls[0];
    expect(name).toBe("remote-config-defaults.json");
    expect(JSON.parse(text)).toEqual({ fbep_test_param: "test" });
    await screen.findByTestId("rc-notice");
  });

  it("resumes an existing draft for the same project instead of downloading over it", async () => {
    useRcEditor.getState().open({ projectId: "p", etag: "etag-5", baseText: "{}", text: '{"parameters":{"fbep_test_keep":{}}}' });
    mount();
    await screen.findByTestId("rc-dirty");
    expect(useRcEditor.getState().session!.text).toContain("fbep_test_keep");
  });
});
