// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { Modal } from "../Firestore/crud/Modal";
afterEach(cleanup);
it("traps Tab, dismisses on Escape and restores the invoking focus", () => {
  const trigger = document.createElement("button");
  document.body.append(trigger); trigger.focus();
  const close = vi.fn();
  const view = render(<Modal titleId="title" testId="modal" title="Confirm" onClose={close}>
    <button>Cancel</button><button>Confirm</button>
  </Modal>);
  expect(document.activeElement).toBe(screen.getByText("Cancel"));
  fireEvent.keyDown(document.activeElement!, { key: "Tab", shiftKey: true });
  expect(document.activeElement).toBe(screen.getByRole("button", { name: "Confirm" }));
  fireEvent.keyDown(document.activeElement!, { key: "Tab" });
  expect(document.activeElement).toBe(screen.getByText("Cancel"));
  fireEvent.keyDown(document, { key: "Escape" }); expect(close).toHaveBeenCalledOnce();
  view.unmount(); expect(document.activeElement).toBe(trigger); trigger.remove();
});
