// @vitest-environment jsdom
import { EditorView } from "@codemirror/view";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import "../../../i18n";
import { useConnection } from "../../../store/connection";
import { useRcEditor } from "../../../store/rcEditor";
import { useSettings } from "../../../store/settings";
import { prettyJson } from "../RcValueField";
import { RemoteConfigView } from "../RemoteConfigView";

Range.prototype.getClientRects ??= () => [] as unknown as DOMRectList;
Range.prototype.getBoundingClientRect ??= () => new DOMRect();

const LONG_JSON = '{"filters":{"filtersLegacy":["interes","zonas","amenidades"],"enabled":true}}';
const TEMPLATE = {
  conditions: [
    { name: "ios", expression: "device.os == 'ios'", tagColor: "BLUE" },
    { name: "beta", expression: "app.version.>=(['2.9.151']) && app.version.<(['2.9.156'])" },
  ],
  parameters: {
    welcome: { defaultValue: { value: "Hola\nmundo" }, conditionalValues: { ios: { value: "hey" } }, valueType: "STRING", description: "Saludo inicial" },
    config: { defaultValue: { value: "" }, conditionalValues: { beta: { value: LONG_JSON } }, valueType: "JSON" },
    flag: { defaultValue: { useInAppDefault: true }, valueType: "BOOLEAN", futureField: 7 },
  },
  version: { versionNumber: "3" },
};

let puts: number;
let served: Record<string, unknown>;
const request = async (url: string, opts: { method?: string } = {}) => {
  if ((opts.method ?? "GET") === "PUT") puts += 1;
  const ok = (data: unknown) => ({ status: 200, data, text: JSON.stringify(data), headers: new Headers({ ETag: "etag-3" }) });
  if (url.includes(":listVersions")) return ok({ versions: [{ versionNumber: "3", updateTime: "2026-01-01T00:00:00Z", updateOrigin: "CONSOLE" }] });
  return ok(served);
};

function mount() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}><RemoteConfigView /></QueryClientProvider>);
}
type Draft = typeof TEMPLATE & { parameters: Record<string, Record<string, unknown>> };
const draft = () => JSON.parse(useRcEditor.getState().session!.text) as Draft;
const setCodeMirror = (container: HTMLElement, text: string) => {
  const view = EditorView.findFromDOM(container.querySelector(".cm-editor") as HTMLElement)!;
  act(() => view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text } }));
};

beforeEach(() => {
  puts = 0;
  served = TEMPLATE;
  useSettings.getState().setLanguage("es");
  useSettings.getState().setRcView("table");
  useRcEditor.getState().reset();
  useConnection.setState({ phase: "connected", connection: { client: { request }, projectId: "p", clientEmail: "x" } as never });
});
afterEach(() => {
  cleanup();
  useSettings.getState().setRcView("json");
});

describe("Remote Config visual editor", () => {
  it("shows every parameter as a readable card with full values and condition chips", async () => {
    mount();
    await screen.findByTestId("rc-table-view");
    expect(screen.getByTestId("rc-view-table").textContent).toBe("Visual");
    expect(screen.getByTestId("rc-tab-parameters").textContent).toBe("Parámetros (3)");
    expect(screen.getByTestId("rc-param:welcome").textContent).toContain("Saludo inicial");
    expect(screen.getByTestId("rc-param-default-preview:welcome").textContent).toBe("Hola\nmundo");
    expect(screen.getByTestId("rc-param-cond-preview:config:beta").textContent).toBe(LONG_JSON);
    expect(screen.getByTestId("rc-param-default-preview:config").textContent).toBe("(vacío)");
    expect(screen.getByTestId("rc-param-default-preview:flag").textContent).toBe("Valor de la app");
  });

  it("edits a parameter in a dialog: Cancel changes nothing, Apply writes everything at once", async () => {
    mount();
    await screen.findByTestId("rc-table-view");
    const before = useRcEditor.getState().session!.text;
    fireEvent.click(screen.getByTestId("rc-param-open:welcome"));
    const textarea = screen.getByTestId("rc-param-default") as HTMLTextAreaElement;
    expect(textarea.value).toBe("Hola\nmundo");
    fireEvent.change(textarea, { target: { value: "Hola\nde nuevo" } });
    fireEvent.click(screen.getByTestId("rc-param-cancel"));
    expect(useRcEditor.getState().session!.text).toBe(before);

    fireEvent.click(screen.getByTestId("rc-param-open:welcome"));
    fireEvent.change(screen.getByTestId("rc-param-default"), { target: { value: "Hola\nde nuevo" } });
    fireEvent.change(screen.getByTestId("rc-param-cond:ios"), { target: { value: "hey ios" } });
    fireEvent.change(screen.getByTestId("rc-param-description"), { target: { value: "Saludo" } });
    fireEvent.change(screen.getByTestId("rc-param-add-cond"), { target: { value: "beta" } });
    fireEvent.click(screen.getByTestId("rc-param-add-cond-button"));
    fireEvent.click(screen.getByTestId("rc-param-apply"));
    expect(screen.queryByTestId("rc-param-dialog")).toBeNull();
    expect(draft().parameters.welcome).toEqual({
      defaultValue: { value: "Hola\nde nuevo" },
      conditionalValues: { ios: { value: "hey ios" }, beta: { value: "Hola\nde nuevo" } },
      valueType: "STRING",
      description: "Saludo",
    });
    expect(screen.getByTestId("rc-dirty")).toBeTruthy();
    expect(puts).toBe(0);
  });

  it("edits JSON values in a validating editor and keeps unknown fields", async () => {
    mount();
    await screen.findByTestId("rc-table-view");
    fireEvent.click(screen.getByTestId("rc-param-open:config"));
    const dialog = screen.getByTestId("rc-param-dialog");
    setCodeMirror(screen.getByTestId("rc-param-cond:beta"), "{ broken");
    expect(screen.getByTestId("rc-param-cond:beta-invalid")).toBeTruthy();
    expect((screen.getByTestId("rc-param-apply") as HTMLButtonElement).disabled).toBe(true);
    setCodeMirror(screen.getByTestId("rc-param-cond:beta"), '{"a":1}');
    fireEvent.click(screen.getByTestId("rc-param-cond:beta-format"));
    expect(dialog.contains(screen.getByTestId("rc-param-apply"))).toBe(true);
    fireEvent.click(screen.getByTestId("rc-param-apply"));
    expect(draft().parameters.config.conditionalValues).toEqual({ beta: { value: '{\n  "a": 1\n}' } });

    fireEvent.click(screen.getByTestId("rc-param-open:flag"));
    fireEvent.click(screen.getByTestId("rc-param-default-mode-value"));
    fireEvent.click(screen.getByTestId("rc-param-default-true"));
    fireEvent.click(screen.getByTestId("rc-param-apply"));
    expect(draft().parameters.flag).toEqual({ defaultValue: { value: "true" }, valueType: "BOOLEAN", futureField: 7 });
  });

  it("shows JSON formatted for reading without changing the stored text", async () => {
    mount();
    await screen.findByTestId("rc-table-view");
    const before = useRcEditor.getState().session!.text;
    fireEvent.click(screen.getByTestId("rc-param-open:config"));
    const shown = screen.getByTestId("rc-param-cond:beta").querySelector(".cm-content")!.textContent!;
    expect(shown).toContain('"filtersLegacy": [');
    expect(screen.queryByTestId("rc-param-default-invalid")).toBeNull();
    fireEvent.click(screen.getByTestId("rc-param-apply"));
    expect(useRcEditor.getState().session!.text).toBe(before);
    expect(screen.queryByTestId("rc-dirty")).toBeNull();
  });

  it("formats JSON by re-indenting only, so numbers and escapes keep their exact text", () => {
    for (const text of [LONG_JSON, '{"a":[],"b":{},"c":[1,{"d":null}],"e":"x{,}[:]\\"y"}', "[ ]", '"solo"', "12"]) {
      expect(prettyJson(text)).toBe(JSON.stringify(JSON.parse(text), null, 2));
    }
    expect(prettyJson('{"id":9007199254740993,"r":1.50,"u":"\\u00e9"}')).toBe('{\n  "id": 9007199254740993,\n  "r": 1.50,\n  "u": "\\u00e9"\n}');
    expect(prettyJson("")).toBeNull();
    expect(prettyJson("{ broken")).toBeNull();
  });

  it("keeps text and number edits exactly as typed, even when they read as the same JSON", async () => {
    served = { parameters: { min_version: { defaultValue: { value: "2.10" }, valueType: "STRING" }, limit: { defaultValue: { value: "1.0" }, valueType: "NUMBER" } } };
    mount();
    await screen.findByTestId("rc-table-view");
    fireEvent.click(screen.getByTestId("rc-param-open:min_version"));
    fireEvent.change(screen.getByTestId("rc-param-default"), { target: { value: "2.1" } });
    fireEvent.click(screen.getByTestId("rc-param-apply"));
    fireEvent.click(screen.getByTestId("rc-param-open:limit"));
    fireEvent.change(screen.getByTestId("rc-param-default"), { target: { value: "1" } });
    fireEvent.click(screen.getByTestId("rc-param-apply"));
    expect(draft().parameters.min_version.defaultValue).toEqual({ value: "2.1" });
    expect(draft().parameters.limit.defaultValue).toEqual({ value: "1" });
  });

  it("lets Tab leave the JSON editor inside the dialog", async () => {
    mount();
    await screen.findByTestId("rc-table-view");
    fireEvent.click(screen.getByTestId("rc-param-open:config"));
    const content = screen.getByTestId("rc-param-cond:beta").querySelector(".cm-content") as HTMLElement;
    const before = content.textContent;
    content.focus();
    const tab = new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true });
    content.dispatchEvent(tab);
    expect(tab.defaultPrevented).toBe(false);
    expect(content.textContent).toBe(before);
  });

  it("creates, renames and deletes parameters with validation", async () => {
    mount();
    await screen.findByTestId("rc-table-view");
    fireEvent.click(screen.getByTestId("rc-param-new"));
    fireEvent.change(screen.getByTestId("rc-param-key"), { target: { value: "welcome" } });
    expect(screen.getByText("Ya existe un parámetro con ese nombre.")).toBeTruthy();
    fireEvent.change(screen.getByTestId("rc-param-key"), { target: { value: "9 bad" } });
    expect((screen.getByTestId("rc-param-apply") as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByTestId("rc-param-key"), { target: { value: "fbep_test_limit" } });
    fireEvent.change(screen.getByTestId("rc-param-type"), { target: { value: "NUMBER" } });
    fireEvent.change(screen.getByTestId("rc-param-default"), { target: { value: "5" } });
    fireEvent.click(screen.getByTestId("rc-param-apply"));
    expect(draft().parameters.fbep_test_limit).toEqual({ defaultValue: { value: "5" }, valueType: "NUMBER" });

    fireEvent.click(screen.getByTestId("rc-param-open:fbep_test_limit"));
    fireEvent.change(screen.getByTestId("rc-param-key"), { target: { value: "fbep_test_max" } });
    fireEvent.click(screen.getByTestId("rc-param-apply"));
    expect(Object.keys(draft().parameters)).toEqual(["welcome", "config", "flag", "fbep_test_max"]);

    fireEvent.click(screen.getByTestId("rc-param-open:fbep_test_max"));
    fireEvent.click(screen.getByTestId("rc-param-delete"));
    expect(draft().parameters).not.toHaveProperty("fbep_test_max");
    await waitFor(() => expect(screen.queryByTestId("rc-dirty")).toBeNull());
  });

  it("filters parameters by name, description or value", async () => {
    mount();
    await screen.findByTestId("rc-table-view");
    fireEvent.change(screen.getByTestId("rc-param-search"), { target: { value: "amenidades" } });
    expect(screen.getByTestId("rc-param:config")).toBeTruthy();
    expect(screen.queryByTestId("rc-param:welcome")).toBeNull();
    fireEvent.change(screen.getByTestId("rc-param-search"), { target: { value: "saludo" } });
    expect(screen.getByTestId("rc-param:welcome")).toBeTruthy();
  });

  it("shows conditions in full, reorders them, and edits or renames them everywhere", async () => {
    mount();
    await screen.findByTestId("rc-table-view");
    fireEvent.click(screen.getByTestId("rc-tab-conditions"));
    expect(screen.getByTestId("rc-cond-expr:beta").textContent).toBe(TEMPLATE.conditions[1].expression);
    expect(screen.getByTestId("rc-condition:ios").textContent).toContain("usada por 1 parámetro");
    fireEvent.click(screen.getByTestId("rc-cond-up:beta"));
    expect(draft().conditions.map((c) => c.name)).toEqual(["beta", "ios"]);

    fireEvent.click(screen.getByTestId("rc-cond-edit:ios"));
    expect((screen.getByTestId("rc-cond-delete") as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByTestId("rc-cond-name"), { target: { value: "apple" } });
    fireEvent.change(screen.getByTestId("rc-cond-expression"), { target: { value: "device.os == 'ios' && app.version.>=(['3.0'])" } });
    fireEvent.click(screen.getByTestId("rc-cond-color:GREEN"));
    fireEvent.click(screen.getByTestId("rc-cond-apply"));
    expect(draft().conditions[1]).toEqual({ name: "apple", expression: "device.os == 'ios' && app.version.>=(['3.0'])", tagColor: "GREEN" });
    expect(draft().parameters.welcome.conditionalValues).toEqual({ apple: { value: "hey" } });

    fireEvent.click(screen.getByTestId("rc-cond-new"));
    fireEvent.change(screen.getByTestId("rc-cond-name"), { target: { value: "android" } });
    fireEvent.change(screen.getByTestId("rc-cond-expression"), { target: { value: "device.os == 'android'" } });
    fireEvent.click(screen.getByTestId("rc-cond-apply"));
    expect(draft().conditions.map((c) => c.name)).toEqual(["beta", "apple", "android"]);
    fireEvent.click(screen.getByTestId("rc-cond-edit:android"));
    fireEvent.click(screen.getByTestId("rc-cond-delete"));
    expect(draft().conditions.map((c) => c.name)).toEqual(["beta", "apple"]);
  });

  it("does not rename a condition onto a name that parameters already reference", async () => {
    served = { ...TEMPLATE, parameters: { ...TEMPLATE.parameters, legacy: { defaultValue: { value: "a" }, conditionalValues: { ios: { value: "b" }, old_ios: { value: "c" } } } } };
    mount();
    await screen.findByTestId("rc-table-view");
    fireEvent.click(screen.getByTestId("rc-tab-conditions"));
    fireEvent.click(screen.getByTestId("rc-cond-edit:ios"));
    fireEvent.change(screen.getByTestId("rc-cond-name"), { target: { value: "old_ios" } });
    expect((screen.getByTestId("rc-cond-apply") as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByTestId("rc-cond-cancel"));
    // Creating the missing condition is how the dangling reference gets fixed, so that stays allowed.
    fireEvent.click(screen.getByTestId("rc-cond-new"));
    fireEvent.change(screen.getByTestId("rc-cond-name"), { target: { value: "old_ios" } });
    fireEvent.change(screen.getByTestId("rc-cond-expression"), { target: { value: "true" } });
    expect((screen.getByTestId("rc-cond-apply") as HTMLButtonElement).disabled).toBe(false);
  });

  it("keeps the version history in its own tab", async () => {
    mount();
    await screen.findByTestId("rc-table-view");
    expect(screen.queryByTestId("rc-versions")).toBeNull();
    fireEvent.click(screen.getByTestId("rc-tab-versions"));
    expect(await screen.findByTestId("rc-versions")).toBeTruthy();
  });

  it("needs valid JSON and remembers the chosen view", async () => {
    mount();
    await screen.findByTestId("rc-table-view");
    fireEvent.click(screen.getByTestId("rc-view-json"));
    expect(screen.getByTestId("rc-editor")).toBeTruthy();
    expect(JSON.parse(localStorage.getItem("fbep:settings")!).rcView).toBe("json");
    act(() => useRcEditor.getState().setText("{ not json"));
    fireEvent.click(screen.getByTestId("rc-view-table"));
    expect(screen.getByTestId("rc-table-unavailable")).toBeTruthy();
  });
});
