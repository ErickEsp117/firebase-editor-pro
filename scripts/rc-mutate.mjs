#!/usr/bin/env node
// Publishes an external Remote Config change so an open editor holds a stale ETag.
// Used to provoke validate/publish conflicts during validation.
//
//   node scripts/rc-mutate.mjs add [name] [value]   # default: fbep_test_external = "external"
//   node scripts/rc-mutate.mjs remove <name>
//   node scripts/rc-mutate.mjs clean                # drops every fbep_test_* parameter and condition
//
// Only names starting with "fbep_test_" are touched; everything else in the template is republished as read.
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
      scope: "https://www.googleapis.com/auth/firebase.remoteconfig",
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

const isSafe = (name) => typeof name === "string" && name.startsWith(SAFE_PREFIX);

function requireSafe(name) {
  if (!isSafe(name)) throw new Error(`refusing to touch "${name}": names must start with ${SAFE_PREFIX}`);
  return name;
}

function apply(template, command, name, value) {
  const next = structuredClone(template);
  if (command === "add") {
    next.parameters = { ...next.parameters, [requireSafe(name)]: { defaultValue: { value }, valueType: "STRING" } };
    return { next, summary: `added ${name}` };
  }
  if (command === "remove") {
    requireSafe(name);
    if (next.parameters) delete next.parameters[name];
    for (const g of Object.values(next.parameterGroups ?? {})) if (g.parameters) delete g.parameters[name];
    return { next, summary: `removed ${name}` };
  }
  if (command === "clean") {
    let removed = 0;
    const prune = (params) => {
      for (const k of Object.keys(params ?? {})) {
        if (isSafe(k)) {
          delete params[k];
          removed += 1;
        }
      }
    };
    prune(next.parameters);
    for (const g of Object.values(next.parameterGroups ?? {})) prune(g.parameters);
    if (next.conditions) {
      const kept = next.conditions.filter((c) => !isSafe(c.name));
      removed += next.conditions.length - kept.length;
      next.conditions = kept;
    }
    return { next, summary: `cleaned ${removed} fbep_test_* entries`, noop: removed === 0 };
  }
  throw new Error("usage: node scripts/rc-mutate.mjs add [name] [value] | remove <name> | clean");
}

async function main() {
  const [command, argName, argValue] = process.argv.slice(2);
  const name = command === "add" ? (argName ?? `${SAFE_PREFIX}external`) : argName;
  const value = argValue ?? "external";

  const key = JSON.parse(readFileSync(keyPath, "utf8"));
  const token = await accessToken(key);
  const url = `https://firebaseremoteconfig.googleapis.com/v1/projects/${key.project_id}/remoteConfig`;
  const auth = { Authorization: `Bearer ${token}` };

  const get = await fetch(url, { headers: auth });
  if (!get.ok) throw new Error(`GET failed: ${get.status}`);
  const etag = get.headers.get("etag");
  const template = JSON.parse((await get.text()) || "{}");

  const { next, summary, noop } = apply(template, command, name, value);
  if (noop) {
    console.log(`${summary}; nothing to publish`);
    return;
  }
  next.version = { description: `rc-mutate: ${summary}` };
  const put = await fetch(url, {
    method: "PUT",
    headers: { ...auth, "Content-Type": "application/json", "If-Match": etag },
    body: JSON.stringify(next),
  });
  const text = await put.text();
  if (!put.ok) {
    let err = {};
    try {
      err = JSON.parse(text).error ?? {};
    } catch {
      // body is not JSON
    }
    throw new Error(`PUT failed: ${put.status} ${err.status ?? ""} ${err.message ?? ""}`);
  }
  console.log(`${summary}; etag=${put.headers.get("etag")}`);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
