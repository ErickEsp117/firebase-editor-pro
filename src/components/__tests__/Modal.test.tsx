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

it("returns focus to the opener even when a field inside the dialog autofocuses", () => {
  const trigger = document.createElement("button");
  document.body.append(trigger); trigger.focus();
  const view = render(<Modal titleId="t2" testId="modal" title="Create" onClose={() => undefined}>
    <input aria-label="Id" autoFocus /><button>Create</button>
  </Modal>);
  expect(document.activeElement).toBe(screen.getByLabelText("Id"));
  view.unmount();
  expect(document.activeElement).toBe(trigger);
  trigger.remove();
});

it("falls back to returnFocus when the opener was disabled or is gone", () => {
  const save = document.createElement("button");
  document.body.append(save);
  (document.activeElement as HTMLElement | null)?.blur();
  const view = render(<Modal titleId="t3" testId="modal" title="Conflict" onClose={() => undefined} returnFocus={() => save}>
    <button>Reload</button>
  </Modal>);
  view.unmount();
  expect(document.activeElement).toBe(save);
  save.remove();
});

it("with stacked dialogs only the top one handles Escape and keeps focus", () => {
  const closeBottom = vi.fn();
  const closeTop = vi.fn();
  render(<>
    <Modal titleId="b" testId="bottom" title="Bottom" onClose={closeBottom}><button>Bottom action</button></Modal>
    <Modal titleId="t" testId="top" title="Top" onClose={closeTop}><button>Top action</button></Modal>
  </>);
  expect(document.activeElement).toBe(screen.getByText("Top action"));
  fireEvent.keyDown(document, { key: "Escape" });
  expect(closeTop).toHaveBeenCalledOnce();
  expect(closeBottom).not.toHaveBeenCalled();
  fireEvent.keyDown(document.activeElement!, { key: "Tab" });
  expect(screen.getByTestId("top").contains(document.activeElement)).toBe(true);
});

it("keeps the technical details summary reachable with Tab", () => {
  render(<Modal titleId="t4" testId="modal" title="Failed" onClose={() => undefined}>
    <details><summary>Technical details</summary><code>raw</code></details><button>Close</button>
  </Modal>);
  expect(document.activeElement?.tagName).toBe("SUMMARY");
  fireEvent.keyDown(document.activeElement!, { key: "Tab", shiftKey: true });
  expect(document.activeElement).toBe(screen.getByText("Close"));
  fireEvent.keyDown(document.activeElement!, { key: "Tab" });
  expect(document.activeElement?.tagName).toBe("SUMMARY");
});
