import { beforeEach, describe, expect, it } from "vitest";
import type { FirestoreDocument } from "../../core";
import { docToText } from "../../components/DocumentEditor/editorModel";
import { useEditorStore } from "../documentEditor";
import { useRcEditor } from "../rcEditor";
import { hasUnsavedChanges } from "../unsavedChanges";

const doc: FirestoreDocument = {
  name: "projects/p/databases/(default)/documents/users/u1",
  fields: { name: { stringValue: "Ana" } },
  createTime: "2026-01-01T00:00:00Z",
  updateTime: "2026-01-01T00:00:00Z",
};
const rcBase = JSON.stringify({ parameters: { a: { defaultValue: { value: "1" } } } }, null, 2);

beforeEach(() => {
  useEditorStore.getState().clear();
  useRcEditor.getState().reset();
});

describe("hasUnsavedChanges", () => {
  it("is false with no sessions", () => {
    expect(hasUnsavedChanges()).toBe(false);
  });

  it("is false for untouched sessions", () => {
    useEditorStore.getState().open("p/users/u1", { baseDoc: doc, text: docToText(doc) });
    useRcEditor.getState().open({ projectId: "p", etag: "e", baseText: rcBase, text: rcBase });
    expect(hasUnsavedChanges()).toBe(false);
  });

  it("is true when a document draft differs from its base", () => {
    useEditorStore.getState().open("p/users/u1", { baseDoc: doc, text: docToText(doc) });
    useEditorStore.getState().setText("p/users/u1", JSON.stringify({ name: "Bea" }));
    expect(hasUnsavedChanges()).toBe(true);
  });

  it("is true for a document draft that is not valid JSON yet", () => {
    useEditorStore.getState().open("p/users/u1", { baseDoc: doc, text: docToText(doc) });
    useEditorStore.getState().setText("p/users/u1", "{ name:");
    expect(hasUnsavedChanges()).toBe(true);
  });

  it("looks at every open document, not only the visible one", () => {
    useEditorStore.getState().open("p/users/u1", { baseDoc: doc, text: docToText(doc) });
    useEditorStore.getState().open("p/users/u2", { baseDoc: doc, text: docToText(doc) });
    useEditorStore.getState().setText("p/users/u2", JSON.stringify({ name: "Zed" }));
    expect(hasUnsavedChanges()).toBe(true);
  });

  it("is false once a document draft goes back to its base", () => {
    useEditorStore.getState().open("p/users/u1", { baseDoc: doc, text: docToText(doc) });
    useEditorStore.getState().setText("p/users/u1", JSON.stringify({ name: "Bea" }));
    useEditorStore.getState().setText("p/users/u1", JSON.stringify({ name: "Ana" }));
    expect(hasUnsavedChanges()).toBe(false);
  });

  it("is true when the Remote Config draft is dirty", () => {
    useRcEditor.getState().open({ projectId: "p", etag: "e", baseText: rcBase, text: rcBase });
    useRcEditor.getState().setText(JSON.stringify({ parameters: { a: { defaultValue: { value: "2" } } } }));
    expect(hasUnsavedChanges()).toBe(true);
  });

  it("ignores formatting-only differences in Remote Config", () => {
    useRcEditor.getState().open({ projectId: "p", etag: "e", baseText: rcBase, text: rcBase });
    useRcEditor.getState().setText(JSON.stringify(JSON.parse(rcBase)));
    expect(hasUnsavedChanges()).toBe(false);
  });
});
