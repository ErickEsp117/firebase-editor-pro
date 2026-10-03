// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import "../../../i18n";
import { ApiError } from "../../../core";
import { useConnection } from "../../../store/connection";
import { useRcEditor } from "../../../store/rcEditor";
import { useSettings } from "../../../store/settings";
import { RemoteConfigView } from "../RemoteConfigView";

Range.prototype.getClientRects ??= () => [] as unknown as DOMRectList;
Range.prototype.getBoundingClientRect ??= () => new DOMRect();

const GOOGLE_TEXT = "Invalid template: parameter 'p' references a condition that is not defined";
const PARSER_TEXT = /Unexpected end of JSON input|Expected|Unexpected token/;

const request = async (url: string, opts: { method?: string } = {}) => {
  const ok = (data: unknown) => ({ status: 200, data, text: "{}", headers: new Headers({ ETag: "etag-1" }) });
  if (url.includes(":listVersions")) return ok({ versions: [] });
  if (opts.method === "PUT") throw new ApiError(400, "INVALID_ARGUMENT", GOOGLE_TEXT);
  return ok({ version: { versionNumber: "1" } });
};

function mount() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <RemoteConfigView />
    </QueryClientProvider>,
  );
}

const setText = (text: string) => act(() => useRcEditor.getState().setText(text));
const VALID = JSON.stringify({ parameters: { p: { defaultValue: { value: "x" } } } });

beforeEach(() => {
  useRcEditor.getState().reset();
  useConnection.setState({ phase: "connected", connection: { client: { request }, projectId: "p", clientEmail: "x" } as never });
});
afterEach(cleanup);

describe.each([
  ["es", "rechazó la plantilla", "no es válido", "Detalles técnicos"],
  ["en", "rejected the template", "not valid", "Technical details"],
] as const)("raw service and parser text stays out of the main message (%s)", (lang, rejected, invalid, label) => {
  beforeEach(() => useSettings.getState().setLanguage(lang));

  it("a validate_only rejection shows a localized message; Google's text lives in the technical details", async () => {
    mount();
    await screen.findByTestId("rc-etag");
    setText(VALID);
    fireEvent.click(screen.getByTestId("rc-validate"));
    const alert = await screen.findByTestId("rc-validation-error");
    const main = screen.getByTestId("rc-validation-error-message").textContent!;
    expect(main).toContain(rejected);
    expect(main).not.toContain(GOOGLE_TEXT);
    const tech = screen.getByTestId("rc-validation-error-technical");
    expect(tech.textContent).toContain(GOOGLE_TEXT);
    expect(tech.textContent).toContain("INVALID_ARGUMENT");
    expect(alert.textContent).toContain(label);
  });

  it("a publish rejection shows a localized message in the dialog; Google's text lives in the technical details", async () => {
    mount();
    await screen.findByTestId("rc-etag");
    setText(VALID);
    fireEvent.click(screen.getByTestId("rc-publish"));
    fireEvent.click(screen.getByTestId("rc-publish-confirm"));
    await screen.findByTestId("rc-publish-error");
    const main = screen.getByTestId("rc-publish-error-message").textContent!;
    expect(main).toContain(rejected);
    expect(main).not.toContain(GOOGLE_TEXT);
    expect(screen.getByTestId("rc-publish-error-technical").textContent).toContain(GOOGLE_TEXT);
  });

  it("malformed JSON reports a localized problem without the parser exception (draft and validation)", async () => {
    mount();
    await screen.findByTestId("rc-etag");
    setText('{"parameters": ');
    const draft = screen.getByTestId("rc-draft-error");
    expect(draft.querySelector("li")!.textContent).toContain(invalid);
    expect(draft.querySelector("li")!.textContent).not.toMatch(PARSER_TEXT);
    const draftTech = screen.getByTestId("rc-draft-error-technical");
    expect(draftTech.textContent).toMatch(PARSER_TEXT);

    fireEvent.click(screen.getByTestId("rc-validate"));
    const validation = await screen.findByTestId("rc-validation-error");
    expect(validation.querySelector("li")!.textContent).toContain(invalid);
    expect(validation.querySelector("li")!.textContent).not.toMatch(PARSER_TEXT);
    expect(screen.getByTestId("rc-validation-error-technical").textContent).toMatch(PARSER_TEXT);
  });
});

describe("language switch", () => {
  it("re-renders a visible server rejection and a visible dialog error in the new language", async () => {
    useSettings.getState().setLanguage("es");
    mount();
    await screen.findByTestId("rc-etag");
    setText(VALID);
    fireEvent.click(screen.getByTestId("rc-publish"));
    fireEvent.click(screen.getByTestId("rc-publish-confirm"));
    await screen.findByTestId("rc-publish-error");
    expect(screen.getByTestId("rc-publish-error-message").textContent).toContain("rechazó la plantilla");
    act(() => useSettings.getState().setLanguage("en"));
    expect(screen.getByTestId("rc-publish-error-message").textContent).toContain("rejected the template");
  });
});
