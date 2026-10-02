use keyring::{Entry, Error};

const SERVICE: &str = "com.firebaseeditorpro.app";
// Windows Credential Manager caps a blob at 2560 bytes and a service-account
// key.json is close to that, so values are split across several entries.
const CHUNK_BYTES: usize = 1000;

fn entry(service: &str, name: &str) -> Result<Entry, String> {
    Entry::new(service, name).map_err(|e| format!("keychain error: {e}"))
}

fn read(service: &str, name: &str) -> Result<Option<String>, String> {
    match entry(service, name)?.get_password() {
        Ok(v) => Ok(Some(v)),
        Err(Error::NoEntry) => Ok(None),
        Err(e) => Err(format!("keychain error: {e}")),
    }
}

fn remove(service: &str, name: &str) -> Result<(), String> {
    match entry(service, name)?.delete_credential() {
        Ok(()) | Err(Error::NoEntry) => Ok(()),
        Err(e) => Err(format!("keychain error: {e}")),
    }
}

fn chunk_name(key: &str, i: usize) -> String {
    format!("{key}#{i}")
}

pub fn get_in(service: &str, key: &str) -> Result<Option<String>, String> {
    let Some(count) = read(service, key)? else {
        return Ok(None);
    };
    let count: usize = count.parse().map_err(|_| "corrupt keychain entry".to_string())?;
    let mut out = String::new();
    for i in 0..count {
        match read(service, &chunk_name(key, i))? {
            Some(part) => out.push_str(&part),
            None => return Err("corrupt keychain entry".to_string()),
        }
    }
    Ok(Some(out))
}

pub fn delete_in(service: &str, key: &str) -> Result<(), String> {
    if let Some(count) = read(service, key)? {
        if let Ok(count) = count.parse::<usize>() {
            for i in 0..count {
                remove(service, &chunk_name(key, i))?;
            }
        }
    }
    remove(service, key)
}

pub fn set_in(service: &str, key: &str, value: &str) -> Result<(), String> {
    delete_in(service, key)?;
    let mut parts: Vec<&str> = Vec::new();
    let mut rest = value;
    while !rest.is_empty() {
        let mut end = CHUNK_BYTES.min(rest.len());
        while !rest.is_char_boundary(end) {
            end -= 1;
        }
        let (head, tail) = rest.split_at(end);
        parts.push(head);
        rest = tail;
    }
    for (i, part) in parts.iter().enumerate() {
        entry(service, &chunk_name(key, i))?
            .set_password(part)
            .map_err(|e| format!("keychain error: {e}"))?;
    }
    entry(service, key)?
        .set_password(&parts.len().to_string())
        .map_err(|e| format!("keychain error: {e}"))
}

pub fn get(key: &str) -> Result<Option<String>, String> {
    get_in(SERVICE, key)
}
pub fn set(key: &str, value: &str) -> Result<(), String> {
    set_in(SERVICE, key, value)
}
pub fn delete(key: &str) -> Result<(), String> {
    delete_in(SERVICE, key)
}

#[cfg(test)]
mod tests {
    use super::*;

    const TEST_SERVICE: &str = "com.firebaseeditorpro.app.test";

    #[test]
    fn roundtrip_set_get_overwrite_delete() {
        let key = "roundtrip-test";
        let big: String = "áb€".repeat(700); // multi-chunk, multibyte
        set_in(TEST_SERVICE, key, "first").unwrap();
        assert_eq!(get_in(TEST_SERVICE, key).unwrap().as_deref(), Some("first"));
        set_in(TEST_SERVICE, key, &big).unwrap();
        assert_eq!(get_in(TEST_SERVICE, key).unwrap().as_deref(), Some(big.as_str()));
        delete_in(TEST_SERVICE, key).unwrap();
        assert_eq!(get_in(TEST_SERVICE, key).unwrap(), None);
        delete_in(TEST_SERVICE, key).unwrap();
    }

    #[test]
    fn get_missing_is_none() {
        assert_eq!(get_in(TEST_SERVICE, "never-set-key").unwrap(), None);
    }
}
