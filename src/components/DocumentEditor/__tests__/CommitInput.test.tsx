// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { CommitInput } from "../CommitInput";

function Cell({ initial }: { initial: string }) {
  const [value, setValue] = useState(initial);
  return <CommitInput value={value} onCommit={setValue} label="valor" testId="cell" />;
}

afterEach(cleanup);

describe("CommitInput", () => {
  it("keeps the focused textarea when a Cmd/Ctrl+Enter commit removes the last line break", () => {
    render(<Cell initial={"a\nb"} />);
    const field = screen.getByTestId("cell");
    expect(field.tagName).toBe("TEXTAREA");
    field.focus();
    fireEvent.focus(field);
    fireEvent.change(field, { target: { value: "ab" } });
    fireEvent.keyDown(field, { key: "Enter", metaKey: true });
    const after = screen.getByTestId("cell") as HTMLTextAreaElement;
    expect(after).toBe(field);
    expect(document.activeElement).toBe(field);
    expect(after.value).toBe("ab");
    fireEvent.blur(after);
    expect(screen.getByTestId("cell").tagName).toBe("INPUT");
  });

  it("keeps the focused textarea when Escape reverts to a single-line value", () => {
    render(<Cell initial="ab" />);
    const input = screen.getByTestId("cell");
    expect(input.tagName).toBe("INPUT");
    // A pasted line break turns the cell into a textarea; Escape then reverts while it keeps focus.
    fireEvent.change(input, { target: { value: "a\nb" } });
    const area = screen.getByTestId("cell");
    area.focus();
    fireEvent.focus(area);
    fireEvent.keyDown(area, { key: "Escape" });
    expect(screen.getByTestId("cell")).toBe(area);
    expect((area as HTMLTextAreaElement).value).toBe("ab");
  });
});
