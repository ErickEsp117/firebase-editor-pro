import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState } from "react";
import { decodeDoc, documentsRootOf, stringifyEditorJson, type FirestoreDocument } from "../../core";
import { useEditorStore } from "../../store/documentEditor";
import { useFirestoreApi } from "../Firestore/useFirestore";
import { buildSavePlan, docToText, hasChanges, isConflict, parseDraft, type Draft } from "./editorModel";
import type { Obj } from "./valueTypes";

export type SaveState =
  | { phase: "idle" }
  | { phase: "saving" }
  | { phase: "saved"; updateTime: string }
  | { phase: "error"; error: unknown }
  | { phase: "conflict" };

/** Editing state for one document; the draft text lives in the store so failures and remounts never lose it. */
export function useDocumentEditor(path: string, serverDoc: FirestoreDocument) {
  const api = useFirestoreApi();
  const queryClient = useQueryClient();
  const sessionKey = `${api?.projectId ?? ""}/${path}`;
  const { open, setText, rebase } = useEditorStore.getState();
  const session = useEditorStore((s) => s.sessions[sessionKey]);
  const mode = useEditorStore((s) => s.mode);
  const [state, setState] = useState<SaveState>({ phase: "idle" });
  const [forcing, setForcing] = useState(false);

  useEffect(() => {
    const existing = useEditorStore.getState().sessions[sessionKey];
    if (!existing) {
      open(sessionKey, { baseDoc: serverDoc, text: docToText(serverDoc) });
    } else if (existing.baseDoc.updateTime !== serverDoc.updateTime && existing.text === docToText(existing.baseDoc)) {
      // Untouched session and the server copy moved on: follow it. A dirty session is never overwritten.
      rebase(sessionKey, { baseDoc: serverDoc, text: docToText(serverDoc) });
    }
  }, [open, rebase, sessionKey, serverDoc]);

  const baseDoc = session?.baseDoc ?? serverDoc;
  const text = session?.text ?? docToText(serverDoc);
  const base = useMemo<Obj>(() => decodeDoc(baseDoc), [baseDoc]);
  const draft = useMemo<Draft>(() => parseDraft(text), [text]);
  const dirty = draft.ok ? hasChanges(base, draft.value) : text !== docToText(baseDoc);
  const canSave = draft.ok && dirty && state.phase !== "saving";

  const updateText = useCallback((next: string) => setText(sessionKey, next), [setText, sessionKey]);

  const edit = useCallback(
    (update: (current: Obj) => Obj) => {
      const latest = useEditorStore.getState().sessions[sessionKey];
      if (!latest) return;
      const d = parseDraft(latest.text);
      if (d.ok) setText(sessionKey, stringifyEditorJson(update(d.value)));
    },
    [setText, sessionKey],
  );

  const accept = useCallback(
    (doc: FirestoreDocument, keepText?: string) => {
      rebase(sessionKey, { baseDoc: doc, text: keepText ?? docToText(doc) });
      queryClient.setQueryData(["fs", api?.projectId, "doc", path], doc);
    },
    [rebase, sessionKey, queryClient, api?.projectId, path],
  );

  const save = useCallback(
    async (force = false) => {
      if (!api || !draft.ok) return;
      setState({ phase: "saving" });
      const sentText = text;
      try {
        const plan = buildSavePlan(base, draft.value, mode, api.projectId ? documentsRootOf(api.projectId) : undefined);
        const res = await api.upsertDoc(path, plan.fields, {
          updateMask: plan.updateMask,
          updateTime: force ? undefined : baseDoc.updateTime,
        });
        // Edits typed while the PATCH was in flight stay in the text; they become the next save's diff against the new base.
        const latest = useEditorStore.getState().sessions[sessionKey]?.text;
        accept(res, latest !== undefined && latest !== sentText ? latest : undefined);
        setForcing(false);
        setState({ phase: "saved", updateTime: res.updateTime ?? "" });
      } catch (e) {
        setState(isConflict(e) && !force ? { phase: "conflict" } : { phase: "error", error: e });
      }
    },
    [api, draft, base, mode, path, baseDoc.updateTime, accept, text, sessionKey],
  );

  const reload = useCallback(async () => {
    if (!api) return;
    setState({ phase: "saving" });
    try {
      accept(await api.getDoc(path));
      setState({ phase: "idle" });
    } catch (e) {
      setState({ phase: "error", error: e });
    }
  }, [api, path, accept]);

  const discard = useCallback(() => {
    updateText(docToText(baseDoc));
    setState({ phase: "idle" });
  }, [updateText, baseDoc]);

  return { text, draft, dirty, canSave, mode, state, setState, forcing, setForcing, updateText, edit, save, reload, discard, updateTime: baseDoc.updateTime };
}
