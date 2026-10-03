use keyring::{Entry, Error};
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, BTreeSet};
use std::sync::Mutex;

/// Development builds use their own service, so `tauri dev` never reads or rewrites the credentials
/// of the installed app.
#[cfg(not(debug_assertions))]
const SERVICE: &str = "com.firebaseeditorpro.app";
#[cfg(debug_assertions)]
const SERVICE: &str = "com.firebaseeditorpro.app.dev";
// Windows Credential Manager caps a blob at 2560 bytes and a service-account
// key.json is close to that, so values are split across several entries. (macOS
// keeps all values in one vault item instead; see `Vault`.)
#[cfg_attr(target_os = "macos", allow(dead_code))]
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
            Some((g, c)) => Some(Marker {
                gen: g.parse().ok()?,
                count: c.parse().ok()?,
            }),
            None => Some(Marker {
                gen: 0,
                count: s.parse().ok()?,
            }),
        }
    }
    #[cfg_attr(target_os = "macos", allow(dead_code))]
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
        Some(raw) => Marker::parse(&raw)
            .map(Some)
            .ok_or_else(|| "corrupt keychain entry".to_string()),
    }
}

/// The value of a per-key entry and the marker it was read through (so callers can remove exactly
/// those chunks without reading the marker again).
fn get_with_marker(b: &dyn Backend, key: &str) -> Result<Option<(Marker, String)>, String> {
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
    Ok(Some((m, out)))
}

fn get_with(b: &dyn Backend, key: &str) -> Result<Option<String>, String> {
    Ok(get_with_marker(b, key)?.map(|(_, v)| v))
}

fn remove_chunks(b: &dyn Backend, key: &str, m: Marker) -> Result<(), String> {
    for i in 0..m.count {
        b.remove(&m.chunk(key, i))?;
    }
    Ok(())
}

fn delete_with(b: &dyn Backend, key: &str) -> Result<(), String> {
    // Only an absent marker means "nothing known to delete"; a read failure must
    // abort before removing anything, or the chunks would be orphaned. An
    // unparsable marker is still removed so a corrupt entry can be cleared.
    if let Some(raw) = b.read(key)? {
        if let Some(m) = Marker::parse(&raw) {
            remove_chunks(b, key, m)?;
        }
    }
    b.remove(key)
}

#[cfg_attr(target_os = "macos", allow(dead_code))]
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
#[cfg_attr(target_os = "macos", allow(dead_code))]
fn set_with(b: &dyn Backend, key: &str, value: &str) -> Result<(), String> {
    // Only an absent marker means "no previous value"; any other read failure
    // must abort before writing, or live chunks could be overwritten or orphaned.
    let old = read_marker(b, key)?;
    let parts = split_chunks(value);
    let new = Marker {
        gen: old.map_or(1, |m| m.gen + 1),
        count: parts.len(),
    };

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

/// The legacy macOS keychain asks the user, item by item, whether this app may use an entry, and an
/// unsigned app is identified by its exact build, so each update asks again. The per-key chunked
/// layout meant about six prompts per launch. On macOS every value therefore lives in this ONE item,
/// read once per process and then served from memory: after "Always Allow", one prompt per new build
/// and none on later launches. (Writes need the same authorization; a one-time "Allow" makes each
/// write ask again.) The first time a key of the old per-key layout is moved, each of its old items
/// asks once more. The move is one-way: older builds no longer see the moved values.
const VAULT_ENTRY: &str = "fbep-vault-v1";

#[derive(Default, Serialize, Deserialize)]
struct VaultData {
    /// Secret values by key.
    values: BTreeMap<String, String>,
    /// Keys whose per-key entries from earlier versions were already moved, removed or found absent.
    /// They are never read again, so an old entry cannot prompt on every launch or bring a deleted
    /// value back.
    #[serde(default)]
    migrated: BTreeSet<String>,
    /// Keys whose old per-key copy could not be removed (e.g. the user answered "Allow" rather than
    /// "Always Allow"). Deleting such a key retries the removal and reports a failure, so a full copy
    /// of a credential is never left behind silently.
    #[serde(default)]
    stale: BTreeSet<String>,
}

/// The item as written by the first vault builds: a flat map of values.
#[derive(Deserialize)]
#[serde(untagged)]
enum StoredVault {
    Current(VaultData),
    Flat(BTreeMap<String, String>),
}

impl From<StoredVault> for VaultData {
    fn from(stored: StoredVault) -> Self {
        match stored {
            StoredVault::Current(d) => d,
            StoredVault::Flat(values) => VaultData {
                migrated: values.keys().cloned().collect(),
                values,
                stale: BTreeSet::new(),
            },
        }
    }
}

#[cfg_attr(not(target_os = "macos"), allow(dead_code))]
struct Vault {
    cache: Mutex<Option<VaultData>>,
}

#[cfg_attr(not(target_os = "macos"), allow(dead_code))]
impl Vault {
    const fn new() -> Self {
        Vault {
            cache: Mutex::new(None),
        }
    }

    /// Runs `f` on the in-memory vault, loading the item on first use. The app is single-instance,
    /// so no other process changes the item behind this cache.
    fn with_data<T>(
        &self,
        b: &dyn Backend,
        f: impl FnOnce(&mut VaultData) -> Result<T, String>,
    ) -> Result<T, String> {
        let mut guard = self
            .cache
            .lock()
            .map_err(|_| "keychain cache unavailable".to_string())?;
        if guard.is_none() {
            let loaded = match b.read(VAULT_ENTRY)? {
                None => VaultData::default(),
                Some(raw) => serde_json::from_str::<StoredVault>(&raw)
                    .map(VaultData::from)
                    .map_err(|_| "corrupt keychain entry".to_string())?,
            };
            *guard = Some(loaded);
        }
        f(guard.as_mut().expect("loaded above"))
    }

    fn save(b: &dyn Backend, data: &VaultData) -> Result<(), String> {
        if data.values.is_empty() && data.migrated.is_empty() && data.stale.is_empty() {
            return b.remove(VAULT_ENTRY);
        }
        let raw = serde_json::to_string(data).map_err(|e| format!("keychain error: {e}"))?;
        b.write(VAULT_ENTRY, &raw)
    }

    fn get(&self, b: &dyn Backend, key: &str) -> Result<Option<String>, String> {
        self.with_data(b, |d| {
            if let Some(v) = d.values.get(key) {
                return Ok(Some(v.clone()));
            }
            if d.migrated.contains(key) {
                return Ok(None);
            }
            // First look at this key: move a per-key entry of an earlier version into the vault.
            // An absent entry is answered by the keychain without asking the user.
            match get_with_marker(b, key)? {
                None => {
                    d.migrated.insert(key.to_string());
                    if Self::save(b, d).is_err() {
                        // Only bookkeeping: look again next time.
                        d.migrated.remove(key);
                    }
                    Ok(None)
                }
                Some((marker, v)) => {
                    d.values.insert(key.to_string(), v.clone());
                    d.migrated.insert(key.to_string());
                    if Self::save(b, d).is_err() {
                        // The value was read fine; keep the old entry and retry the move later.
                        d.values.remove(key);
                        d.migrated.remove(key);
                        return Ok(Some(v));
                    }
                    // The vault copy is live; remove the old items, chunks first and the marker last,
                    // so a failure never strands chunks that nothing points to.
                    if remove_chunks(b, key, marker)
                        .and_then(|_| b.remove(key))
                        .is_err()
                    {
                        d.stale.insert(key.to_string());
                        let _ = Self::save(b, d);
                    }
                    Ok(Some(v))
                }
            }
        })
    }

    fn set(&self, b: &dyn Backend, key: &str, value: &str) -> Result<(), String> {
        self.with_data(b, |d| {
            let previous = d.values.insert(key.to_string(), value.to_string());
            let first_time = d.migrated.insert(key.to_string());
            if let Err(e) = Self::save(b, d) {
                match previous {
                    Some(p) => d.values.insert(key.to_string(), p),
                    None => d.values.remove(key),
                };
                if first_time {
                    d.migrated.remove(key);
                }
                return Err(e);
            }
            if first_time && delete_with(b, key).is_err() {
                // A per-key copy left by an earlier version could not be removed: remember it.
                d.stale.insert(key.to_string());
                let _ = Self::save(b, d);
            }
            Ok(())
        })
    }

    /// Deletes the value from the vault and then any per-key copy of an earlier version that may still
    /// exist (first sight of the key, or a copy that could not be removed before): both must go for the
    /// credential to be really deleted. A failure is returned so the UI reports the leftover.
    fn delete(&self, b: &dyn Backend, key: &str) -> Result<(), String> {
        self.with_data(b, |d| {
            let old_copy_possible = !d.migrated.contains(key) || d.stale.contains(key);
            let previous = d.values.remove(key);
            let newly_migrated = d.migrated.insert(key.to_string());
            if previous.is_some() || newly_migrated {
                if let Err(e) = Self::save(b, d) {
                    if let Some(p) = previous {
                        d.values.insert(key.to_string(), p);
                    }
                    if newly_migrated {
                        d.migrated.remove(key);
                    }
                    return Err(e);
                }
            }
            if old_copy_possible {
                if let Err(e) = delete_with(b, key) {
                    if d.stale.insert(key.to_string()) {
                        let _ = Self::save(b, d);
                    }
                    return Err(e);
                }
                if d.stale.remove(key) {
                    let _ = Self::save(b, d);
                }
            }
            Ok(())
        })
    }
}

#[cfg(target_os = "macos")]
static APP_VAULT: Vault = Vault::new();

#[cfg_attr(target_os = "macos", allow(dead_code))]
pub fn get_in(service: &str, key: &str) -> Result<Option<String>, String> {
    get_with(&Keychain { service }, key)
}
#[cfg_attr(target_os = "macos", allow(dead_code))]
pub fn delete_in(service: &str, key: &str) -> Result<(), String> {
    delete_with(&Keychain { service }, key)
}
#[cfg_attr(target_os = "macos", allow(dead_code))]
pub fn set_in(service: &str, key: &str, value: &str) -> Result<(), String> {
    set_with(&Keychain { service }, key, value)
}

#[cfg(target_os = "macos")]
pub fn get(key: &str) -> Result<Option<String>, String> {
    APP_VAULT.get(&Keychain { service: SERVICE }, key)
}
#[cfg(target_os = "macos")]
pub fn set(key: &str, value: &str) -> Result<(), String> {
    APP_VAULT.set(&Keychain { service: SERVICE }, key, value)
}
#[cfg(target_os = "macos")]
pub fn delete(key: &str) -> Result<(), String> {
    APP_VAULT.delete(&Keychain { service: SERVICE }, key)
}

#[cfg(not(target_os = "macos"))]
pub fn get(key: &str) -> Result<Option<String>, String> {
    get_in(SERVICE, key)
}
#[cfg(not(target_os = "macos"))]
pub fn set(key: &str, value: &str) -> Result<(), String> {
    set_in(SERVICE, key, value)
}
#[cfg(not(target_os = "macos"))]
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
        vault_reads: Cell<usize>,
        other_reads: Cell<usize>,
        fail_removes: Cell<bool>,
    }

    impl Backend for Mem {
        fn read(&self, name: &str) -> Result<Option<String>, String> {
            if self.fail_reads.get() {
                return Err("injected read failure".into());
            }
            if name == VAULT_ENTRY {
                self.vault_reads.set(self.vault_reads.get() + 1);
            } else {
                self.other_reads.set(self.other_reads.get() + 1);
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
            if self.fail_removes.get() {
                return Err("injected remove failure".into());
            }
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
            assert_eq!(
                get_with(&b, "k").unwrap().as_deref(),
                Some("previous"),
                "fail_at={fail_at}"
            );
            assert_eq!(
                *b.map.borrow(),
                before,
                "no partial chunks left, fail_at={fail_at}"
            );
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
    fn read_error_on_marker_aborts_delete_without_removing() {
        let b = Mem::default();
        set_with(&b, "k", &"x".repeat(CHUNK_BYTES * 3)).unwrap();
        let before = b.map.borrow().clone();
        b.fail_reads.set(true);
        let err = delete_with(&b, "k").unwrap_err();
        assert!(err.contains("injected read failure"));
        assert_eq!(*b.map.borrow(), before, "marker and chunks untouched");
        b.fail_reads.set(false);
        assert_eq!(
            get_with(&b, "k").unwrap().as_deref(),
            Some("x".repeat(CHUNK_BYTES * 3).as_str())
        );
        delete_with(&b, "k").unwrap();
        assert!(b.map.borrow().is_empty());
    }

    #[test]
    fn delete_of_missing_or_corrupt_marker_succeeds() {
        let b = Mem::default();
        delete_with(&b, "k").unwrap();
        b.write("k", "garbage").unwrap();
        delete_with(&b, "k").unwrap();
        assert!(b.map.borrow().is_empty());
    }

    #[test]
    fn roundtrip_set_get_overwrite_delete() {
        let service = format!("{TEST_SERVICE}.{}", std::process::id());
        let key = "roundtrip-test";
        let big: String = "áb€".repeat(700); // multi-chunk, multibyte
        set_in(&service, key, "first").unwrap();
        assert_eq!(get_in(&service, key).unwrap().as_deref(), Some("first"));
        set_in(&service, key, &big).unwrap();
        assert_eq!(
            get_in(&service, key).unwrap().as_deref(),
            Some(big.as_str())
        );
        delete_in(&service, key).unwrap();
        assert_eq!(get_in(&service, key).unwrap(), None);
        delete_in(&service, key).unwrap();
    }

    #[test]
    fn account_keys_chunk_independently_in_the_store() {
        let b = Mem::default();
        let sa1 = "sa:00000000-0000-4000-8000-000000000001";
        let sa2 = "sa:00000000-0000-4000-8000-000000000002";
        let big: String = "k".repeat(CHUNK_BYTES * 3 + 7);
        set_with(&b, sa1, &big).unwrap();
        set_with(&b, sa2, "second").unwrap();
        set_with(&b, "accounts", "{\"version\":1}").unwrap();
        assert_eq!(get_with(&b, sa1).unwrap().as_deref(), Some(big.as_str()));
        assert_eq!(get_with(&b, sa2).unwrap().as_deref(), Some("second"));
        delete_with(&b, sa1).unwrap();
        assert_eq!(get_with(&b, sa1).unwrap(), None);
        assert_eq!(get_with(&b, sa2).unwrap().as_deref(), Some("second"));
        assert_eq!(
            get_with(&b, "accounts").unwrap().as_deref(),
            Some("{\"version\":1}")
        );
        assert!(
            b.map.borrow().keys().all(|k| !k.starts_with(sa1)),
            "no leftover chunks of the deleted account"
        );
    }

    /// Counts reads of the vault item, to prove it is read once per process.
    fn vault_reads(b: &Mem) -> usize {
        b.vault_reads.get()
    }

    #[test]
    fn vault_is_read_once_and_then_served_from_memory() {
        let b = Mem::default();
        let v = Vault::new();
        v.set(&b, "accounts", "{\"version\":1}").unwrap();
        v.set(&b, "sa:1", &"k".repeat(CHUNK_BYTES * 3)).unwrap();
        let fresh = Vault::new(); // a new process
        b.vault_reads.set(0);
        assert_eq!(
            fresh.get(&b, "accounts").unwrap().as_deref(),
            Some("{\"version\":1}")
        );
        assert_eq!(
            fresh.get(&b, "sa:1").unwrap().map(|s| s.len()),
            Some(CHUNK_BYTES * 3)
        );
        assert_eq!(
            fresh.get(&b, "sa:1").unwrap().map(|s| s.len()),
            Some(CHUNK_BYTES * 3)
        );
        assert_eq!(vault_reads(&b), 1, "one keychain item read per launch");
        let names: Vec<String> = b.map.borrow().keys().cloned().collect();
        assert_eq!(
            names,
            vec![VAULT_ENTRY.to_string()],
            "everything lives in one item"
        );
    }

    #[test]
    fn vault_moves_per_key_entries_of_earlier_versions_and_deletes_them() {
        let b = Mem::default();
        set_with(&b, "accounts", "{\"version\":1}").unwrap();
        set_with(&b, "sa:1", &"k".repeat(CHUNK_BYTES * 3 + 7)).unwrap();
        let v = Vault::new();
        assert_eq!(
            v.get(&b, "accounts").unwrap().as_deref(),
            Some("{\"version\":1}")
        );
        assert_eq!(
            v.get(&b, "sa:1").unwrap().map(|s| s.len()),
            Some(CHUNK_BYTES * 3 + 7)
        );
        assert_eq!(v.get(&b, "service-account").unwrap(), None);
        let names: Vec<String> = b.map.borrow().keys().cloned().collect();
        assert_eq!(
            names,
            vec![VAULT_ENTRY.to_string()],
            "old chunks removed after the move"
        );
        let next = Vault::new();
        assert_eq!(
            next.get(&b, "sa:1").unwrap().map(|s| s.len()),
            Some(CHUNK_BYTES * 3 + 7)
        );
    }

    #[test]
    fn vault_delete_removes_the_value_and_any_old_per_key_copy() {
        let b = Mem::default();
        let v = Vault::new();
        v.set(&b, "sa:1", "one").unwrap();
        v.set(&b, "sa:2", "two").unwrap();
        set_with(&b, "sa:3", &"x".repeat(CHUNK_BYTES * 2)).unwrap(); // never migrated
        v.delete(&b, "sa:1").unwrap();
        v.delete(&b, "sa:3").unwrap();
        assert_eq!(v.get(&b, "sa:1").unwrap(), None);
        assert_eq!(v.get(&b, "sa:3").unwrap(), None);
        assert!(
            b.map.borrow().keys().all(|k| !k.starts_with("sa:3")),
            "old chunks gone"
        );
        assert_eq!(
            Vault::new().get(&b, "sa:2").unwrap().as_deref(),
            Some("two")
        );
        v.delete(&b, "sa:2").unwrap();
        let names: Vec<String> = b.map.borrow().keys().cloned().collect();
        assert_eq!(names, vec![VAULT_ENTRY.to_string()]);
        let raw = b.read(VAULT_ENTRY).unwrap().unwrap();
        assert!(
            !raw.contains("one") && !raw.contains("two"),
            "no secret left: {raw}"
        );
    }

    #[test]
    fn vault_never_rereads_or_resurrects_an_old_entry_it_could_not_delete() {
        let b = Mem::default();
        set_with(&b, "service-account", &"x".repeat(CHUNK_BYTES * 2)).unwrap();
        let v = Vault::new();
        b.fail_removes.set(true); // e.g. the user denied the delete
        assert!(v.get(&b, "service-account").unwrap().is_some());
        b.fail_removes.set(false);
        v.delete(&b, "service-account").unwrap();
        let next = Vault::new(); // next launch
        b.other_reads.set(0);
        assert_eq!(
            next.get(&b, "service-account").unwrap(),
            None,
            "not brought back"
        );
        assert_eq!(next.get(&b, "accounts").unwrap(), None);
        assert_eq!(next.get(&b, "accounts").unwrap(), None);
        assert_eq!(
            b.other_reads.get(),
            1,
            "old layout checked once, for the new key only"
        );
    }

    #[test]
    fn vault_retries_an_old_copy_it_could_not_remove_and_reports_a_failed_delete() {
        let b = Mem::default();
        set_with(&b, "sa:1", &"k".repeat(CHUNK_BYTES * 3)).unwrap();
        let v = Vault::new();
        b.fail_removes.set(true); // "Allow" instead of "Always Allow": old items cannot be deleted
        assert!(v.get(&b, "sa:1").unwrap().is_some());
        assert!(
            b.read("sa:1").unwrap().is_some(),
            "marker kept while its chunks remain"
        );
        // Removing the account still cannot delete the old copy: that must be reported.
        assert!(Vault::new().delete(&b, "sa:1").is_err());
        b.fail_removes.set(false);
        let next = Vault::new();
        next.delete(&b, "sa:1").unwrap();
        assert!(
            b.map.borrow().keys().all(|k| !k.starts_with("sa:1")),
            "old copy finally removed"
        );
        assert_eq!(Vault::new().get(&b, "sa:1").unwrap(), None);
    }

    #[test]
    fn vault_reads_the_flat_shape_of_the_first_vault_builds() {
        let b = Mem::default();
        b.write(VAULT_ENTRY, "{\"accounts\":\"idx\",\"sa:1\":\"secret\"}")
            .unwrap();
        set_with(&b, "sa:1", "older per-key copy").unwrap();
        let v = Vault::new();
        assert_eq!(v.get(&b, "sa:1").unwrap().as_deref(), Some("secret"));
        v.set(&b, "sa:2", "two").unwrap();
        let raw = b.read(VAULT_ENTRY).unwrap().unwrap();
        assert!(raw.contains("\"values\""), "rewritten in the current shape");
        assert_eq!(
            Vault::new().get(&b, "accounts").unwrap().as_deref(),
            Some("idx")
        );
    }

    #[test]
    fn vault_returns_a_value_it_read_even_when_moving_it_fails() {
        let b = Mem::default();
        set_with(&b, "sa:1", "secret").unwrap();
        let before = b.map.borrow().clone();
        let v = Vault::new();
        b.writes.set(0);
        b.fail_on_write.set(Some(1));
        assert_eq!(v.get(&b, "sa:1").unwrap().as_deref(), Some("secret"));
        assert_eq!(*b.map.borrow(), before, "old entry kept for a later retry");
        b.fail_on_write.set(None);
        assert_eq!(v.get(&b, "sa:1").unwrap().as_deref(), Some("secret"));
        assert!(b.read("sa:1").unwrap().is_none(), "moved on the retry");
    }

    #[test]
    fn vault_keeps_memory_and_keychain_consistent_when_a_write_fails() {
        let b = Mem::default();
        let v = Vault::new();
        v.set(&b, "k", "previous").unwrap();
        b.writes.set(0);
        b.fail_on_write.set(Some(1));
        assert!(v.set(&b, "k", "new").is_err());
        assert_eq!(v.get(&b, "k").unwrap().as_deref(), Some("previous"));
        assert_eq!(
            Vault::new().get(&b, "k").unwrap().as_deref(),
            Some("previous")
        );
    }

    #[test]
    fn vault_refuses_a_corrupt_item_without_overwriting_it() {
        let b = Mem::default();
        b.write(VAULT_ENTRY, "not json").unwrap();
        let v = Vault::new();
        assert!(v.get(&b, "k").unwrap_err().contains("corrupt"));
        assert!(v.set(&b, "k", "x").is_err());
        assert_eq!(b.read(VAULT_ENTRY).unwrap().as_deref(), Some("not json"));
    }

    /// Removes the test entries even when an assertion fails.
    #[cfg(target_os = "macos")]
    struct CleanUp<'a>(&'a Keychain<'a>, &'a [&'a str]);
    #[cfg(target_os = "macos")]
    impl Drop for CleanUp<'_> {
        fn drop(&mut self) {
            for key in self.1 {
                let _ = delete_with(self.0, key);
            }
            let _ = self.0.remove(VAULT_ENTRY);
        }
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn vault_roundtrip_in_the_real_keychain() {
        // Own service per test process, so concurrent `cargo test` runs never share the item.
        let service = format!("{TEST_SERVICE}.vault.{}", std::process::id());
        let k = Keychain { service: &service };
        let _cleanup = CleanUp(&k, &["vault-a", "vault-b"]);
        let v = Vault::new();
        let big: String = "áb€".repeat(900);
        v.set(&k, "vault-a", &big).unwrap();
        v.set(&k, "vault-b", "second").unwrap();
        let fresh = Vault::new();
        assert_eq!(
            fresh.get(&k, "vault-a").unwrap().as_deref(),
            Some(big.as_str())
        );
        fresh.delete(&k, "vault-a").unwrap();
        fresh.delete(&k, "vault-b").unwrap();
        assert_eq!(Vault::new().get(&k, "vault-a").unwrap(), None);
        let raw = k.read(VAULT_ENTRY).unwrap().unwrap_or_default();
        assert!(
            !raw.contains("second"),
            "deleted values are gone from the item"
        );
    }

    #[test]
    fn get_missing_is_none() {
        assert_eq!(get_in(TEST_SERVICE, "never-set-key").unwrap(), None);
    }
}
