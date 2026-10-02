#!/usr/bin/env node
// Mutates one field of an existing Firestore test document so its updateTime changes.
// Used to provoke save conflicts (stale updateTime) during validation.
//
//   node scripts/fs-touch.mjs fbep_test_x/doc1 [fieldName]
//
// Only paths whose top-level collection starts with "fbep_test_" are accepted.
// Credential: dev-secrets/test-key.json (never printed).
import { createSign } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";

const SAFE_PREFIX = "fbep_test_";
const keyPath = resolve(dirname(fileURLToPath(import.meta.url)), "../dev-secrets/test-key.json");

const b64url = (b) => Buffer.from(b).toString("base64url");

async function accessToken(key) {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT", kid: key.private_key_id }));
  const claims = b64url(
    JSON.stringify({
      iss: key.client_email,
      scope: "https://www.googleapis.com/auth/datastore",
      aud: key.token_uri,
      iat: now,
      exp: now + 3600,
    }),
  );
  const signature = createSign("RSA-SHA256").update(`${header}.${claims}`).sign(key.private_key, "base64url");
  const res = await fetch(key.token_uri, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${header}.${claims}.${signature}`,
    }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`token exchange failed: ${res.status} ${json.error ?? ""}`);
  return json.access_token;
}

async function main() {
  const [docPath, field = "fbep_touch"] = process.argv.slice(2);
  if (!docPath) throw new Error("usage: node scripts/fs-touch.mjs <collection/doc> [fieldName]");
  const segments = docPath.split("/").filter(Boolean);
  if (segments.length < 2 || segments.length % 2 !== 0) throw new Error("path must point at a document (even number of segments)");
  if (!segments[0].startsWith(SAFE_PREFIX)) throw new Error(`refusing to write outside ${SAFE_PREFIX}* collections`);
  if (!/^[A-Za-z_][A-Za-z_0-9]*$/.test(field)) throw new Error("fieldName must be a simple identifier");

  const key = JSON.parse(readFileSync(keyPath, "utf8"));
  const token = await accessToken(key);
  const name = `projects/${key.project_id}/databases/(default)/documents/${segments.map(encodeURIComponent).join("/")}`;
  const url =
    `https://firestore.googleapis.com/v1/${name}` +
    `?updateMask.fieldPaths=${encodeURIComponent(field)}&currentDocument.exists=true`;
  const res = await fetch(url, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ fields: { [field]: { stringValue: new Date().toISOString() } } }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`PATCH failed: ${res.status} ${json.error?.status ?? ""} ${json.error?.message ?? ""}`);
  console.log(`touched ${docPath} (${field}); updateTime=${json.updateTime}`);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
