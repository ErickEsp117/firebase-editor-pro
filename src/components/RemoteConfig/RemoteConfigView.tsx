import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { RemoteConfigVersion } from "../../core";
import { useRcEditor } from "../../store/rcEditor";
import { ErrorNotice } from "../errors/ErrorNotice";
import { ioErrorMessage } from "../Firestore/crud/ioErrors";
import { PublishDialog, RcConfirmDialog, RcConflictDialog } from "./dialogs";
import { countEntries } from "./rcModel";
import { ErrorMessage, FailureBody, IssueList, rejectionText, type RcFailure } from "./rcErrors";
import { TemplateEditor } from "./TemplateEditor";
import { useRcController, type RcNotice } from "./useRemoteConfig";
import { VersionsPanel } from "./VersionsPanel";

type Dialog =
  | { kind: "publish" }
  | { kind: "conflict" }
  | { kind: "reload" }
  | { kind: "rollback"; version: RemoteConfigVersion };

const BTN = "rounded border border-slate-300 px-3 py-1 text-sm disabled:opacity-50 dark:border-slate-600";

export function RemoteConfigView() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const rc = useRcController();
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [description, setDescription] = useState("");
  const [dialogError, setDialogError] = useState<RcFailure | null>(null);

  // Disconnecting unmounts this view; the next connection must start from a fresh download.
  useEffect(
    () => () => {
      useRcEditor.getState().reset();
      queryClient.removeQueries({ queryKey: ["rc"] });
    },
    [queryClient],
  );

  const close = () => {
    setDialog(null);
    setDialogError(null);
  };
  const working = rc.busy !== null;

  const publish = async (desc: string, force: boolean) => {
    setDescription(desc);
    setDialogError(null);
    const outcome = await rc.publish(desc, force);
    if (outcome.kind === "ok") {
      setDescription("");
      return close();
    }
    if (outcome.kind === "conflict") return setDialog({ kind: "conflict" });
    if (outcome.kind === "invalid") {
      return setDialogError(outcome.error !== undefined ? { kind: "rejected", error: outcome.error } : { kind: "issues", issues: outcome.issues });
    }
    setDialogError({ kind: "publishFailed", error: outcome.error });
  };

  const session = rc.session;
  if (rc.loadError) {
    return (
      <ErrorNotice testId="rc-load-error" error={rc.loadError.error} summary={t("rc.loadError")} onRetry={rc.retryLoad} retryTestId="rc-retry" />
    );
  }
  if (rc.loading || !session) {
    return (
      <p role="status" data-testid="rc-loading">
        {t("rc.loading")}
      </p>
    );
  }

  const failureView = (testId: string) => dialogError && <FailureBody failure={dialogError} testId={testId} />;
  const counts = rc.draft.ok ? countEntries(rc.draft.template) : null;

  return (
    <div data-testid="rc-view" className="space-y-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600 dark:text-slate-400">
        <span data-testid="rc-etag" className="font-mono">
          {t("rc.etag", { etag: session.etag })}
        </span>
        <span data-testid="rc-version">
          {session.versionNumber ? t("rc.version", { version: session.versionNumber }) : t("rc.noVersion")}
        </span>
        {counts && (
          <span data-testid="rc-counts">
            {t("rc.parameterCount", { count: counts.parameters })} · {t("rc.conditionCount", { count: counts.conditions })}
          </span>
        )}
        {rc.dirty && (
          <span data-testid="rc-dirty" className="text-amber-700 dark:text-amber-300">
            {t("rc.unpublished")}
          </span>
        )}
      </div>
      {counts && counts.parameters === 0 && (
        <p data-testid="rc-empty-hint" className="text-sm text-slate-600 dark:text-slate-400">
          {t("rc.emptyHint")}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" data-testid="rc-validate" className={BTN} disabled={working} onClick={() => void rc.validate()}>
          {rc.busy === "validate" ? t("rc.validating") : t("rc.validate")}
        </button>
        <button
          type="button"
          data-testid="rc-publish"
          className="rounded bg-blue-700 px-3 py-1 text-sm text-white disabled:opacity-50"
          disabled={working || !rc.draft.ok}
          onClick={() => {
            setDialogError(null);
            setDialog({ kind: "publish" });
          }}
        >
          {t("rc.publish")}
        </button>
        <button
          type="button"
          data-testid="rc-reload"
          className={BTN}
          disabled={working}
          onClick={() => (rc.dirty ? setDialog({ kind: "reload" }) : void rc.reload(false))}
        >
          {rc.busy === "reload" ? t("rc.reloading") : t("rc.reloadTemplate")}
        </button>
        <button type="button" data-testid="rc-defaults" className={BTN} disabled={working} onClick={() => void rc.downloadDefaults()}>
          {t("rc.downloadDefaults")}
        </button>
      </div>

      {!rc.draft.ok && (
        <div role="alert" data-testid="rc-draft-error" className="text-sm text-red-700 dark:text-red-300">
          <p>{t("rc.publishBlocked")}</p>
          <IssueList issues={rc.draft.issues} testId="rc-draft-error" />
        </div>
      )}
      <ValidationMessage validation={rc.validation} />
      {rc.notice && <Notice notice={rc.notice} onDismiss={rc.dismissNotice} />}
      {rc.actionError && (
        <div role="alert" data-testid="rc-action-error" className="text-sm text-red-700 dark:text-red-300">
          <ErrorMessage text={t("rc.actionError", { message: ioErrorMessage(t, rc.actionError.error) })} error={rc.actionError.error} testId="rc-action-error" />
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_26rem]">
        <TemplateEditor text={rc.text} onChange={rc.setText} />
        <VersionsPanel
          api={rc.api}
          currentVersion={session.versionNumber}
          busy={working}
          onRollback={(version) => {
            setDialogError(null);
            setDialog({ kind: "rollback", version });
          }}
        />
      </div>

      {dialog?.kind === "publish" && (
        <PublishDialog
          busy={rc.busy === "publish"}
          error={failureView("rc-publish-error")}
          initial={description}
          onPublish={(desc) => void publish(desc, false)}
          onCancel={close}
        />
      )}
      {dialog?.kind === "conflict" && (
        <RcConflictDialog
          busy={working}
          error={failureView("rc-conflict-error")}
          onCancel={close}
          onReload={async () => {
            setDialogError(null);
            if (await rc.reload(true)) close();
          }}
          onForce={() => void publish(description, true)}
        />
      )}
      {dialog?.kind === "reload" && (
        <RcConfirmDialog
          testId="rc-reload-dialog"
          title={t("rc.reloadConfirmTitle")}
          confirmLabel={t("rc.reloadDiscard")}
          busy={working}
          danger
          onCancel={close}
          onConfirm={async () => {
            if (await rc.reload(false)) close();
          }}
        >
          <p className="text-sm">{t("rc.reloadConfirmBody")}</p>
        </RcConfirmDialog>
      )}
      {dialog?.kind === "rollback" && (
        <RcConfirmDialog
          testId="rc-rollback-dialog"
          title={t("rc.rollbackTitle", { version: dialog.version.versionNumber })}
          confirmLabel={rc.busy === "rollback" ? t("rc.rollingBack") : t("rc.rollbackConfirm", { version: dialog.version.versionNumber })}
          busy={working}
          danger
          onCancel={close}
          onConfirm={async () => {
            if (await rc.rollback(dialog.version.versionNumber)) close();
          }}
        >
          <p className="text-sm">{t("rc.rollbackBody", { version: dialog.version.versionNumber })}</p>
          {rc.dirty && (
            <p role="alert" data-testid="rc-rollback-dirty" className="text-sm text-amber-700 dark:text-amber-300">
              {t("rc.rollbackDirty")}
            </p>
          )}
          {rc.actionError && (
            <div role="alert" className="text-sm text-red-700 dark:text-red-300">
              <ErrorMessage text={t("rc.actionError", { message: ioErrorMessage(t, rc.actionError.error) })} error={rc.actionError.error} testId="rc-rollback-error" />
            </div>
          )}
        </RcConfirmDialog>
      )}
    </div>
  );
}

function ValidationMessage({ validation }: { validation: ReturnType<typeof useRcController>["validation"] }) {
  const { t } = useTranslation();
  if (!validation) return null;
  if (validation.kind === "valid") {
    return (
      <p role="status" data-testid="rc-validation-ok" className="text-sm text-emerald-700 dark:text-emerald-300">
        {t("rc.validationOk")}
      </p>
    );
  }
  return (
    <div role="alert" data-testid="rc-validation-error" className="text-sm text-red-700 dark:text-red-300">
      {validation.kind === "local" && (
        <>
          <p>{t("rc.validationLocal")}</p>
          <IssueList issues={validation.issues} testId="rc-validation-error" />
        </>
      )}
      {validation.kind === "server" && <ErrorMessage text={rejectionText(t, validation.error)} error={validation.error} testId="rc-validation-error" />}
      {validation.kind === "conflict" && <p>{t("rc.validationConflict")}</p>}
    </div>
  );
}

function Notice({ notice, onDismiss }: { notice: RcNotice; onDismiss(): void }) {
  const { t } = useTranslation();
  let text: string;
  switch (notice.kind) {
    case "published":
      text = t("rc.published", { version: notice.version ?? "?" });
      break;
    case "rolledBack":
      text = t("rc.rolledBack", { version: notice.version ?? "?" });
      break;
    case "reloaded":
      text = t("rc.reloaded");
      break;
    case "reapplied":
      text = t("rc.reapplied", { count: notice.applied.length });
      break;
    case "defaultsSaved":
      text = t("rc.defaultsSaved", { name: notice.name });
      break;
    case "defaultsCancelled":
      text = t("rc.defaultsCancelled");
      break;
  }
  return (
    <div role="status" data-testid="rc-notice" data-kind={notice.kind} className="flex flex-wrap items-center gap-2 text-sm text-emerald-700 dark:text-emerald-300">
      <span>{text}</span>
      {notice.kind === "reapplied" && notice.overridden.length > 0 && (
        <span role="alert" data-testid="rc-overridden" className="text-amber-700 dark:text-amber-300">
          {t("rc.overridden", { names: notice.overridden.join(", ") })}
        </span>
      )}
      <button type="button" data-testid="rc-notice-dismiss" className="text-xs underline" onClick={onDismiss}>
        {t("connection.dismiss")}
      </button>
    </div>
  );
}
