export { ApiError, parseApiError } from "./ApiError";
export { ApiClient } from "./ApiClient";
export type { ApiRequest, ApiResponse } from "./ApiClient";
export { ServiceAccountAuth, parseKeyJson, buildJwtParts, KeyFileError, SCOPES } from "./ServiceAccountAuth";
export type { ServiceAccountKey } from "./ServiceAccountAuth";
export { importKey, restoreConnection, forgetConnection, verifyKey, listRootCollections, classifyError, ConnectionError } from "./connection";
export type { Connection, ConnectionErrorKind } from "./connection";
