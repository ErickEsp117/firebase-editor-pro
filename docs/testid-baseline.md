# UI test IDs before M7

HEAD: d4294715d53a5ac0a7bc98754873d9af612affcb

Includes the recovered M6 working changes.

```text
src/components/AccountSwitcher.tsx: <div data-testid="account-switcher" className="relative text-sm">
src/components/AccountSwitcher.tsx: data-testid="account-active-badge"
src/components/AccountSwitcher.tsx: data-testid="account-duplicate-notice"
src/components/AccountSwitcher.tsx: data-testid="account-switcher-toggle"
src/components/AccountSwitcher.tsx: data-testid="add-account"
src/components/AccountSwitcher.tsx: data-testid={`account-item:${a.id}`}
src/components/ConfirmDialog.tsx: <button type="button" data-testid={`${testId}-cancel`} className="rounded border border-slate-400 px-3 py-1 text-sm" onClick={onCancel}>
src/components/ConfirmDialog.tsx: <p data-testid="unsaved-warning" className="text-amber-700 dark:text-amber-300">
src/components/ConfirmDialog.tsx: data-testid={`${testId}-confirm`}
src/components/ConfirmDialog.tsx: data-testid={`${testId}-dialog`}
src/components/ConnectedView.tsx: <div data-testid="area-firestore" hidden={area !== "firestore"}>
src/components/ConnectedView.tsx: <div data-testid="area-remote-config" hidden={area !== "remoteConfig"}>
src/components/ConnectedView.tsx: <h2 className="text-2xl font-semibold" data-testid="connected-title">
src/components/ConnectedView.tsx: <section data-testid="connected" className="flex flex-col gap-4">
src/components/ConnectedView.tsx: data-testid="disconnect"
src/components/ConnectedView.tsx: data-testid={a.testId}
src/components/DocumentEditor/CommitInput.tsx: data-testid={testId}
src/components/DocumentEditor/ConflictDialog.tsx: <button type="button" data-testid="conflict-cancel" onClick={onCancel} className="rounded border border-slate-300 px-3 py-1 text-sm dark:border-slate-600">
src/components/DocumentEditor/ConflictDialog.tsx: <button type="button" data-testid="conflict-force" onClick={onAskForce} className="rounded border border-red-600 px-3 py-1 text-sm text-red-700 dark:text-red-300">
src/components/DocumentEditor/ConflictDialog.tsx: <button type="button" data-testid="conflict-force-confirm" onClick={onConfirmForce} className="rounded bg-red-700 px-3 py-1 text-sm text-white">
src/components/DocumentEditor/ConflictDialog.tsx: <button type="button" data-testid="conflict-reload" onClick={onReload} className="rounded border border-slate-300 px-3 py-1 text-sm dark:border-slate-600">
src/components/DocumentEditor/ConflictDialog.tsx: <div role="alertdialog" aria-modal="true" aria-labelledby="conflict-title" data-testid="conflict-dialog" className="w-full max-w-md space-y-3 rounded-lg bg-white p-5 shadow-xl dark:bg-slate-800">
src/components/DocumentEditor/ConflictDialog.tsx: <p role="alert" data-testid="force-warning" className="text-sm text-red-700 dark:text-red-300">
src/components/DocumentEditor/DocumentEditor.tsx: <div data-testid="document-editor" className="space-y-3">
src/components/DocumentEditor/DocumentEditor.tsx: <p data-testid="table-unavailable" className="text-sm text-slate-500">
src/components/DocumentEditor/DocumentEditor.tsx: data-testid={`view-${v}`}
src/components/DocumentEditor/JsonView.tsx: <button type="button" data-testid="json-format" onClick={() => run(formatEditorJson)} className="rounded border border-slate-300 px-2 py-1 text-xs dark:border-slate-600">
src/components/DocumentEditor/JsonView.tsx: <button type="button" data-testid="json-repair" onClick={() => run(repairEditorJson)} className="rounded border border-slate-300 px-2 py-1 text-xs dark:border-slate-600">
src/components/DocumentEditor/JsonView.tsx: <div data-testid="json-editor" className="overflow-hidden rounded border border-slate-300 text-sm dark:border-slate-600">
src/components/DocumentEditor/JsonView.tsx: <div data-testid="json-view" className="space-y-2">
src/components/DocumentEditor/JsonView.tsx: <span role="alert" data-testid="json-action-error" className="self-center text-xs text-red-700 dark:text-red-300">
src/components/DocumentEditor/SaveBar.tsx: <div role="alert" data-testid="save-error" className="space-y-1 text-sm text-red-700 dark:text-red-300">
src/components/DocumentEditor/SaveBar.tsx: <p data-testid="save-error-message">{t("editor.saveFailed", { message: describeError(t, state.error) })}</p>
src/components/DocumentEditor/SaveBar.tsx: <p role="alert" data-testid="draft-error" className="text-sm text-red-700 dark:text-red-300">
src/components/DocumentEditor/SaveBar.tsx: <p role="status" data-testid="save-status" className="text-sm text-emerald-700 dark:text-emerald-300">
src/components/DocumentEditor/SaveBar.tsx: <span data-testid="dirty-indicator" className="text-xs text-amber-700 dark:text-amber-300">
src/components/DocumentEditor/SaveBar.tsx: <span data-testid="update-time" className="font-mono text-xs text-slate-500">
src/components/DocumentEditor/SaveBar.tsx: data-testid="discard-button"
src/components/DocumentEditor/SaveBar.tsx: data-testid="save-button"
src/components/DocumentEditor/SaveBar.tsx: data-testid="save-mode"
src/components/DocumentEditor/TableView.tsx: <div className="flex flex-wrap items-center gap-2 text-xs" data-testid={testId}>
src/components/DocumentEditor/TableView.tsx: <div data-testid="table-view" className="space-y-2">
src/components/DocumentEditor/TableView.tsx: <span data-testid="type-badge" data-type={type} className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${BADGE[type]}`}>
src/components/DocumentEditor/TableView.tsx: <td colSpan={4} className="py-2 text-slate-500" data-testid="table-empty">
src/components/DocumentEditor/TableView.tsx: <tr data-testid={`row-${testKey}`} className="border-t border-slate-200 align-top dark:border-slate-700">
src/components/DocumentEditor/TableView.tsx: data-testid={`${testId}-button`}
src/components/DocumentEditor/TableView.tsx: data-testid={`${testId}-name`}
src/components/DocumentEditor/TableView.tsx: data-testid={`${testId}-type`}
src/components/DocumentEditor/TableView.tsx: data-testid={`delete-${testKey}`}
src/components/DocumentEditor/TableView.tsx: data-testid={`toggle-${testKey}`}
src/components/DocumentEditor/ValueEditor.tsx: data-testid="edit-boolean"
src/components/ErrorBanner.tsx: <span data-testid="connection-error-message">{text}</span>
src/components/ErrorBanner.tsx: data-testid="connection-error"
src/components/Firestore/DocumentView.tsx: <button type="button" data-testid="document-back" className="underline" onClick={() => select(null)}>
src/components/Firestore/DocumentView.tsx: <div data-testid="document-view" className="space-y-3">
src/components/Firestore/DocumentView.tsx: <div role="status" data-testid="document-missing" className="space-y-1 text-sm text-amber-700 dark:text-amber-300">
src/components/Firestore/DocumentView.tsx: <h3 className="mr-auto break-all font-mono text-sm font-semibold" data-testid="document-path">{path}</h3>
src/components/Firestore/DocumentView.tsx: data-testid="delete-document"
src/components/Firestore/DocumentView.tsx: data-testid="export-document"
src/components/Firestore/DocumentView.tsx: data-testid="import-document"
src/components/Firestore/DocumentView.tsx: data-testid="new-subcollection"
src/components/Firestore/DocumentView.tsx: if (!path) return <p data-testid="doc-empty" className="text-slate-500">{t("firestore.selectDocument")}</p>;
src/components/Firestore/DocumentView.tsx: {doc.isPending && <p data-testid="document-loading">{t("firestore.documentLoading")}</p>}
src/components/Firestore/FirestoreBrowser.tsx: <aside data-testid="sidebar" className="overflow-auto rounded border border-slate-200 p-2 dark:border-slate-700">
src/components/Firestore/FirestoreBrowser.tsx: <section data-testid="document-panel" className="min-w-0">
src/components/Firestore/FirestoreBrowser.tsx: data-testid="import-collection"
src/components/Firestore/FirestoreBrowser.tsx: data-testid="new-collection"
src/components/Firestore/FirestoreBrowser.tsx: data-testid="refresh"
src/components/Firestore/TreeNodes.tsx: <li data-testid={`collection-node:${path}`}>
src/components/Firestore/TreeNodes.tsx: <li data-testid={`doc-node:${path}`} data-missing={missing || undefined}>
src/components/Firestore/TreeNodes.tsx: <span data-testid={`missing-badge:${path}`} title={t("firestore.missingHint")} className="mr-1 rounded bg-amber-200 px-1 text-[10px] text-amber-900">
src/components/Firestore/TreeNodes.tsx: <ul data-testid={`docs:${collectionPath}`}>
src/components/Firestore/TreeNodes.tsx: <ul data-testid={docPath ? "subcollections-list" : "collections-list"}>
src/components/Firestore/TreeNodes.tsx: data-testid={`collection-add:${path}`}
src/components/Firestore/TreeNodes.tsx: data-testid={`collection-delete:${path}`}
src/components/Firestore/TreeNodes.tsx: data-testid={`collection-export:${path}`}
src/components/Firestore/TreeNodes.tsx: data-testid={`collection-import:${path}`}
src/components/Firestore/TreeNodes.tsx: data-testid={`collection:${path}`}
src/components/Firestore/TreeNodes.tsx: data-testid={`doc-toggle:${path}`}
src/components/Firestore/TreeNodes.tsx: data-testid={`doc:${path}`}
src/components/Firestore/TreeNodes.tsx: data-testid={`load-more:${collectionPath}`}
src/components/Firestore/TreeNodes.tsx: data-testid={testId}
src/components/Firestore/crud/CreateDocDialog.tsx: <button type="button" data-testid="create-doc-cancel" className={BTN} disabled={busy} onClick={close}>
src/components/Firestore/crud/CreateDocDialog.tsx: <button type="button" data-testid="create-doc-submit" className="rounded bg-blue-700 px-3 py-1 text-sm text-white disabled:opacity-50" disabled={busy || invalid} onClick={() => void submit()}>
src/components/Firestore/crud/CreateDocDialog.tsx: <input data-testid="create-collection-id" className={FIELD} value={collId} onChange={(e) => setCollId(e.target.value)} autoFocus />
src/components/Firestore/crud/CreateDocDialog.tsx: <input data-testid="create-doc-id" className={FIELD} value={docId} onChange={(e) => setDocId(e.target.value)} autoFocus={!needsCollection} />
src/components/Firestore/crud/CreateDocDialog.tsx: <span data-testid="create-doc-json-error" className="text-xs text-red-700 dark:text-red-300">
src/components/Firestore/crud/CreateDocDialog.tsx: <textarea data-testid="create-doc-json" className={`${FIELD} h-40`} spellCheck={false} value={text} onChange={(e) => setText(e.target.value)} />
src/components/Firestore/crud/DeleteCollectionDialog.tsx: <button type="button" data-testid="delete-cancel" className={BTN} disabled={busy} onClick={close}>
src/components/Firestore/crud/DeleteCollectionDialog.tsx: <button type="button" data-testid="delete-confirm" className={BTN_DANGER} disabled={busy || count.data === undefined} onClick={() => void confirm()}>
src/components/Firestore/crud/DeleteCollectionDialog.tsx: <div role="alert" data-testid="delete-coll-count-error" className="space-y-1 text-sm text-red-700 dark:text-red-300">
src/components/Firestore/crud/DeleteCollectionDialog.tsx: <p className="break-all text-sm" data-testid="delete-coll-body">
src/components/Firestore/crud/DeleteCollectionDialog.tsx: <p role="status" data-testid="delete-coll-progress" className="text-sm">
src/components/Firestore/crud/DeleteCollectionDialog.tsx: {count.isPending && <p data-testid="delete-coll-counting" className="text-sm">{t("crud.deleteCollCounting", { path })}</p>}
src/components/Firestore/crud/DeleteDocDialog.tsx: <button type="button" data-testid="delete-cancel" className={BTN} disabled={busy} onClick={close}>
src/components/Firestore/crud/DeleteDocDialog.tsx: <button type="button" data-testid="delete-confirm" className={BTN_DANGER} disabled={busy} onClick={() => void confirm()}>
src/components/Firestore/crud/DeleteDocDialog.tsx: <p className="break-all text-sm" data-testid="delete-doc-body">
src/components/Firestore/crud/DialogError.tsx: <p data-testid={testId}>{t(failure.key, { ...failure.params, message })}</p>
src/components/Firestore/crud/ExportDialog.tsx: <button type="button" data-testid="export-close" className={BTN} onClick={close}>
src/components/Firestore/crud/ExportDialog.tsx: <p role="status" data-testid="export-cancelled" className="text-sm">
src/components/Firestore/crud/ExportDialog.tsx: <p role="status" data-testid="export-done" className="text-sm text-green-800 dark:text-green-300">
src/components/Firestore/crud/ExportDialog.tsx: <p role="status" data-testid="export-progress" className="text-sm">
src/components/Firestore/crud/ImportDialog.tsx: <button type="button" data-testid="import-choose-file" className={BTN} disabled={busy} onClick={() => void pick()}>
src/components/Firestore/crud/ImportDialog.tsx: <button type="button" data-testid="import-close" className={BTN} disabled={busy} onClick={close}>
src/components/Firestore/crud/ImportDialog.tsx: <button type="button" data-testid="import-submit" className="rounded bg-blue-700 px-3 py-1 text-sm text-white disabled:opacity-50" disabled={busy} onClick={() => void submit()}>
src/components/Firestore/crud/ImportDialog.tsx: <input data-testid="import-target" className={FIELD} value={target} onChange={(e) => setTarget(e.target.value)} disabled={busy} />
src/components/Firestore/crud/ImportDialog.tsx: <p role="status" data-testid="import-done" className="text-sm text-green-800 dark:text-green-300">
src/components/Firestore/crud/ImportDialog.tsx: <p role="status" data-testid="import-progress" className="text-sm">
src/components/Firestore/crud/ImportDialog.tsx: <textarea data-testid="import-json" className={`${FIELD} h-40`} spellCheck={false} value={text} disabled={busy} onChange={(e) => setText(e.target.value)} />
src/components/Firestore/crud/ImportDialog.tsx: {fileName && <span data-testid="import-file-name" className="truncate text-xs text-slate-500">{t("io.loadedFile", { name: fileName })}</span>}
src/components/Firestore/crud/Modal.tsx: data-testid={testId}
src/components/RemoteConfig/RemoteConfigView.tsx: <button type="button" data-testid="rc-defaults" className={BTN} disabled={working} onClick={() => void rc.downloadDefaults()}>
src/components/RemoteConfig/RemoteConfigView.tsx: <button type="button" data-testid="rc-notice-dismiss" className="text-xs underline" onClick={onDismiss}>
src/components/RemoteConfig/RemoteConfigView.tsx: <button type="button" data-testid="rc-validate" className={BTN} disabled={working} onClick={() => void rc.validate()}>
src/components/RemoteConfig/RemoteConfigView.tsx: <div data-testid="rc-view" className="space-y-3">
src/components/RemoteConfig/RemoteConfigView.tsx: <div role="alert" data-testid="rc-action-error" className="text-sm text-red-700 dark:text-red-300">
src/components/RemoteConfig/RemoteConfigView.tsx: <div role="alert" data-testid="rc-draft-error" className="text-sm text-red-700 dark:text-red-300">
src/components/RemoteConfig/RemoteConfigView.tsx: <div role="alert" data-testid="rc-validation-error" className="text-sm text-red-700 dark:text-red-300">
src/components/RemoteConfig/RemoteConfigView.tsx: <div role="status" data-testid="rc-notice" data-kind={notice.kind} className="flex flex-wrap items-center gap-2 text-sm text-emerald-700 dark:text-emerald-300">
src/components/RemoteConfig/RemoteConfigView.tsx: <p data-testid="rc-empty-hint" className="text-sm text-slate-600 dark:text-slate-400">
src/components/RemoteConfig/RemoteConfigView.tsx: <p role="alert" data-testid="rc-rollback-dirty" className="text-sm text-amber-700 dark:text-amber-300">
src/components/RemoteConfig/RemoteConfigView.tsx: <p role="status" data-testid="rc-loading">
src/components/RemoteConfig/RemoteConfigView.tsx: <p role="status" data-testid="rc-validation-ok" className="text-sm text-emerald-700 dark:text-emerald-300">
src/components/RemoteConfig/RemoteConfigView.tsx: <span data-testid="rc-counts">
src/components/RemoteConfig/RemoteConfigView.tsx: <span data-testid="rc-dirty" className="text-amber-700 dark:text-amber-300">
src/components/RemoteConfig/RemoteConfigView.tsx: <span data-testid="rc-etag" className="font-mono">
src/components/RemoteConfig/RemoteConfigView.tsx: <span data-testid="rc-version">
src/components/RemoteConfig/RemoteConfigView.tsx: <span role="alert" data-testid="rc-overridden" className="text-amber-700 dark:text-amber-300">
src/components/RemoteConfig/RemoteConfigView.tsx: data-testid="rc-publish"
src/components/RemoteConfig/RemoteConfigView.tsx: data-testid="rc-reload"
src/components/RemoteConfig/TemplateEditor.tsx: <button type="button" data-testid="rc-format" onClick={format} className="rounded border border-slate-300 px-2 py-1 text-xs dark:border-slate-600">
src/components/RemoteConfig/TemplateEditor.tsx: <div data-testid="rc-editor" className="overflow-hidden rounded border border-slate-300 text-sm dark:border-slate-600">
src/components/RemoteConfig/TemplateEditor.tsx: <div data-testid="rc-json-view" className="space-y-2">
src/components/RemoteConfig/TemplateEditor.tsx: <span role="alert" data-testid="rc-format-error" className="text-xs text-red-700 dark:text-red-300">
src/components/RemoteConfig/VersionsPanel.tsx: <div role="alert" data-testid="rc-versions-error" className="text-xs text-red-700 dark:text-red-300">
src/components/RemoteConfig/VersionsPanel.tsx: <p data-testid="rc-versions-empty" className="text-xs text-slate-500">
src/components/RemoteConfig/VersionsPanel.tsx: <p role="status" data-testid="rc-versions-loading" className="text-xs text-slate-500">
src/components/RemoteConfig/VersionsPanel.tsx: <section data-testid="rc-versions" aria-labelledby="rc-versions-title" className="space-y-2">
src/components/RemoteConfig/VersionsPanel.tsx: <span data-testid="rc-version-current" className="ml-1 rounded bg-emerald-100 px-1 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200">
src/components/RemoteConfig/VersionsPanel.tsx: <tr key={v.versionNumber} data-testid={`rc-version-${v.versionNumber}`} className="border-b border-slate-100 align-top dark:border-slate-800">
src/components/RemoteConfig/VersionsPanel.tsx: data-testid="rc-versions-more"
src/components/RemoteConfig/VersionsPanel.tsx: data-testid="rc-versions-refresh"
src/components/RemoteConfig/VersionsPanel.tsx: data-testid={`rc-rollback-${v.versionNumber}`}
src/components/RemoteConfig/dialogs.tsx: <button type="button" data-testid="rc-conflict-cancel" className={BTN} disabled={busy} onClick={onCancel}>
src/components/RemoteConfig/dialogs.tsx: <button type="button" data-testid="rc-conflict-force-confirm" className={BTN_DANGER} disabled={busy} onClick={onForce}>
src/components/RemoteConfig/dialogs.tsx: <button type="button" data-testid="rc-conflict-reload" className={BTN} disabled={busy} onClick={onReload}>
src/components/RemoteConfig/dialogs.tsx: <button type="button" data-testid="rc-publish-cancel" className={BTN} disabled={busy} onClick={onCancel}>
src/components/RemoteConfig/dialogs.tsx: <button type="button" data-testid={`${testId}-cancel`} className={BTN} disabled={busy} onClick={onCancel}>
src/components/RemoteConfig/dialogs.tsx: <div role="alert" data-testid="rc-conflict-error" className="space-y-1 text-sm text-red-700 dark:text-red-300">
src/components/RemoteConfig/dialogs.tsx: <div role="alert" data-testid="rc-publish-error" className="space-y-1 text-sm text-red-700 dark:text-red-300">
src/components/RemoteConfig/dialogs.tsx: <p role="alert" data-testid="rc-force-warning" className="text-sm text-red-700 dark:text-red-300">
src/components/RemoteConfig/dialogs.tsx: data-testid="rc-conflict-force"
src/components/RemoteConfig/dialogs.tsx: data-testid="rc-description"
src/components/RemoteConfig/dialogs.tsx: data-testid="rc-publish-confirm"
src/components/RemoteConfig/dialogs.tsx: data-testid={`${testId}-confirm`}
src/components/RemoteConfig/rcErrors.tsx: <p data-testid={`${testId}-message`}>{failure.issues.map((i) => t(i.key, i.params)).join(" ")}</p>
src/components/RemoteConfig/rcErrors.tsx: <p data-testid={`${testId}-message`}>{text}</p>
src/components/RemoveAccountButton.tsx: data-testid="account-orphaned-notice"
src/components/RemoveAccountButton.tsx: data-testid={`remove-account:${account.id}`}
src/components/SettingsBar.tsx: data-testid="language-select"
src/components/SettingsBar.tsx: data-testid="theme-select"
src/components/WelcomeView.tsx: <section data-testid="welcome" className="mx-auto flex max-w-xl flex-col gap-4">
src/components/WelcomeView.tsx: <ul data-testid="welcome-accounts" className="flex flex-col gap-1">
src/components/WelcomeView.tsx: data-testid="import-key"
src/components/WelcomeView.tsx: data-testid={`account-item:${a.id}`}
src/components/errors/ErrorNotice.tsx: <button type="button" data-testid={retryTestId ?? `${testId}-retry`} className="underline" onClick={onRetry}>
src/components/errors/ErrorNotice.tsx: <div role="alert" data-testid={testId} data-error-kind={kind} className="space-y-1 text-sm text-red-700 dark:text-red-300">
src/components/errors/ErrorNotice.tsx: <p data-testid={`${testId}-message`}>{describeError(t, error)}</p>
src/components/errors/OfflineBanner.tsx: <button type="button" data-testid="offline-retry" className="underline" onClick={retryFailed}>
src/components/errors/OfflineBanner.tsx: data-testid="offline-banner"
src/components/errors/TechnicalDetails.tsx: <details className="opacity-80" data-testid={testId}>
```
