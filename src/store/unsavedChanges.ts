import { decodeDoc } from "../core";
import { docToText, hasChanges, parseDraft } from "../components/DocumentEditor/editorModel";
import { parseTemplateText, sameTemplate } from "../components/RemoteConfig/rcModel";
import type { RemoteConfigTemplate } from "../core";
import { useEditorStore, type EditorSession } from "./documentEditor";
import { hasPendingInputs } from "./pendingInputs";
import { useRcEditor, type RcSession } from "./rcEditor";

function documentDirty({ baseDoc, text }: EditorSession): boolean {
  const draft = parseDraft(text);
  return draft.ok ? hasChanges(decodeDoc(baseDoc), draft.value) : text !== docToText(baseDoc);
}

function templateDirty({ baseText, text }: RcSession): boolean {
  const draft = parseTemplateText(text);
  if (!draft.ok) return text !== baseText;
  const base = baseText ? (JSON.parse(baseText) as RemoteConfigTemplate) : {};
  return !sameTemplate(draft.template, base);
}

/** True when the open document `path` has a draft or an uncommitted table cell (only the open one has cells). */
export function documentUnsaved(projectId: string, path: string): boolean {
  const session = useEditorStore.getState().sessions[`${projectId}/${path}`];
  return !!session && (hasPendingInputs("firestore") || documentDirty(session));
}

/**
 * True when the Remote Config draft or any open document draft differs from its server baseline, or a
 * table cell still holds an uncommitted edit. Same comparison the editors use for their dirty indicators.
 */
export function hasUnsavedChanges(): boolean {
  if (hasPendingInputs()) return true;
  const rc = useRcEditor.getState().session;
  if (rc && templateDirty(rc)) return true;
  return Object.values(useEditorStore.getState().sessions).some(documentDirty);
}
