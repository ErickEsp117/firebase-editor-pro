import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  isRemoteConfigConflict,
  RemoteConfigApi,
  type RemoteConfigTemplate,
  type TemplateWithEtag,
} from "../../core";
import { getPlatform } from "../../platform";
import { useConnection } from "../../store/connection";
import { useRcEditor } from "../../store/rcEditor";
import { parseTemplateText, reapplyEdits, sameTemplate, templateToText, type RcDraft, type RcIssue } from "./rcModel";

export const VERSIONS_PAGE_SIZE = 20;
export const DEFAULTS_FILE_NAME = "remote-config-defaults.json";

export function useRemoteConfigApi(): RemoteConfigApi | null {
  const connection = useConnection((s) => s.connection);
  return useMemo(
    () => (connection ? new RemoteConfigApi(connection.client, connection.projectId) : null),
    [connection],
  );
}

export function useRcVersions(api: RemoteConfigApi | null) {
  return useInfiniteQuery({
    queryKey: ["rc", api?.projectId, "versions"],
    queryFn: ({ pageParam }) => api!.listVersions({ pageSize: VERSIONS_PAGE_SIZE, pageToken: pageParam }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextPageToken,
    enabled: !!api,
  });
}

export type ValidationResult =
  | { kind: "valid" }
  | { kind: "local"; issues: RcIssue[] }
  | { kind: "server"; error: unknown }
  | { kind: "conflict" };

export type RcNotice =
  | { kind: "published"; version?: string }
  | { kind: "rolledBack"; version?: string }
  | { kind: "reloaded" }
  | { kind: "reapplied"; applied: string[]; overridden: string[] }
  | { kind: "defaultsSaved"; name: string }
  | { kind: "defaultsCancelled" };

export type PublishOutcome =
  | { kind: "ok" }
  | { kind: "invalid"; issues: RcIssue[]; error?: unknown }
  | { kind: "conflict" }
  | { kind: "error"; error: unknown };

export type Busy = "validate" | "publish" | "reload" | "rollback" | "defaults" | null;

/** Everything the Remote Config view needs; the draft itself lives in the rcEditor store. */
export function useRcController() {
  const api = useRemoteConfigApi();
  const queryClient = useQueryClient();
  const projectId = api?.projectId;
  const stored = useRcEditor((s) => s.session);
  const session = stored && stored.projectId === projectId ? stored : null;
  const templateKey = useMemo(() => ["rc", projectId, "template"], [projectId]);
  const versionsKey = useMemo(() => ["rc", projectId, "versions"], [projectId]);

  const [busy, setBusy] = useState<Busy>(null);
  const [validation, setValidation] = useState<{ text: string; result: ValidationResult } | null>(null);
  const [notice, setNotice] = useState<RcNotice | null>(null);
  const [actionError, setActionError] = useState<{ error: unknown } | null>(null);

  const query = useQuery({
    queryKey: templateKey,
    queryFn: () => api!.getTemplate(),
    enabled: !!api,
    staleTime: Infinity,
  });

  const adopt = useCallback(
    (res: TemplateWithEtag, text?: string) => {
      if (!projectId) return;
      const baseText = templateToText(res.template);
      const version = res.template.version as { versionNumber?: string; updateTime?: string } | undefined;
      useRcEditor.getState().open({
        projectId,
        etag: res.etag,
        versionNumber: version?.versionNumber,
        updateTime: version?.updateTime,
        baseText,
        text: text ?? baseText,
      });
      queryClient.setQueryData(templateKey, res);
    },
    [projectId, queryClient, templateKey],
  );

  // First load for this project; later changes always go through adopt().
  const loaded = query.data;
  useEffect(() => {
    const current = useRcEditor.getState().session;
    if (loaded && (!current || current.projectId !== projectId)) adopt(loaded);
  }, [loaded, projectId, adopt]);

  const text = session?.text ?? "";
  const baseText = session?.baseText;
  const baseTemplate = useMemo<RemoteConfigTemplate>(
    () => (baseText ? (JSON.parse(baseText) as RemoteConfigTemplate) : {}),
    [baseText],
  );
  const draft = useMemo<RcDraft>(() => parseTemplateText(text), [text]);
  const dirty = draft.ok ? !sameTemplate(draft.template, baseTemplate) : text !== baseText;
  const currentValidation = validation && validation.text === text ? validation.result : null;

  const setText = useCallback((next: string) => useRcEditor.getState().setText(next), []);

  const invalidateVersions = useCallback(
    () => queryClient.invalidateQueries({ queryKey: versionsKey }),
    [queryClient, versionsKey],
  );

  /** After a write, re-download so the editor shows (and holds the ETag of) exactly what the server has. */
  const adoptFresh = useCallback(
    async (written: TemplateWithEtag) => {
      let fresh = written;
      try {
        fresh = await api!.getTemplate();
      } catch {
        // The write succeeded; fall back to the response of the write itself.
      }
      adopt(fresh);
      void invalidateVersions();
      return fresh;
    },
    [api, adopt, invalidateVersions],
  );

  const validate = useCallback(async () => {
    if (!api || !session) return;
    const checked = text;
    if (!draft.ok) {
      setValidation({ text: checked, result: { kind: "local", issues: draft.issues } });
      return;
    }
    setBusy("validate");
    setNotice(null);
    try {
      await api.validate(draft.template, session.etag);
      setValidation({ text: checked, result: { kind: "valid" } });
    } catch (e) {
      setValidation({
        text: checked,
        result: isRemoteConfigConflict(e) ? { kind: "conflict" } : { kind: "server", error: e },
      });
    } finally {
      setBusy(null);
    }
  }, [api, session, text, draft]);

  const publish = useCallback(
    async (description: string, force: boolean): Promise<PublishOutcome> => {
      if (!api || !session) return { kind: "error", error: new Error("not connected") };
      if (!draft.ok) return { kind: "invalid", issues: draft.issues };
      setBusy("publish");
      setNotice(null);
      try {
        // Publish maps every 400 to "stale ETag", so template problems must be ruled out first.
        try {
          await api.validate(draft.template, session.etag);
        } catch (e) {
          if (!(force && isRemoteConfigConflict(e))) {
            return isRemoteConfigConflict(e) ? { kind: "conflict" } : { kind: "invalid", issues: [], error: e };
          }
        }
        const res = await api.publish(draft.template, session.etag, description, { force });
        const fresh = await adoptFresh(res);
        setValidation(null);
        setNotice({ kind: "published", version: (fresh.template.version as { versionNumber?: string } | undefined)?.versionNumber });
        return { kind: "ok" };
      } catch (e) {
        return isRemoteConfigConflict(e) ? { kind: "conflict" } : { kind: "error", error: e };
      } finally {
        setBusy(null);
      }
    },
    [api, session, draft, adoptFresh],
  );

  /** Re-downloads the template. With `reapply`, the user's edits are carried onto the fresh copy. */
  const reload = useCallback(
    async (reapply: boolean): Promise<boolean> => {
      if (!api) return false;
      setBusy("reload");
      setActionError(null);
      try {
        const latest = await api.getTemplate();
        if (reapply && draft.ok && dirty) {
          const merged = reapplyEdits(baseTemplate, draft.template, latest.template);
          adopt(latest, templateToText(merged.template));
          setNotice({ kind: "reapplied", applied: merged.applied, overridden: merged.overridden });
        } else {
          adopt(latest);
          setNotice({ kind: "reloaded" });
        }
        setValidation(null);
        return true;
      } catch (e) {
        setActionError({ error: e });
        return false;
      } finally {
        setBusy(null);
      }
    },
    [api, draft, dirty, baseTemplate, adopt],
  );

  const rollback = useCallback(
    async (versionNumber: string): Promise<boolean> => {
      if (!api) return false;
      setBusy("rollback");
      setActionError(null);
      try {
        const res = await api.rollback(versionNumber);
        const fresh = await adoptFresh(res);
        setValidation(null);
        setNotice({ kind: "rolledBack", version: (fresh.template.version as { versionNumber?: string } | undefined)?.versionNumber });
        return true;
      } catch (e) {
        setActionError({ error: e });
        return false;
      } finally {
        setBusy(null);
      }
    },
    [api, adoptFresh],
  );

  const downloadDefaults = useCallback(async () => {
    if (!api) return;
    setBusy("defaults");
    setActionError(null);
    try {
      const raw = await api.downloadDefaults("JSON");
      const saved = await getPlatform().saveTextFile(DEFAULTS_FILE_NAME, raw.trim() === "" ? "{}" : raw);
      setNotice(saved ? { kind: "defaultsSaved", name: DEFAULTS_FILE_NAME } : { kind: "defaultsCancelled" });
    } catch (e) {
      setActionError({ error: e });
    } finally {
      setBusy(null);
    }
  }, [api]);

  return {
    api,
    session,
    loading: query.isPending || (!!query.data && !session),
    loadError: query.isError && !session ? { error: query.error } : null,
    retryLoad: () => void query.refetch(),
    text,
    setText,
    draft,
    dirty,
    validation: currentValidation,
    notice,
    dismissNotice: () => setNotice(null),
    actionError,
    busy,
    validate,
    publish,
    reload,
    rollback,
    downloadDefaults,
  };
}
