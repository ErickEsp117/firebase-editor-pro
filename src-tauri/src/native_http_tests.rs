//! Tests for the HTTP client the native app uses (`tauri_plugin_http::reqwest`).
//!
//! Remote Config only returns the `ETag` header when the request advertises
//! `Accept-Encoding: gzip`, so the plugin must be built with its `gzip` feature.

use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::sync::mpsc;
use std::thread;
use std::time::Duration;

use flate2::write::GzEncoder;
use flate2::Compression;
use serde_json::{json, Value};
use tauri_plugin_http::reqwest;

fn read_request_head(stream: &mut TcpStream) -> String {
    stream
        .set_read_timeout(Some(Duration::from_secs(10)))
        .unwrap();
    let mut buf = Vec::new();
    let mut chunk = [0u8; 1024];
    while !buf.windows(4).any(|w| w == b"\r\n\r\n") {
        let n = stream.read(&mut chunk).unwrap();
        if n == 0 {
            break;
        }
        buf.extend_from_slice(&chunk[..n]);
    }
    String::from_utf8_lossy(&buf).into_owned()
}

fn header_value(head: &str, name: &str) -> Option<String> {
    head.lines().skip(1).find_map(|line| {
        let (k, v) = line.split_once(':')?;
        k.trim()
            .eq_ignore_ascii_case(name)
            .then(|| v.trim().to_string())
    })
}

fn gzip(bytes: &[u8]) -> Vec<u8> {
    let mut enc = GzEncoder::new(Vec::new(), Compression::default());
    enc.write_all(bytes).unwrap();
    enc.finish().unwrap()
}

/// Serves one request like Remote Config does: gzip body plus `ETag` only when
/// the client advertised gzip, plain body without `ETag` otherwise.
/// Returns the base URL and a receiver for the captured request head.
fn spawn_gzip_only_etag_server(body: &Value) -> (String, mpsc::Receiver<String>) {
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let url = format!("http://{}/remoteConfig", listener.local_addr().unwrap());
    let plain = serde_json::to_vec(body).unwrap();
    let (tx, rx) = mpsc::channel();
    thread::spawn(move || {
        let (mut stream, _) = listener.accept().unwrap();
        let head = read_request_head(&mut stream);
        let accepts_gzip = header_value(&head, "accept-encoding")
            .map(|v| v.to_ascii_lowercase().contains("gzip"))
            .unwrap_or(false);
        tx.send(head).unwrap();

        let (extra_headers, payload) = if accepts_gzip {
            ("Content-Encoding: gzip\r\nETag: etag-1\r\n", gzip(&plain))
        } else {
            ("", plain)
        };
        let response = format!(
            "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\n{extra_headers}Content-Length: {}\r\nConnection: close\r\n\r\n",
            payload.len()
        );
        stream.write_all(response.as_bytes()).unwrap();
        stream.write_all(&payload).unwrap();
        stream.flush().unwrap();
    });
    (url, rx)
}

#[test]
fn plugin_http_client_advertises_gzip_keeps_etag_and_decompresses() {
    let template = json!({ "parameters": { "welcome": { "defaultValue": { "value": "hola" } } } });
    let (url, captured) = spawn_gzip_only_etag_server(&template);

    let (etag, body) = tauri::async_runtime::block_on(async {
        let resp = reqwest::Client::new().get(&url).send().await.unwrap();
        assert_eq!(resp.status().as_u16(), 200);
        let etag = resp
            .headers()
            .get("etag")
            .map(|v| v.to_str().unwrap().to_string());
        (etag, resp.text().await.unwrap())
    });

    let head = captured.recv_timeout(Duration::from_secs(10)).unwrap();
    let accept_encoding = header_value(&head, "accept-encoding")
        .expect("request must carry an Accept-Encoding header");
    assert!(
        accept_encoding.to_ascii_lowercase().contains("gzip"),
        "Accept-Encoding must include gzip, got: {accept_encoding}"
    );
    assert_eq!(etag.as_deref(), Some("etag-1"));
    let parsed: Value = serde_json::from_str(&body).expect("body must be decompressed JSON");
    assert_eq!(parsed, template);
}

fn env_key_path() -> Option<String> {
    std::env::var("FBEP_TEST_KEY")
        .ok()
        .filter(|v| !v.is_empty())
}

fn form_encode(pairs: &[(&str, &str)]) -> String {
    pairs
        .iter()
        .map(|(k, v)| format!("{}={}", pct(k), pct(v)))
        .collect::<Vec<_>>()
        .join("&")
}

fn pct(s: &str) -> String {
    let mut out = String::new();
    for b in s.bytes() {
        if b.is_ascii_alphanumeric() || matches!(b, b'-' | b'_' | b'.' | b'~') {
            out.push(b as char);
        } else {
            out.push_str(&format!("%{b:02X}"));
        }
    }
    out
}

/// Read-only check against the real Remote Config API using the plugin's HTTP
/// client and the app's own JWT signer. Never prints the key, JWT, token or
/// any response body.
#[test]
#[ignore = "hits Google; run with FBEP_TEST_KEY via services.yaml commands.test_rust_native_real"]
fn native_real_remote_config_template_has_etag_and_list_versions_ok() {
    let Some(path) = env_key_path() else {
        eprintln!("native_real: FBEP_TEST_KEY not set, skipping");
        return;
    };
    let raw = std::fs::read_to_string(&path).expect("cannot read the key file at FBEP_TEST_KEY");
    let key: Value = serde_json::from_str(&raw).expect("key file is not valid JSON");
    let field = |name: &str| -> String {
        key.get(name)
            .and_then(Value::as_str)
            .unwrap_or_else(|| panic!("key file lacks string field `{name}`"))
            .to_string()
    };
    let (client_email, private_key, project_id, token_uri) = (
        field("client_email"),
        field("private_key"),
        field("project_id"),
        field("token_uri"),
    );

    let iat = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs();
    let mut header = json!({ "alg": "RS256", "typ": "JWT" });
    if let Some(kid) = key.get("private_key_id").and_then(Value::as_str) {
        header["kid"] = json!(kid);
    }
    let claims = json!({
        "iss": client_email,
        "scope": "https://www.googleapis.com/auth/datastore https://www.googleapis.com/auth/firebase.remoteconfig",
        "aud": token_uri,
        "iat": iat,
        "exp": iat + 3600,
    });
    let assertion = crate::jwt::sign(&private_key, header, claims).expect("JWT signing failed");

    let (token_status, token, template_status, has_etag, versions_status) =
        tauri::async_runtime::block_on(async {
            let client = reqwest::Client::new();
            let resp = client
                .post(&token_uri)
                .header("content-type", "application/x-www-form-urlencoded")
                .body(form_encode(&[
                    ("grant_type", "urn:ietf:params:oauth:grant-type:jwt-bearer"),
                    ("assertion", &assertion),
                ]))
                .send()
                .await
                .expect("token exchange request failed");
            let token_status = resp.status().as_u16();
            let body: Value =
                serde_json::from_str(&resp.text().await.unwrap_or_default()).unwrap_or(Value::Null);
            let token = body
                .get("access_token")
                .and_then(Value::as_str)
                .unwrap_or_default()
                .to_string();
            if token_status != 200 || token.is_empty() {
                return (token_status, token, 0, false, 0);
            }

            let base = format!(
                "https://firebaseremoteconfig.googleapis.com/v1/projects/{project_id}/remoteConfig"
            );
            let template = client
                .get(&base)
                .bearer_auth(&token)
                .send()
                .await
                .expect("template request failed");
            let template_status = template.status().as_u16();
            let has_etag = template
                .headers()
                .get("etag")
                .and_then(|v| v.to_str().ok())
                .is_some_and(|v| !v.is_empty());

            let versions = client
                .get(format!("{base}:listVersions?pageSize=1"))
                .bearer_auth(&token)
                .send()
                .await
                .expect("listVersions request failed");
            (
                token_status,
                token,
                template_status,
                has_etag,
                versions.status().as_u16(),
            )
        });

    assert_eq!(token_status, 200, "token exchange status");
    assert!(!token.is_empty(), "token exchange returned no access_token");
    assert_eq!(template_status, 200, "remoteConfig template status");
    assert!(
        has_etag,
        "remoteConfig template response lacks a non-empty ETag"
    );
    assert_eq!(versions_status, 200, "listVersions status");
    println!(
        "native_real: token={token_status} template={template_status} etag_present={has_etag} listVersions={versions_status}"
    );
}
