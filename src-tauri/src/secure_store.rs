use keyring::{Entry, Error};

const SERVICE: &str = "com.firebaseeditorpro.app";
// Windows Credential Manager caps a blob at 2560 bytes and a service-account
// key.json is close to that, so values are split across several entries.
const CHUNK_BYTES: usize = 1000;

/// Raw entry storage, abstracted so failures can be injected in tests.
trait Backend {
    fn read(&self, name: &str) -> Result<Option<String>, String>;
    fn write(&self, name: &str, value: &str) -> Result<(), String>;
    fn remove(&self, name: &str) -> Result<(), String>;
}

struct Keychain<'a> {
    service: &'a str,
}

impl Keychain<'_> {
    fn entry(&self, name: &str) -> Result<Entry, String> {
        Entry::new(self.service, name).map_err(|e| format!("keychain error: {e}"))
    }
}

impl Backend for Keychain<'_> {
    fn read(&self, name: &str) -> Result<Option<String>, String> {
        match self.entry(name)?.get_password() {
            Ok(v) => Ok(Some(v)),
            Err(Error::NoEntry) => Ok(None),
            Err(e) => Err(format!("keychain error: {e}")),
        }
    }
    fn write(&self, name: &str, value: &str) -> Result<(), String> {
        self.entry(name)?
            .set_password(value)
            .map_err(|e| format!("keychain error: {e}"))
    }
    fn remove(&self, name: &str) -> Result<(), String> {
        match self.entry(name)?.delete_credential() {
            Ok(()) | Err(Error::NoEntry) => Ok(()),
            Err(e) => Err(format!("keychain error: {e}")),
        }
    }
}

/// The marker entry stored under `key`. Chunks live under `key#gen#i`, so a
/// replacement never overwrites the chunks the current marker points to.
/// Legacy markers are a bare count with chunks under `key#i` (generation 0).
#[derive(Clone, Copy)]
struct Marker {
    gen: u64,
    count: usize,
}

impl Marker {
    fn parse(s: &str) -> Option<Marker> {
        match s.split_once(':') {
            Some((g, c)) => Some(Marker { gen: g.parse().ok()?, count: c.parse().ok()? }),
            None => Some(Marker { gen: 0, count: s.parse().ok()? }),
        }
    }
    fn encode(&self) -> String {
        format!("{}:{}", self.gen, self.count)
    }
    fn chunk(&self, key: &str, i: usize) -> String {
        if self.gen == 0 {
            format!("{key}#{i}")
        } else {
            format!("{key}#{}#{i}", self.gen)
        }
    }
}

fn read_marker(b: &dyn Backend, key: &str) -> Result<Option<Marker>, String> {
    match b.read(key)? {
        None => Ok(None),
        Some(raw) => Marker::parse(&raw).map(Some).ok_or_else(|| "corrupt keychain entry".to_string()),
    }
}

fn get_with(b: &dyn Backend, key: &str) -> Result<Option<String>, String> {
    let Some(m) = read_marker(b, key)? else {
        return Ok(None);
    };
    let mut out = String::new();
    for i in 0..m.count {
        match b.read(&m.chunk(key, i))? {
            Some(part) => out.push_str(&part),
            None => return Err("corrupt keychain entry".to_string()),
        }
    }
    Ok(Some(out))
}

fn remove_chunks(b: &dyn Backend, key: &str, m: Marker) -> Result<(), String> {
    for i in 0..m.count {
        b.remove(&m.chunk(key, i))?;
    }
    Ok(())
}

fn delete_with(b: &dyn Backend, key: &str) -> Result<(), String> {
    if let Ok(Some(m)) = read_marker(b, key) {
        remove_chunks(b, key, m)?;
    }
    b.remove(key)
}

fn split_chunks(value: &str) -> Vec<&str> {
    let mut parts = Vec::new();
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
    parts
}

/// Writes the new chunks first, switches the marker, and only then removes the
/// old chunks. Any failure before the switch leaves the previous value intact.
fn set_with(b: &dyn Backend, key: &str, value: &str) -> Result<(), String> {
    // Only an absent marker means "no previous value"; any other read failure
    // must abort before writing, or live chunks could be overwritten or orphaned.
    let old = read_marker(b, key)?;
    let parts = split_chunks(value);
    let new = Marker { gen: old.map_or(1, |m| m.gen + 1), count: parts.len() };

    let written = (|| -> Result<(), String> {
        for (i, part) in parts.iter().enumerate() {
            b.write(&new.chunk(key, i), part)?;
        }
        b.write(key, &new.encode())
    })();
    if let Err(e) = written {
        // Best-effort cleanup of partial new chunks; the old value was never touched.
        for i in 0..new.count {
            let _ = b.remove(&new.chunk(key, i));
        }
        return Err(e);
    }
    if let Some(old) = old {
        // The new value is already live; leftover old chunks are only garbage.
        let _ = remove_chunks(b, key, old);
    }
    Ok(())
}

pub fn get_in(service: &str, key: &str) -> Result<Option<String>, String> {
    get_with(&Keychain { service }, key)
}
pub fn delete_in(service: &str, key: &str) -> Result<(), String> {
    delete_with(&Keychain { service }, key)
}
pub fn set_in(service: &str, key: &str, value: &str) -> Result<(), String> {
    set_with(&Keychain { service }, key, value)
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
    use std::cell::{Cell, RefCell};
    use std::collections::HashMap;

    const TEST_SERVICE: &str = "com.firebaseeditorpro.app.test";

    #[derive(Default)]
    struct Mem {
        map: RefCell<HashMap<String, String>>,
        writes: Cell<usize>,
        fail_on_write: Cell<Option<usize>>,
        fail_reads: Cell<bool>,
    }

    impl Backend for Mem {
        fn read(&self, name: &str) -> Result<Option<String>, String> {
            if self.fail_reads.get() {
                return Err("injected read failure".into());
            }
            Ok(self.map.borrow().get(name).cloned())
        }
        fn write(&self, name: &str, value: &str) -> Result<(), String> {
            let n = self.writes.get() + 1;
            self.writes.set(n);
            if self.fail_on_write.get() == Some(n) {
                return Err("injected write failure".into());
            }
            self.map.borrow_mut().insert(name.into(), value.into());
            Ok(())
        }
        fn remove(&self, name: &str) -> Result<(), String> {
            self.map.borrow_mut().remove(name);
            Ok(())
        }
    }

    #[test]
    fn overwrite_keeps_new_data_and_removes_leftover_chunks() {
        let b = Mem::default();
        let big: String = "áb€".repeat(700);
        set_with(&b, "k", &big).unwrap();
        let chunks_big = b.map.borrow().len();
        assert!(chunks_big > 3);
        set_with(&b, "k", "small").unwrap();
        assert_eq!(get_with(&b, "k").unwrap().as_deref(), Some("small"));
        assert_eq!(b.map.borrow().len(), 2, "marker + one chunk only");
        set_with(&b, "k", &big).unwrap();
        assert_eq!(get_with(&b, "k").unwrap().as_deref(), Some(big.as_str()));
        assert_eq!(b.map.borrow().len(), chunks_big);
        delete_with(&b, "k").unwrap();
        assert!(b.map.borrow().is_empty());
    }

    #[test]
    fn reads_and_replaces_legacy_unversioned_entries() {
        let b = Mem::default();
        b.write("k#0", "old").unwrap();
        b.write("k", "1").unwrap();
        assert_eq!(get_with(&b, "k").unwrap().as_deref(), Some("old"));
        set_with(&b, "k", "new").unwrap();
        assert_eq!(get_with(&b, "k").unwrap().as_deref(), Some("new"));
        assert!(b.read("k#0").unwrap().is_none());
    }

    #[test]
    fn failed_write_keeps_previous_value_and_cleans_partial_chunks() {
        let big: String = "x".repeat(CHUNK_BYTES * 3);
        for fail_at in 1..=4 {
            let b = Mem::default();
            set_with(&b, "k", "previous").unwrap();
            let before = b.map.borrow().clone();
            b.writes.set(0);
            b.fail_on_write.set(Some(fail_at));
            assert!(set_with(&b, "k", &big).is_err());
            assert_eq!(get_with(&b, "k").unwrap().as_deref(), Some("previous"), "fail_at={fail_at}");
            assert_eq!(*b.map.borrow(), before, "no partial chunks left, fail_at={fail_at}");
        }
    }

    #[test]
    fn read_error_on_marker_aborts_without_writing() {
        let b = Mem::default();
        set_with(&b, "k", "previous").unwrap();
        let before = b.map.borrow().clone();
        b.writes.set(0);
        b.fail_reads.set(true);
        let err = set_with(&b, "k", &"x".repeat(CHUNK_BYTES * 2)).unwrap_err();
        assert!(err.contains("injected read failure"));
        assert_eq!(b.writes.get(), 0, "nothing written");
        assert_eq!(*b.map.borrow(), before, "previous entries untouched");
        b.fail_reads.set(false);
        assert_eq!(get_with(&b, "k").unwrap().as_deref(), Some("previous"));
    }

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
