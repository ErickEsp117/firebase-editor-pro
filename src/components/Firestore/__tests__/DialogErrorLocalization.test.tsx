// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import i18n from "../../../i18n";
import { ApiError } from "../../../core";
import { PlatformFileError } from "../../../platform/errors";
import { setPlatformForTests } from "../../../platform";
import { useConnection } from "../../../store/connection";
import { CreateDocDialog } from "../crud/CreateDocDialog";
import { DeleteCollectionDialog } from "../crud/DeleteCollectionDialog";
import { DeleteDocDialog } from "../crud/DeleteDocDialog";
import { ExportDialog } from "../crud/ExportDialog";
import { ImportDialog } from "../crud/ImportDialog";

const ROOT = "projects/p/databases/(default)/documents";
const RAW = "Missing or insufficient permissions for the raw service call.";
const request = vi.fn();
const pickImportFile = vi.fn();
const saveTextFile = vi.fn();

const forbidden = () => new ApiError(403, "PERMISSION_DENIED", RAW);
const tIn = (lng: "es" | "en") => i18n.getFixedT(lng);

function mountWith(node: React.ReactNode) {
  render(<QueryClientProvider client={new QueryClient()}>{node}</QueryClientProvider>);
}

async function switchTo(lng: "es" | "en") {
  await act(async () => {
    await i18n.changeLanguage(lng);
  });
}

/** Mounts in Spanish, returns the main message element, switches to English and checks it follows the language. */
async function expectFollowsLanguage(testId: string, es: string, en: string) {
  const main = await screen.findByTestId(testId);
  expect(main.textContent).toContain(es);
  expect(main.textContent).not.toContain(RAW);
  await switchTo("en");
  const after = screen.getByTestId(testId);
  expect(after.textContent).toContain(en);
  expect(after.textContent).not.toContain(es);
  expect(after.textContent).not.toContain(RAW);
  const details = screen.getByTestId(`${testId}-technical`);
  expect(details.textContent).toContain(RAW);
  expect(details.textContent).toContain(i18n.t("errors.technicalDetails"));
  await switchTo("es");
  expect(screen.getByTestId(testId).textContent).toContain(es);
  expect(screen.getByTestId(`${testId}-technical`).textContent).toContain(i18n.t("errors.technicalDetails"));
}

beforeEach(async () => {
  request.mockReset();
  pickImportFile.mockReset();
  saveTextFile.mockReset();
  await i18n.changeLanguage("es");
  setPlatformForTests({ mode: "browser", saveTextFile, pickImportFile } as never);
  useConnection.setState({ phase: "connected", connection: { client: { request }, projectId: "p", clientEmail: "x" } as never });
});
afterEach(() => {
  cleanup();
  setPlatformForTests(undefined);
});

describe("dialog errors are stored as data and translated at render time", () => {
  it("CreateDocDialog follows the language and keeps the raw text in technical details", async () => {
    request.mockRejectedValue(forbidden());
    mountWith(<CreateDocDialog parentDocPath="" collectionPath="fbep_x" />);
    fireEvent.change(screen.getByTestId("create-doc-id"), { target: { value: "one" } });
    fireEvent.click(screen.getByTestId("create-doc-submit"));
    const es = tIn("es")("errors.api.forbidden");
    await expectFollowsLanguage("create-doc-error", es, tIn("en")("errors.api.forbidden"));
  });

  it("CreateDocDialog ALREADY_EXISTS message follows the language", async () => {
    const rawExists = "Document already exists: projects/p/databases/(default)/documents/fbep_x/one";
    request.mockRejectedValue(new ApiError(409, "ALREADY_EXISTS", rawExists));
    mountWith(<CreateDocDialog parentDocPath="" collectionPath="fbep_x" />);
    fireEvent.change(screen.getByTestId("create-doc-id"), { target: { value: "one" } });
    fireEvent.click(screen.getByTestId("create-doc-submit"));
    expect((await screen.findByTestId("create-doc-error")).textContent).toBe(tIn("es")("crud.alreadyExists", { path: "fbep_x/one" }));
    const details = screen.getByTestId("create-doc-error-technical");
    expect(details.textContent).toContain(rawExists);
    expect(details.textContent).toContain("ALREADY_EXISTS");
    await switchTo("en");
    expect(screen.getByTestId("create-doc-error").textContent).toBe(tIn("en")("crud.alreadyExists", { path: "fbep_x/one" }));
    expect(screen.getByTestId("create-doc-error-technical").textContent).toContain(rawExists);
  });

  it("DeleteDocDialog follows the language and keeps the raw text in technical details", async () => {
    request.mockRejectedValue(forbidden());
    mountWith(<DeleteDocDialog path="fbep_x/one" />);
    fireEvent.click(screen.getByTestId("delete-confirm"));
    await expectFollowsLanguage("delete-error", tIn("es")("errors.api.forbidden"), tIn("en")("errors.api.forbidden"));
  });

  it("DeleteCollectionDialog follows the language and keeps the raw text in technical details", async () => {
    request.mockImplementation(async (url: string, opts?: { method?: string }) => {
      if (opts?.method === "DELETE") throw forbidden();
      if (url.includes(":listCollectionIds")) return { data: {} };
      return { data: { documents: [{ name: `${ROOT}/fbep_x/one`, fields: {} }] } };
    });
    mountWith(<DeleteCollectionDialog path="fbep_x" />);
    const confirm = await screen.findByTestId("delete-coll-body").then(() => screen.getByTestId("delete-confirm"));
    fireEvent.click(confirm);
    await expectFollowsLanguage("delete-error", tIn("es")("errors.api.forbidden"), tIn("en")("errors.api.forbidden"));
  });

  it("ImportDialog write failure follows the language and keeps the raw text in technical details", async () => {
    request.mockRejectedValue(forbidden());
    mountWith(<ImportDialog scope="doc" path="fbep_x/d" />);
    fireEvent.change(screen.getByTestId("import-json"), { target: { value: '{"a":1}' } });
    fireEvent.click(screen.getByTestId("import-submit"));
    await expectFollowsLanguage("import-error", tIn("es")("errors.api.forbidden"), tIn("en")("errors.api.forbidden"));
  });

  it.each([
    ["empty payload", () => undefined, "io.empty"],
    ["unreadable file", () => pickImportFile.mockRejectedValue(new PlatformFileError("file_read_failed")), "io.fileError"],
  ])("ImportDialog %s message follows the language", async (_name, arrange, key) => {
    arrange();
    mountWith(<ImportDialog scope="doc" path="fbep_x/d" />);
    fireEvent.click(screen.getByTestId(key === "io.empty" ? "import-submit" : "import-choose-file"));
    const main = await screen.findByTestId("import-error");
    const fileMsg = (lng: "es" | "en") => (key === "io.empty" ? tIn(lng)("io.empty") : tIn(lng)("io.fileError", { message: tIn(lng)("io.fileErrors.file_read_failed") }));
    expect(main.textContent).toBe(fileMsg("es"));
    await switchTo("en");
    expect(screen.getByTestId("import-error").textContent).toBe(fileMsg("en"));
  });

  it("ImportDialog validation failure follows the language", async () => {
    mountWith(<ImportDialog scope="doc" path="c/d" />);
    fireEvent.change(screen.getByTestId("import-json"), { target: { value: '{"a":1,"__collections__":{"s":{"e":{}}}}' } });
    fireEvent.click(screen.getByTestId("import-submit"));
    const es = (await screen.findByTestId("import-error")).textContent;
    expect(es).toContain("No se escribió nada");
    await switchTo("en");
    expect(screen.getByTestId("import-error").textContent).toContain("Nothing was written");
  });

  it.each([
    ["document", "doc" as const, "c/d"],
    ["collection", "collection" as const, "c"],
  ])("ImportDialog malformed %s JSON keeps the parser text in technical details and the main message localized", async (_n, scope, path) => {
    mountWith(<ImportDialog scope={scope} path={path} />);
    fireEvent.change(screen.getByTestId("import-json"), { target: { value: '{"a":' } });
    fireEvent.click(screen.getByTestId("import-submit"));
    const main = await screen.findByTestId("import-error");
    const parserText = (screen.getByTestId("import-error-technical").textContent ?? "").replace(i18n.t("errors.technicalDetails"), "").trim();
    expect(parserText.length).toBeGreaterThan(0);
    expect(main.textContent).toContain(tIn("es")("codec.errors.invalidJson", { path: "" }));
    expect(main.textContent).not.toContain(parserText);
    await switchTo("en");
    const after = screen.getByTestId("import-error").textContent ?? "";
    expect(after).toContain(tIn("en")("codec.errors.invalidJson", { path: "" }));
    expect(after).not.toContain(parserText);
    expect(screen.getByTestId("import-error-technical").textContent).toContain(parserText);
  });

  it("ExportDialog follows the language", async () => {
    saveTextFile.mockRejectedValue(new PlatformFileError("file_write_failed"));
    request.mockResolvedValue({ data: { name: `${ROOT}/c/d`, fields: {} } });
    mountWith(<ExportDialog scope="doc" path="c/d" />);
    expect((await screen.findByTestId("export-error")).textContent).toContain("carpeta de destino");
    await switchTo("en");
    const en = screen.getByTestId("export-error").textContent ?? "";
    expect(en).toContain("Could not export");
    expect(en).not.toContain("carpeta de destino");
  });

  it("ExportDialog API failure keeps the raw text in technical details", async () => {
    request.mockRejectedValue(forbidden());
    mountWith(<ExportDialog scope="doc" path="c/d" />);
    await expectFollowsLanguage("export-error", tIn("es")("errors.api.forbidden"), tIn("en")("errors.api.forbidden"));
  });
});
