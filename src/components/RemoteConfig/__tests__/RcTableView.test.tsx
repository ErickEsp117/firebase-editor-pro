// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import "../../../i18n";
import { useConnection } from "../../../store/connection";
import { hasPendingInputs } from "../../../store/pendingInputs";
import { useRcEditor } from "../../../store/rcEditor";
import { useSettings } from "../../../store/settings";
import { RemoteConfigView } from "../RemoteConfigView";

Range.prototype.getClientRects ??= () => [] as unknown as DOMRectList;
Range.prototype.getBoundingClientRect ??= () => new DOMRect();

const TEMPLATE = {
  conditions: [
    { name: "ios", expression: "device.os == 'ios'", tagColor: "BLUE" },
    { name: "beta", expression: "percent <= 10" },
  ],
  parameters: {
    welcome: { defaultValue: { value: "hi" }, conditionalValues: { ios: { value: "hey" } }, valueType: "STRING", description: "Greeting" },
    flag: { defaultValue: { useInAppDefault: true }, valueType: "BOOLEAN" },
    promo: { defaultValue: { personalizationValue: { personalizationId: "p1" } }, valueType: "STRING" },
  },
  parameterGroups: { checkout: { parameters: { price: { defaultValue: { value: "9.5" }, valueType: "NUMBER" } } } },
  version: { versionNumber: "3" },
};

let puts: number;
let served: Record<string, unknown>;
const request = async (url: string, opts: { method?: string } = {}) => {
  if ((opts.method ?? "GET") === "PUT") puts += 1;
  const ok = (data: unknown) => ({ status: 200, data, text: JSON.stringify(data), headers: new Headers({ ETag: "etag-3" }) });
  if (url.includes(":listVersions")) return ok({ versions: [] });
  return ok(served);
};

function mount() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}><RemoteConfigView /></QueryClientProvider>);
}
const draft = () => JSON.parse(useRcEditor.getState().session!.text) as typeof TEMPLATE & Record<string, unknown>;
const commit = (el: HTMLElement, value: string) => {
  fireEvent.change(el, { target: { value } });
  fireEvent.blur(el);
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

describe("Remote Config table view", () => {
  it("shows parameters (with groups and conditional values) and the ordered conditions", async () => {
    mount();
    await screen.findByTestId("rc-table-view");
    expect(screen.getByTestId("rc-view-table").getAttribute("aria-selected")).toBe("true");
    expect(screen.getByTestId("rc-param:welcome")).toBeTruthy();
    expect(screen.getByTestId("rc-param:checkout/price").textContent).toContain("Grupo: checkout");
    expect(screen.getByTestId("rc-param-cond-row:welcome:ios")).toBeTruthy();
    expect((screen.getByTestId("rc-param-default:welcome") as HTMLInputElement).value).toBe("hi");
    expect((screen.getByTestId("rc-param-default:flag-mode") as HTMLSelectElement).value).toBe("inAppDefault");
    expect(screen.getByTestId("rc-param-default:promo-special")).toBeTruthy();
    expect(screen.getByTestId("rc-condition:ios").textContent).toContain("1");
    expect((screen.getByTestId("rc-cond-delete:ios") as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByTestId("rc-cond-delete:beta") as HTMLButtonElement).disabled).toBe(false);
  });

  it("edits values, types and descriptions into the same draft the JSON view and publish use", async () => {
    mount();
    await screen.findByTestId("rc-table-view");
    commit(screen.getByTestId("rc-param-default:welcome"), "hola");
    commit(screen.getByTestId("rc-param-cond:welcome:ios"), "hey ios");
    commit(screen.getByTestId("rc-param-desc:welcome"), "Saludo");
    fireEvent.change(screen.getByTestId("rc-param-default:flag-mode"), { target: { value: "value" } });
    fireEvent.change(screen.getByTestId("rc-param-default:flag"), { target: { value: "true" } });
    commit(screen.getByTestId("rc-param-default:checkout/price"), "12");
    const d = draft();
    expect(d.parameters.welcome).toMatchObject({ defaultValue: { value: "hola" }, conditionalValues: { ios: { value: "hey ios" } }, description: "Saludo" });
    expect(d.parameters.flag.defaultValue).toEqual({ value: "true" });
    expect(d.parameterGroups.checkout.parameters.price.defaultValue).toEqual({ value: "12" });
    expect(d.parameters.promo).toEqual(TEMPLATE.parameters.promo);
    expect(screen.getByTestId("rc-dirty")).toBeTruthy();
    expect(puts).toBe(0);
  });

  it("rejects a value that does not fit the parameter type", async () => {
    mount();
    await screen.findByTestId("rc-table-view");
    const price = screen.getByTestId("rc-param-default:checkout/price");
    commit(price, "doce");
    expect(price.getAttribute("aria-invalid")).toBe("true");
    expect(draft().parameterGroups.checkout.parameters.price.defaultValue).toEqual({ value: "9.5" });
  });

  it("adds and removes parameters and conditional values", async () => {
    mount();
    await screen.findByTestId("rc-table-view");
    fireEvent.change(screen.getByTestId("rc-add-param-name"), { target: { value: "welcome" } });
    expect((screen.getByTestId("rc-add-param-button") as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText("Ya existe un parámetro con ese nombre.")).toBeTruthy();
    fireEvent.change(screen.getByTestId("rc-add-param-name"), { target: { value: "fbep_test_limit" } });
    fireEvent.change(screen.getByTestId("rc-add-param-type"), { target: { value: "NUMBER" } });
    fireEvent.change(screen.getByTestId("rc-add-param-value"), { target: { value: "5" } });
    fireEvent.click(screen.getByTestId("rc-add-param-button"));
    expect(draft().parameters).toHaveProperty("fbep_test_limit", { defaultValue: { value: "5" }, valueType: "NUMBER" });
    fireEvent.change(screen.getByTestId("rc-param-add-cond:fbep_test_limit"), { target: { value: "beta" } });
    expect((draft().parameters as Record<string, { conditionalValues?: object }>).fbep_test_limit.conditionalValues).toBeUndefined();
    fireEvent.click(screen.getByTestId("rc-param-add-cond-button:fbep_test_limit"));
    expect((draft().parameters as Record<string, { conditionalValues?: object }>).fbep_test_limit.conditionalValues).toEqual({ beta: { value: "5" } });
    fireEvent.click(screen.getByTestId("rc-param-cond-remove:fbep_test_limit:beta"));
    expect(draft().parameters).toHaveProperty("fbep_test_limit", { defaultValue: { value: "5" }, valueType: "NUMBER" });
    fireEvent.click(screen.getByTestId("rc-param-delete:fbep_test_limit"));
    expect(draft().parameters).not.toHaveProperty("fbep_test_limit");
    await waitFor(() => expect(screen.queryByTestId("rc-dirty")).toBeNull());
  });

  it("edits, reorders, adds and deletes conditions", async () => {
    mount();
    await screen.findByTestId("rc-table-view");
    commit(screen.getByTestId("rc-cond-expr:beta"), "percent <= 20");
    fireEvent.change(screen.getByTestId("rc-cond-color:beta"), { target: { value: "GREEN" } });
    fireEvent.click(screen.getByTestId("rc-cond-up:beta"));
    expect(draft().conditions.map((c) => c.name)).toEqual(["beta", "ios"]);
    expect(draft().conditions[0]).toEqual({ name: "beta", expression: "percent <= 20", tagColor: "GREEN" });
    fireEvent.change(screen.getByTestId("rc-add-cond-name"), { target: { value: "android" } });
    fireEvent.change(screen.getByTestId("rc-add-cond-expression"), { target: { value: "device.os == 'android'" } });
    fireEvent.click(screen.getByTestId("rc-add-cond-button"));
    expect(draft().conditions.map((c) => c.name)).toEqual(["beta", "ios", "android"]);
    fireEvent.click(screen.getByTestId("rc-cond-delete:android"));
    fireEvent.click(screen.getByTestId("rc-cond-delete:beta"));
    expect(draft().conditions.map((c) => c.name)).toEqual(["ios"]);
  });

  it("switches between JSON and table, remembers the choice, and needs valid JSON for the table", async () => {
    mount();
    await screen.findByTestId("rc-table-view");
    fireEvent.click(screen.getByTestId("rc-view-json"));
    expect(screen.getByTestId("rc-editor")).toBeTruthy();
    expect(JSON.parse(localStorage.getItem("fbep:settings")!).rcView).toBe("json");
    act(() => useRcEditor.getState().setText("{ not json"));
    fireEvent.click(screen.getByTestId("rc-view-table"));
    expect(screen.getByTestId("rc-table-unavailable")).toBeTruthy();
    expect(JSON.parse(localStorage.getItem("fbep:settings")!).rcView).toBe("table");
  });

  it("leaves an untouched multi-line value exactly as it was after focusing and leaving it", async () => {
    served = { parameters: { msg: { defaultValue: { value: "Line one\nLine two" }, description: "a\nb" } }, version: { versionNumber: "3" } };
    mount();
    await screen.findByTestId("rc-table-view");
    const cell = screen.getByTestId("rc-param-default:msg");
    expect(cell.tagName).toBe("TEXTAREA");
    fireEvent.focus(cell);
    fireEvent.blur(cell);
    fireEvent.blur(screen.getByTestId("rc-param-desc:msg"));
    expect((draft().parameters as Record<string, { defaultValue: object }>).msg.defaultValue).toEqual({ value: "Line one\nLine two" });
    expect(screen.queryByTestId("rc-dirty")).toBeNull();
  });

  it("counts an uncommitted cell as unpublished, only for Remote Config, and drops it on reload", async () => {
    mount();
    await screen.findByTestId("rc-table-view");
    fireEvent.change(screen.getByTestId("rc-param-default:checkout/price"), { target: { value: "12a" } });
    expect(screen.getByTestId("rc-dirty")).toBeTruthy();
    expect(hasPendingInputs("rc")).toBe(true);
    expect(hasPendingInputs("firestore")).toBe(false);
    fireEvent.click(screen.getByTestId("rc-reload"));
    fireEvent.click(await screen.findByTestId("rc-reload-dialog-confirm"));
    await waitFor(() => expect((screen.getByTestId("rc-param-default:checkout/price") as HTMLInputElement).value).toBe("9.5"));
    expect(hasPendingInputs("rc")).toBe(false);
  });

  it("adding and then deleting the only parameter of an empty template leaves no change", async () => {
    served = { version: { versionNumber: "3" } };
    mount();
    await screen.findByTestId("rc-table-no-params");
    fireEvent.change(screen.getByTestId("rc-add-param-name"), { target: { value: "fbep_test_tmp" } });
    fireEvent.click(screen.getByTestId("rc-add-param-button"));
    expect(screen.getByTestId("rc-dirty")).toBeTruthy();
    fireEvent.click(screen.getByTestId("rc-param-delete:fbep_test_tmp"));
    await waitFor(() => expect(screen.queryByTestId("rc-dirty")).toBeNull());
  });
});
