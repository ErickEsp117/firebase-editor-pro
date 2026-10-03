export { ApiError, parseApiError } from "./ApiError";
export { ApiClient } from "./ApiClient";
export type { ApiRequest, ApiResponse } from "./ApiClient";
export { ServiceAccountAuth, parseKeyJson, buildJwtParts, KeyFileError, SCOPES } from "./ServiceAccountAuth";
export type { ServiceAccountKey } from "./ServiceAccountAuth";
export { verifyKey, connectionFromKeyText, listRootCollections, classifyError, ConnectionError } from "./connection";
export {
  ACCOUNTS_KEY,
  LEGACY_CREDENTIAL_KEY,
  accountSecretKey,
  addAccount,
  connectAccount,
  importAccount,
  loadAccounts,
  removeAccount,
  setActiveAccount,
} from "./accounts";
export type { AccountMeta, AccountsIndex, AddAccountResult, ImportAccountResult } from "./accounts";
export type { Connection, ConnectionErrorKind } from "./connection";
export { FirestoreApi, fieldPath } from "./FirestoreApi";
export type { FirestoreDocument, ListOptions, Precondition, UpsertOptions, DocsPage, CollectionIdsPage } from "./FirestoreApi";
export { RemoteConfigApi, RemoteConfigConflictError, isRemoteConfigConflict } from "./RemoteConfigApi";
export type {
  RemoteConfigTemplate,
  RemoteConfigVersion,
  TemplateWithEtag,
  VersionsPage,
  PublishOptions,
  DefaultsFormat,
} from "./RemoteConfigApi";
export {
  CodecError,
  encodeDoc,
  encodeFields,
  documentsRootOf,
  decodeDoc,
  decodeFields,
  parseEditorJson,
  stringifyEditorJson,
  formatEditorJson,
  repairEditorJson,
  normalizeTimestamp,
} from "./FirestoreCodec";
export type { EncodedDoc, EncodeOptions, CodecErrorCode, RestFields, RestValue } from "./FirestoreCodec";
export {
  COLLECTIONS_KEY,
  ImportError,
  planDocumentImport,
  planCollectionImport,
  runImport,
  exportDocument,
  exportDocumentText,
  exportCollection,
} from "./FirestoreIO";
export type { ImportEntry } from "./FirestoreIO";
export { apiErrorKind } from "./errorKind";
export type { ApiErrorKind } from "./errorKind";
export { isReachable, reportReachable, subscribeReachable } from "./networkStatus";
