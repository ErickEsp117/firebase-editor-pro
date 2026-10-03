import { getPlatform } from "../platform";
import type { Platform } from "../platform/types";
import { ConnectionError, connectionFromKeyText, verifyKey, type Connection } from "./connection";
import { normalizeKeyId, parseKeyJson, type ServiceAccountKey } from "./ServiceAccountAuth";

export const ACCOUNTS_KEY = "accounts";
/** Pre-M6 single-credential entry, migrated into the account index by loadAccounts. */
export const LEGACY_CREDENTIAL_KEY = "service-account";

export const accountSecretKey = (id: string): string => `sa:${id}`;

/** Non-secret account descriptor: the credential itself lives under `sa:<id>`. */
export interface AccountMeta {
  id: string;
  projectId: string;
  clientEmail: string;
  privateKeyId?: string;
  /** ISO-8601 timestamp. */
  addedAt: string;
}

export interface AccountsIndex {
  version: 1;
  activeId: string | null;
  accounts: AccountMeta[];
}

export interface AddAccountResult {
  index: AccountsIndex;
  account: AccountMeta;
  /** True when the key matched an existing account, which was selected instead of adding another. */
  duplicate: boolean;
}

export interface ImportAccountResult extends AddAccountResult {
  connection: Connection;
}

const emptyIndex = (): AccountsIndex => ({ version: 1, activeId: null, accounts: [] });

function unreadable(detail: string): ConnectionError {
  return new ConnectionError("keyUnreadable", detail);
}

function isMeta(v: unknown): v is AccountMeta {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.id === "string" &&
    typeof o.projectId === "string" &&
    typeof o.clientEmail === "string" &&
    typeof o.addedAt === "string" &&
    (o.privateKeyId === undefined || typeof o.privateKeyId === "string")
  );
}

function parseIndex(raw: string): AccountsIndex {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw unreadable("accounts index is not valid JSON");
  }
  const o = value as { version?: unknown; activeId?: unknown; accounts?: unknown } | null;
  if (!o || o.version !== 1 || !Array.isArray(o.accounts) || !o.accounts.every(isMeta)) {
    throw unreadable("accounts index has an unexpected shape");
  }
  const accounts = o.accounts as AccountMeta[];
  const activeId = typeof o.activeId === "string" && accounts.some((a) => a.id === o.activeId) ? o.activeId : null;
  return { version: 1, activeId, accounts };
}

async function readIndex(platform: Platform): Promise<AccountsIndex | null> {
  const raw = await platform.secureStore.get(ACCOUNTS_KEY);
  return raw ? parseIndex(raw) : null;
}

async function writeIndex(platform: Platform, index: AccountsIndex): Promise<void> {
  await platform.secureStore.set(ACCOUNTS_KEY, JSON.stringify(index));
}

const sameIdentity = (a: AccountMeta, key: ServiceAccountKey): boolean =>
  a.clientEmail === key.client_email && a.privateKeyId === normalizeKeyId(key.private_key_id);

function metaFor(key: ServiceAccountKey): AccountMeta {
  const privateKeyId = normalizeKeyId(key.private_key_id);
  return {
    id: crypto.randomUUID(),
    projectId: key.project_id,
    clientEmail: key.client_email,
    ...(privateKeyId ? { privateKeyId } : {}),
    addedAt: new Date().toISOString(),
  };
}

/**
 * Adds a key without contacting Google. The credential is written before the index, so a crash leaves
 * at worst an unreferenced `sa:<id>` entry. A key matching an existing account selects that account.
 */
export async function addAccount(keyText: string, platform: Platform = getPlatform()): Promise<AddAccountResult> {
  const key = parseKeyJson(keyText);
  const index = (await readIndex(platform)) ?? emptyIndex();
  const existing = index.accounts.find((a) => sameIdentity(a, key));
  if (existing) {
    const next = { ...index, activeId: existing.id };
    if (index.activeId !== existing.id) await writeIndex(platform, next);
    return { index: next, account: existing, duplicate: true };
  }
  const account = metaFor(key);
  await platform.secureStore.set(accountSecretKey(account.id), keyText);
  const next: AccountsIndex = { version: 1, activeId: account.id, accounts: [...index.accounts, account] };
  await writeIndex(platform, next);
  return { index: next, account, duplicate: false };
}

/**
 * Loads the account index, first folding a pre-M6 `service-account` entry into it. The legacy entry is
 * deleted only after the credential and the index are written, so a crash at any point can be re-run.
 */
export async function loadAccounts(platform: Platform = getPlatform()): Promise<AccountsIndex> {
  const index = await readIndex(platform);
  const legacy = await platform.secureStore.get(LEGACY_CREDENTIAL_KEY);
  if (!legacy) return index ?? emptyIndex();

  let key: ServiceAccountKey;
  try {
    key = parseKeyJson(legacy);
  } catch (e) {
    // Kept untouched. Once an index exists the user already has a way forward, so only a fresh install is blocked.
    if (index) return index;
    throw unreadable(e instanceof Error ? e.message : String(e));
  }

  const base = index ?? emptyIndex();
  let result = base;
  if (!base.accounts.some((a) => sameIdentity(a, key))) {
    const account = metaFor(key);
    await platform.secureStore.set(accountSecretKey(account.id), legacy);
    result = {
      version: 1,
      activeId: index ? index.activeId : account.id,
      accounts: [...base.accounts, account],
    };
    await writeIndex(platform, result);
  }
  try {
    await platform.secureStore.delete(LEGACY_CREDENTIAL_KEY);
  } catch {
    // Harmless: the next load finds the key in the index and retries the delete.
  }
  return result;
}

/** Persists which account is active; `null` is the signed-out state and keeps every account. */
export async function setActiveAccount(platform: Platform, id: string | null): Promise<AccountsIndex> {
  const index = (await readIndex(platform)) ?? emptyIndex();
  if (id !== null && !index.accounts.some((a) => a.id === id)) throw unreadable("unknown account");
  const next = { ...index, activeId: id };
  await writeIndex(platform, next);
  return next;
}

/**
 * Removes an account: index first, credential second. If the credential delete fails the account is
 * already gone and the leftover entry is unreferenced (`orphaned`). Removing the active account activates
 * the first remaining one, or none.
 */
export async function removeAccount(
  platform: Platform,
  id: string,
): Promise<{ index: AccountsIndex; orphaned: boolean }> {
  const index = (await readIndex(platform)) ?? emptyIndex();
  if (!index.accounts.some((a) => a.id === id)) return { index, orphaned: false };
  const accounts = index.accounts.filter((a) => a.id !== id);
  const activeId = index.activeId === id ? (accounts[0]?.id ?? null) : index.activeId;
  const next: AccountsIndex = { version: 1, activeId, accounts };
  await writeIndex(platform, next);
  try {
    await platform.secureStore.delete(accountSecretKey(id));
    return { index: next, orphaned: false };
  } catch {
    return { index: next, orphaned: true };
  }
}

/** Offline: builds the connection from the stored credential of an account. */
export async function connectAccount(platform: Platform, id: string): Promise<Connection> {
  const stored = await platform.secureStore.get(accountSecretKey(id));
  if (!stored) throw unreadable("stored credential is missing");
  try {
    return connectionFromKeyText(stored, platform);
  } catch (e) {
    throw unreadable(e instanceof Error ? e.message : String(e));
  }
}

/**
 * Adds a key the user picked: a duplicate selects the existing account without network; otherwise the key
 * is verified with Google (token + root listCollectionIds) before anything is stored.
 */
export async function importAccount(
  keyText: string,
  platform: Platform = getPlatform(),
  fileName?: string,
): Promise<ImportAccountResult> {
  let parsed: ServiceAccountKey | undefined;
  try {
    parsed = parseKeyJson(keyText);
  } catch {
    // verifyKey below reports it with the file name attached.
  }
  if (parsed) {
    const index = await readIndex(platform);
    const existing = index?.accounts.find((a) => sameIdentity(a, parsed));
    if (existing) {
      const connection = await connectAccount(platform, existing.id);
      const res = await addAccount(keyText, platform);
      return { ...res, connection };
    }
  }
  const connection = await verifyKey(keyText, platform, fileName);
  const res = await addAccount(keyText, platform);
  return { ...res, connection };
}
