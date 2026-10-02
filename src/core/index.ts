export { ApiError, parseApiError } from "./ApiError";
export { ApiClient } from "./ApiClient";
export type { ApiRequest, ApiResponse } from "./ApiClient";
export { ServiceAccountAuth, parseKeyJson, buildJwtParts, KeyFileError, SCOPES } from "./ServiceAccountAuth";
export type { ServiceAccountKey } from "./ServiceAccountAuth";
export { importKey, restoreConnection, forgetConnection, verifyKey, listRootCollections, classifyError, ConnectionError } from "./connection";
export type { Connection, ConnectionErrorKind } from "./connection";
export { FirestoreApi, fieldPath } from "./FirestoreApi";
export type { FirestoreDocument, ListOptions, Precondition, UpsertOptions, DocsPage, CollectionIdsPage } from "./FirestoreApi";
export {
  CodecError,
  encodeDoc,
  encodeFields,
  decodeDoc,
  decodeFields,
  parseEditorJson,
  stringifyEditorJson,
  formatEditorJson,
  repairEditorJson,
  normalizeTimestamp,
} from "./FirestoreCodec";
export type { EncodedDoc, EncodeOptions, CodecErrorCode, RestFields, RestValue } from "./FirestoreCodec";
