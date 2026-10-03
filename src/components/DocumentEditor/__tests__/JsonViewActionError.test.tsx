// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import i18n from "../../../i18n";
import { JsonView } from "../JsonView";

afterEach(cleanup);

describe("JsonView action error", () => {
  it("follows the active language instead of freezing the text at failure time", async () => {
    await act(async () => {
      await i18n.changeLanguage("es");
    });
    render(<JsonView text="{ not json" onChange={() => undefined} />);
    fireEvent.click(screen.getByTestId("json-format"));
    expect(screen.getByTestId("json-action-error").textContent).toBe(i18n.getFixedT("es")("editor.actionFailed"));
    await act(async () => {
      await i18n.changeLanguage("en");
    });
    expect(screen.getByTestId("json-action-error").textContent).toBe(i18n.getFixedT("en")("editor.actionFailed"));
  });
});
