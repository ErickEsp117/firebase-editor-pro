use jsonwebtoken::{Algorithm, EncodingKey, Header};
use serde_json::{Map, Value};

/// Signs `claims` as an RS256 JWT. Only the header's `kid` and `typ` are honoured;
/// the algorithm is always forced to RS256.
pub fn sign(private_key_pem: &str, header: Value, claims: Value) -> Result<String, String> {
    let key = EncodingKey::from_rsa_pem(private_key_pem.as_bytes())
        .map_err(|_| "invalid private key PEM".to_string())?;
    let header_obj: Map<String, Value> =
        serde_json::from_value(header).map_err(|e| format!("invalid header: {e}"))?;
    let claims_obj: Map<String, Value> =
        serde_json::from_value(claims).map_err(|e| format!("invalid claims: {e}"))?;

    let mut h = Header::new(Algorithm::RS256);
    h.kid = header_obj
        .get("kid")
        .and_then(Value::as_str)
        .map(str::to_string);
    if let Some(typ) = header_obj.get("typ").and_then(Value::as_str) {
        h.typ = Some(typ.to_string());
    }
    jsonwebtoken::encode(&h, &claims_obj, &key).map_err(|e| format!("signing failed: {e}"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use jsonwebtoken::{decode, decode_header, DecodingKey, Validation};
    use rsa::pkcs1::{EncodeRsaPrivateKey, EncodeRsaPublicKey};
    use rsa::pkcs8::{EncodePrivateKey, LineEnding};
    use rsa::RsaPrivateKey;
    use serde_json::json;

    fn test_keypair() -> (RsaPrivateKey, String) {
        let mut rng = rsa::rand_core::OsRng;
        let key = RsaPrivateKey::new(&mut rng, 2048).expect("keygen");
        let pem = key.to_pkcs8_pem(LineEnding::LF).expect("pem").to_string();
        (key, pem)
    }

    #[test]
    fn signs_verifiable_rs256_token_with_kid() {
        let (key, pem) = test_keypair();
        let claims = json!({"iss": "svc@test", "aud": "https://example.test/token", "iat": 1, "exp": 4102444800u64});
        let token = sign(&pem, json!({"alg": "RS256", "typ": "JWT", "kid": "abc123"}), claims).unwrap();

        let header = decode_header(&token).unwrap();
        assert_eq!(header.alg, Algorithm::RS256);
        assert_eq!(header.kid.as_deref(), Some("abc123"));

        let pub_pem = key.to_public_key().to_pkcs1_pem(LineEnding::LF).unwrap();
        let mut v = Validation::new(Algorithm::RS256);
        v.set_audience(&["https://example.test/token"]);
        let data = decode::<Value>(&token, &DecodingKey::from_rsa_pem(pub_pem.as_bytes()).unwrap(), &v).unwrap();
        assert_eq!(data.claims["iss"], "svc@test");
    }

    #[test]
    fn signs_with_pkcs1_pem_too() {
        let (key, _) = test_keypair();
        let pem = key.to_pkcs1_pem(LineEnding::LF).unwrap();
        assert!(sign(&pem, json!({}), json!({"a": 1})).is_ok());
    }

    #[test]
    fn invalid_pem_returns_controlled_error_without_leaking_input() {
        let err = sign("-----BEGIN PRIVATE KEY-----\nSECRETJUNK\n-----END PRIVATE KEY-----", json!({}), json!({})).unwrap_err();
        assert_eq!(err, "invalid private key PEM");
        assert!(!err.contains("SECRETJUNK"));
        assert!(sign("not a pem", json!({}), json!({})).is_err());
        assert!(sign("", json!({}), json!({})).is_err());
    }

    #[test]
    fn non_object_header_or_claims_is_error() {
        let (_, pem) = test_keypair();
        assert!(sign(&pem, json!([1]), json!({})).is_err());
        assert!(sign(&pem, json!({}), json!("x")).is_err());
    }
}
