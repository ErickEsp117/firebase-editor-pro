// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const picked = vi.hoisted(() => ({ file: null as { name: string; contents: string } | null }));
vi.mock("../../platform", () => ({
  getPlatform: () => ({
    mode: "browser",
    signJwtRsa: async () => "a.b.c",
    secureStore: { get: async () => null, set: async () => undefined, delete: async () => undefined },
    pickJsonFile: async () => picked.file,
  }),
}));

import "../../i18n";
import App from "../../App";
import { useConnection } from "../../store/connection";
import { useSettings } from "../../store/settings";

const PEM = `-----BEGIN ${"PRIVATE"} KEY-----\nAAAA\n-----END PRIVATE KEY-----\n`;
const keyJson = (extra: Record<string, unknown>) =>
  JSON.stringify({
    type: "service_account",
    project_id: "proj",
    private_key: PEM,
    client_email: "sa@proj.iam.gserviceaccount.com",
    token_uri: "https://oauth2.googleapis.com/token",
    ...extra,
  });

beforeEach(() => {
  localStorage.clear();
  window.matchMedia ??= ((q: string) => ({
    matches: false,
    media: q,
    addEventListener() {},
    removeEventListener() {},
  })) as unknown as typeof window.matchMedia;
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify({ error: "invalid_grant", error_description: "Invalid JWT Signature." }), { status: 400 })),
  );
  useConnection.setState({ phase: "restoring", connection: null, error: null });
  useSettings.getState().setLanguage("es");
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

async function importPicked() {
  render(<App />);
  fireEvent.click(await screen.findByTestId("import-key"));
  return screen.findByTestId("connection-error");
}

describe("rejected credential diagnostics", () => {
  it("shows the picked file name and private_key_id in the technical details, keeping the main message localized", async () => {
    picked.file = { name: "mi-key.json", contents: keyJson({ private_key_id: "deadbeef0123" }) };
    const alert = await importPicked();
    expect(alert.querySelector("span")!.textContent).toBe(
      "Google rechazó la credencial. Comprueba que la clave no esté revocada y que el archivo sea el correcto.",
    );
    const tech = screen.getByTestId("connection-error-technical").textContent!;
    expect(tech).toContain("mi-key.json");
    expect(tech).toContain("deadbeef0123");
    expect(tech).toContain("Invalid JWT Signature");
    expect(document.body.textContent).not.toMatch(/BEGIN|AAAA|a\.b\.c/);
  });

  it("omits the key id line when the key has none and the file line when there is no name", async () => {
    picked.file = { name: "", contents: keyJson({}) };
    await importPicked();
    const tech = screen.getByTestId("connection-error-technical").textContent!;
    expect(tech).toContain("Invalid JWT Signature");
    expect(tech).not.toMatch(/Archivo|ID de clave|undefined|\{\{/);
  });

  it("localizes the labels in English", async () => {
    useSettings.getState().setLanguage("en");
    picked.file = { name: "other.json", contents: keyJson({ private_key_id: "cafe42" }) };
    await importPicked();
    const tech = screen.getByTestId("connection-error-technical").textContent!;
    expect(tech).toContain("File: other.json");
    expect(tech).toContain("Key ID: cafe42");
  });
});
