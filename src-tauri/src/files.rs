use serde::Serialize;
use std::io::Read;
use std::path::Path;

pub const MAX_TEXT_FILE_BYTES: u64 = 64 * 1024;

#[derive(Serialize, Debug)]
pub struct TextFile {
    pub name: String,
    pub contents: String,
}

pub fn read_text_file(path: &str) -> Result<TextFile, String> {
    let p = Path::new(path);
    let meta = std::fs::metadata(p).map_err(|e| format!("cannot read file: {e}"))?;
    if !meta.is_file() {
        return Err("not a regular file".to_string());
    }
    if meta.len() > MAX_TEXT_FILE_BYTES {
        return Err("file is too large".to_string());
    }
    // Bounded read: the file may grow between the metadata check and the read.
    let mut buf = Vec::new();
    std::fs::File::open(p)
        .and_then(|f| f.take(MAX_TEXT_FILE_BYTES + 1).read_to_end(&mut buf))
        .map_err(|e| format!("cannot read file: {e}"))?;
    if buf.len() as u64 > MAX_TEXT_FILE_BYTES {
        return Err("file is too large".to_string());
    }
    let contents = String::from_utf8(buf).map_err(|_| "file is not valid UTF-8".to_string())?;
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
        assert!(read_text_file(tmp("missing.json").to_str().unwrap()).is_err());
        let dir = tmp("dir");
        std::fs::create_dir_all(&dir).unwrap();
        assert_eq!(read_text_file(dir.to_str().unwrap()).unwrap_err(), "not a regular file");
        let big = tmp("big.json");
        std::fs::write(&big, vec![b'a'; MAX_TEXT_FILE_BYTES as usize + 1]).unwrap();
        assert_eq!(read_text_file(big.to_str().unwrap()).unwrap_err(), "file is too large");
        let exact = tmp("exact.json");
        std::fs::write(&exact, vec![b'a'; MAX_TEXT_FILE_BYTES as usize]).unwrap();
        assert!(read_text_file(exact.to_str().unwrap()).is_ok());
        let bin = tmp("bin.json");
        std::fs::write(&bin, [0xff, 0xfe]).unwrap();
        assert_eq!(read_text_file(bin.to_str().unwrap()).unwrap_err(), "file is not valid UTF-8");
    }
}
