//! One save at a time. Overlapping saves used to share one temp file and could
//! rename a half-written note into place.

use std::fs::{self, File};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

static WRITE_LOCK: Mutex<()> = Mutex::new(());

/// Write `content` to `path` by flushing a temp file and renaming it into place.
/// A symlink is followed, and an existing file keeps its mode.
pub fn atomic_write(path: &Path, content: &[u8]) -> Result<(), String> {
    let _guard = WRITE_LOCK.lock().unwrap_or_else(|err| err.into_inner());
    let target = resolve_target(path);
    let tmp_path = tmp_for(&target);

    let mut file = File::create(&tmp_path).map_err(|e| e.to_string())?;
    if let Err(err) = file.write_all(content).and_then(|_| file.sync_all()) {
        let _ = fs::remove_file(&tmp_path);
        return Err(err.to_string());
    }
    drop(file);

    if let Ok(meta) = fs::metadata(&target) {
        let _ = fs::set_permissions(&tmp_path, meta.permissions());
    }

    fs::rename(&tmp_path, &target).map_err(|err| {
        let _ = fs::remove_file(&tmp_path);
        err.to_string()
    })
}

fn resolve_target(path: &Path) -> PathBuf {
    match fs::symlink_metadata(path) {
        Ok(meta) if meta.file_type().is_symlink() => {
            fs::canonicalize(path).unwrap_or_else(|_| path.to_path_buf())
        }
        _ => path.to_path_buf(),
    }
}

fn tmp_for(target: &Path) -> PathBuf {
    let mut name = target
        .file_name()
        .map(|part| part.to_os_string())
        .unwrap_or_else(|| "note".into());
    name.push(format!(".mdplus-tmp-{}", std::process::id()));
    target.with_file_name(name)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicU64, Ordering};

    fn test_dir(name: &str) -> PathBuf {
        static N: AtomicU64 = AtomicU64::new(0);
        let n = N.fetch_add(1, Ordering::Relaxed);
        let dir = std::env::temp_dir().join(format!("mdplus-{name}-{}-{n}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn writes_a_new_file() {
        let dir = test_dir("new");
        let path = dir.join("note.md");
        atomic_write(&path, b"hello").unwrap();
        assert_eq!(fs::read(&path).unwrap(), b"hello");
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn overlapping_writes_leave_a_whole_file() {
        let dir = test_dir("overlap");
        let path = dir.join("note.md");
        let a = "A".repeat(200_000);
        let b = "B".repeat(200_000);
        let left = path.clone();
        let right = path.clone();
        let a_bytes = a.clone();
        let b_bytes = b.clone();
        let t1 = std::thread::spawn(move || atomic_write(&left, a_bytes.as_bytes()));
        let t2 = std::thread::spawn(move || atomic_write(&right, b_bytes.as_bytes()));
        t1.join().unwrap().unwrap();
        t2.join().unwrap().unwrap();
        let got = fs::read(&path).unwrap();
        assert!(got == a.as_bytes() || got == b.as_bytes());
        let _ = fs::remove_dir_all(&dir);
    }

    #[cfg(unix)]
    #[test]
    fn keeps_the_existing_mode() {
        use std::os::unix::fs::PermissionsExt;
        let dir = test_dir("mode");
        let path = dir.join("note.md");
        fs::write(&path, b"old").unwrap();
        let mut perms = fs::metadata(&path).unwrap().permissions();
        perms.set_mode(0o600);
        fs::set_permissions(&path, perms).unwrap();
        atomic_write(&path, b"new").unwrap();
        assert_eq!(fs::read(&path).unwrap(), b"new");
        assert_eq!(
            fs::metadata(&path).unwrap().permissions().mode() & 0o777,
            0o600
        );
        let _ = fs::remove_dir_all(&dir);
    }

    #[cfg(unix)]
    #[test]
    fn follows_a_symlink() {
        use std::os::unix::fs::symlink;
        let dir = test_dir("link");
        let real = dir.join("real.md");
        let link = dir.join("link.md");
        fs::write(&real, b"old").unwrap();
        symlink(&real, &link).unwrap();
        atomic_write(&link, b"new").unwrap();
        assert_eq!(fs::read(&real).unwrap(), b"new");
        assert!(fs::symlink_metadata(&link)
            .unwrap()
            .file_type()
            .is_symlink());
        let _ = fs::remove_dir_all(&dir);
    }
}
