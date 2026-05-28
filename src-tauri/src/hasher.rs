// SHA-256 streaming hasher + directory walker.
//
// Walks a project folder and yields a list of `LocalFile` records
// (relative path, SHA-256 hex, size). Hidden/system files are skipped.

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::fs::File;
use std::io::{BufReader, Read};
use std::path::{Path, PathBuf};
use walkdir::WalkDir;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LocalFile {
    /// Path relative to the project root, using forward slashes.
    pub path: String,
    /// SHA-256 hex digest of the file contents.
    pub hash: String,
    /// File size in bytes.
    pub size: u64,
}

/// Hash a single file using a 64 KiB streaming buffer.
pub fn hash_file(path: &Path) -> std::io::Result<String> {
    let file = File::open(path)?;
    let mut reader = BufReader::with_capacity(64 * 1024, file);
    let mut hasher = Sha256::new();
    let mut buf = [0u8; 64 * 1024];
    loop {
        let n = reader.read(&mut buf)?;
        if n == 0 {
            break;
        }
        hasher.update(&buf[..n]);
    }
    Ok(hex::encode(hasher.finalize()))
}

/// Walk a project folder and return every file with its SHA-256 hash and size.
/// Skips:
///   - hidden files (starting with '.')
///   - files inside a `.fuji-sync` cache directory
///   - common DAW backup files (`.bak`, `~`, `.tmp`)
pub fn walk_project(root: &Path) -> std::io::Result<Vec<LocalFile>> {
    let root = root.to_path_buf();
    let mut out: Vec<LocalFile> = Vec::new();

    for entry_res in WalkDir::new(&root).follow_links(false) {
        let entry = match entry_res {
            Ok(e) => e,
            Err(e) => {
                log::warn!("walkdir error: {}", e);
                continue;
            }
        };
        if !entry.file_type().is_file() {
            continue;
        }
        let p: &Path = entry.path();
        if should_skip(p) {
            continue;
        }

        let rel = match p.strip_prefix(&root) {
            Ok(r) => r,
            Err(_) => continue,
        };
        let rel_str = path_to_forward_slash(rel);

        let size = entry.metadata().map(|m| m.len()).unwrap_or(0);
        let hash = match hash_file(p) {
            Ok(h) => h,
            Err(e) => {
                log::warn!("Failed to hash {}: {}", p.display(), e);
                continue;
            }
        };

        out.push(LocalFile {
            path: rel_str,
            hash,
            size,
        });
    }

    Ok(out)
}

fn should_skip(p: &Path) -> bool {
    for comp in p.components() {
        if let Some(name) = comp.as_os_str().to_str() {
            if name.starts_with('.') && name != "." && name != ".." {
                return true;
            }
            if name == ".fuji-sync" {
                return true;
            }
        }
    }
    if let Some(ext) = p.extension().and_then(|e| e.to_str()) {
        let lower = ext.to_ascii_lowercase();
        if matches!(lower.as_str(), "bak" | "tmp" | "swp") {
            return true;
        }
    }
    if let Some(name) = p.file_name().and_then(|n| n.to_str()) {
        if name.ends_with('~') {
            return true;
        }
    }
    false
}

fn path_to_forward_slash(p: &Path) -> String {
    let mut parts: Vec<String> = Vec::new();
    for c in p.components() {
        if let Some(s) = c.as_os_str().to_str() {
            parts.push(s.to_string());
        }
    }
    parts.join("/")
}

/// Read a file's bytes into memory. Used by the sync code when uploading a blob.
pub fn read_file_bytes(path: &Path) -> std::io::Result<Vec<u8>> {
    let mut f = File::open(path)?;
    let mut buf = Vec::new();
    f.read_to_end(&mut buf)?;
    Ok(buf)
}

/// Helper: resolve a `LocalFile.path` (forward-slash relative) back to a real PathBuf.
pub fn resolve_path(root: &Path, rel: &str) -> PathBuf {
    let mut p = root.to_path_buf();
    for seg in rel.split('/') {
        if !seg.is_empty() {
            p.push(seg);
        }
    }
    p
}
