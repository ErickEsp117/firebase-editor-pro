#!/usr/bin/env node
// Read-only GET of a Firestore document for validation. Prints the HTTP status and the decoded
// field values (never the credential). Works with any service-account key.
//
//   node scripts/fs-get.mjs <keyfile-name> <collection/doc>
//
// <keyfile-name> is a file inside dev-secrets/ (e.g. test-key.json). Read-only: GET only.
import { createSign } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";

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
  const [keyFile, docPath] = process.argv.slice(2);
  if (!keyFile || !docPath) throw new Error("usage: node scripts/fs-get.mjs <keyfile-name> <collection/doc>");
  if (keyFile.includes("/") || keyFile.includes("..")) throw new Error("keyfile must be a plain name inside dev-secrets/");
  const segments = docPath.split("/").filter(Boolean);
  if (segments.some((s) => s === "." || s === "..")) throw new Error('path segments "." and ".." are not allowed');
  if (segments.length < 2 || segments.length % 2 !== 0) throw new Error("path must point at a document (even number of segments)");

  const keyPath = resolve(dirname(fileURLToPath(import.meta.url)), "../dev-secrets", keyFile);
  const key = JSON.parse(readFileSync(keyPath, "utf8"));
  const token = await accessToken(key);
  const name = `projects/${key.project_id}/databases/(default)/documents/${segments.map(encodeURIComponent).join("/")}`;
  const res = await fetch(`https://firestore.googleapis.com/v1/${name}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  console.log(`GET ${docPath} in ${key.project_id} -> ${res.status}`);
  if (res.ok) {
    const json = await res.json();
    console.log(JSON.stringify(json.fields ?? {}, null, 2));
  }
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
