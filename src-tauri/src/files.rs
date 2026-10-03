use serde::Serialize;
use std::io::Read;
use std::path::Path;

pub const MAX_TEXT_FILE_BYTES: u64 = 64 * 1024;
/// Import files (Firestore exports) are far larger than a key.json.
pub const MAX_IMPORT_FILE_BYTES: u64 = 32 * 1024 * 1024;

// Stable error codes: the UI maps them to translated messages (src/platform/errors.ts).
pub const ERR_READ: &str = "file_read_failed";
pub const ERR_WRITE: &str = "file_write_failed";
pub const ERR_NOT_REGULAR: &str = "file_not_regular";
pub const ERR_TOO_LARGE: &str = "file_too_large";
pub const ERR_NOT_UTF8: &str = "file_not_utf8";

#[derive(Serialize, Debug)]
pub struct TextFile {
    pub name: String,
    pub contents: String,
}

pub fn read_text_file(path: &str) -> Result<TextFile, String> {
    read_text_file_limited(path, MAX_TEXT_FILE_BYTES)
}

pub fn read_import_file(path: &str) -> Result<TextFile, String> {
    read_text_file_limited(path, MAX_IMPORT_FILE_BYTES)
}

/// Writes a user-chosen export file (path comes from the native save dialog).
/// Exports share the import limit so every file this app writes can be read back.
pub fn write_text_file(path: &str, contents: &str) -> Result<(), String> {
    if contents.len() as u64 > MAX_IMPORT_FILE_BYTES {
        return Err(ERR_TOO_LARGE.to_string());
    }
    std::fs::write(path, contents).map_err(|_| ERR_WRITE.to_string())
}

fn read_text_file_limited(path: &str, max_bytes: u64) -> Result<TextFile, String> {
    let p = Path::new(path);
    let meta = std::fs::metadata(p).map_err(|_| ERR_READ.to_string())?;
    if !meta.is_file() {
        return Err(ERR_NOT_REGULAR.to_string());
    }
    if meta.len() > max_bytes {
        return Err(ERR_TOO_LARGE.to_string());
    }
    // Bounded read: the file may grow between the metadata check and the read.
    let mut buf = Vec::new();
    std::fs::File::open(p)
        .and_then(|f| f.take(max_bytes + 1).read_to_end(&mut buf))
        .map_err(|_| ERR_READ.to_string())?;
    if buf.len() as u64 > max_bytes {
        return Err(ERR_TOO_LARGE.to_string());
    }
    let contents = String::from_utf8(buf).map_err(|_| ERR_NOT_UTF8.to_string())?;
    let name = p
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_default();
    Ok(TextFile { name, contents })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tmp(name: &str) -> std::path::PathBuf {
        let d = std::env::temp_dir().join(format!("fbep-files-test-{}", std::process::id()));
        std::fs::create_dir_all(&d).unwrap();
        d.join(name)
    }

    #[test]
    fn reads_name_and_contents() {
        let p = tmp("ok.json");
        std::fs::write(&p, "{\"a\":1}").unwrap();
        let f = read_text_file(p.to_str().unwrap()).unwrap();
        assert_eq!(f.name, "ok.json");
        assert_eq!(f.contents, "{\"a\":1}");
    }

    #[test]
    fn rejects_missing_directory_oversize_and_non_utf8() {
        assert_eq!(
            read_text_file(tmp("missing.json").to_str().unwrap()).unwrap_err(),
            ERR_READ
        );
        let dir = tmp("dir");
        std::fs::create_dir_all(&dir).unwrap();
        assert_eq!(
            read_text_file(dir.to_str().unwrap()).unwrap_err(),
            ERR_NOT_REGULAR
        );
        let big = tmp("big.json");
        std::fs::write(&big, vec![b'a'; MAX_TEXT_FILE_BYTES as usize + 1]).unwrap();
        assert_eq!(
            read_text_file(big.to_str().unwrap()).unwrap_err(),
            ERR_TOO_LARGE
        );
        let exact = tmp("exact.json");
        std::fs::write(&exact, vec![b'a'; MAX_TEXT_FILE_BYTES as usize]).unwrap();
        assert!(read_text_file(exact.to_str().unwrap()).is_ok());
        let bin = tmp("bin.json");
        std::fs::write(&bin, [0xff, 0xfe]).unwrap();
        assert_eq!(
            read_text_file(bin.to_str().unwrap()).unwrap_err(),
            ERR_NOT_UTF8
        );
    }

    #[test]
    fn import_reader_accepts_larger_files_and_writer_round_trips() {
        let big = tmp("import-big.json");
        std::fs::write(&big, vec![b'a'; MAX_TEXT_FILE_BYTES as usize + 1]).unwrap();
        assert!(read_import_file(big.to_str().unwrap()).is_ok());
        let out = tmp("out.json");
        write_text_file(out.to_str().unwrap(), "{\"é\":1}").unwrap();
        assert_eq!(
            read_text_file(out.to_str().unwrap()).unwrap().contents,
            "{\"é\":1}"
        );
        assert_eq!(
            write_text_file(tmp("no/such/dir/x.json").to_str().unwrap(), "x").unwrap_err(),
            ERR_WRITE
        );
    }

    #[test]
    fn writer_rejects_contents_over_the_import_limit_without_creating_a_file() {
        let out = tmp("too-big-out.json");
        let _ = std::fs::remove_file(&out);
        let big = "a".repeat(MAX_IMPORT_FILE_BYTES as usize + 1);
        assert_eq!(
            write_text_file(out.to_str().unwrap(), &big).unwrap_err(),
            ERR_TOO_LARGE
        );
        assert!(!out.exists());
    }
}
