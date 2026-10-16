use std::fs::File;
use std::io::Write;
use std::path::PathBuf;
use tauri::Manager;

use crate::services::encoding::{self, Encoding, LineEnding};

fn atomic_write_bytes(path: &str, content: &[u8]) -> Result<(), String> {
    let tmp_path = format!("{path}.mdplus-tmp-{}", std::process::id());

    let mut file = File::create(&tmp_path).map_err(|e| e.to_string())?;
    file.write_all(content).map_err(|e| e.to_string())?;
    file.sync_all().map_err(|e| e.to_string())?;
    drop(file);

    std::fs::rename(&tmp_path, path).map_err(|e| {
        let _ = std::fs::remove_file(&tmp_path);
        e.to_string()
    })
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileMeta {
    pub mtime_ms: f64,
    pub size: u64,
    // Encoding preservation (see services/encoding.rs). The frontend echoes these
    // back on save so a CRLF file stays CRLF, a BOM file keeps its BOM, and a file
    // with no trailing newline isn't given one. lineEnding is "lf" | "crlf".
    pub line_ending: String,
    pub has_bom: bool,
    pub has_trailing_newline: bool,
}

fn meta_of(meta: &std::fs::Metadata, enc: &Encoding) -> FileMeta {
    let mtime_ms = meta
        .modified()
        .ok()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_secs_f64() * 1000.0)
        .unwrap_or(0.0);
    FileMeta {
        mtime_ms,
        size: meta.len(),
        line_ending: match enc.line_ending {
            LineEnding::Lf => "lf".into(),
            LineEnding::Crlf => "crlf".into(),
        },
        has_bom: enc.has_bom,
        has_trailing_newline: enc.has_trailing_newline,
    }
}

/// Parse the encoding metadata the frontend sends back on save. We accept "lf" |
/// "crlf" (defaulting to "lf" for an unrecognized value so a corrupt payload can't
/// panic the command) and treat a missing field as "off" for the booleans.
fn parse_encoding(line_ending: &str, has_bom: bool, has_trailing_newline: bool) -> Encoding {
    let line_ending = match line_ending {
        "crlf" => LineEnding::Crlf,
        _ => LineEnding::Lf,
    };
    Encoding {
        line_ending,
        has_bom,
        has_trailing_newline,
    }
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenFileResult {
    pub content: String,
    pub meta: FileMeta,
}

#[tauri::command]
pub fn save_file(
    path: String,
    content: String,
    line_ending: String,
    has_bom: bool,
    has_trailing_newline: bool,
) -> Result<(), String> {
    let enc = parse_encoding(&line_ending, has_bom, has_trailing_newline);
    let bytes = encoding::encode(&content, &enc);
    atomic_write_bytes(&path, &bytes)
}

#[tauri::command]
pub fn save_file_as(
    path: String,
    content: String,
    line_ending: String,
    has_bom: bool,
    has_trailing_newline: bool,
) -> Result<(), String> {
    let enc = parse_encoding(&line_ending, has_bom, has_trailing_newline);
    let bytes = encoding::encode(&content, &enc);
    atomic_write_bytes(&path, &bytes)
}

#[tauri::command]
pub fn open_file_path(path: String) -> Result<OpenFileResult, String> {
    let raw = std::fs::read(&path).map_err(|e| e.to_string())?;
    let (content, enc) = encoding::decode(&raw);
    let meta = std::fs::metadata(&path).map_err(|e| e.to_string())?;
    Ok(OpenFileResult {
        content,
        meta: meta_of(&meta, &enc),
    })
}

// Stale-write protection: returns the file's current mtime+size so the frontend can
// compare against the baseline it captured at open/save time. If they differ, the
// file changed on disk (git pull, Dropbox, another editor) and a save would clobber
// external changes -- the frontend prompts before writing. The encoding fields on
// the returned meta are populated from a fresh decode so a save-after-reload keeps
// the disk's *current* line-ending/BOM, not the stale baseline.
#[tauri::command]
pub fn stat_file(path: String) -> Result<FileMeta, String> {
    let meta = std::fs::metadata(&path).map_err(|e| e.to_string())?;
    // Read+decode just to populate the encoding fields. This is a second read on top
    // of the open path, but stat is only called on save (rare) and the file is small
    // (it's a markdown editor); the correctness win outweighs the extra read.
    let raw = std::fs::read(&path).map_err(|e| e.to_string())?;
    let (_, enc) = encoding::decode(&raw);
    Ok(meta_of(&meta, &enc))
}

// Scratch buffers (untitled tabs): content is persisted to a per-id file under
// app_config_dir/scratch/ so a crash or accidental "discard" can't silently destroy
// what the user typed. The id is generated on the frontend (crypto.randomUUID) and
// reused across the tab's lifetime; the file is removed when the tab is closed
// cleanly (saved to disk or explicitly discarded after a prompt).
fn scratch_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    let scratch = dir.join("scratch");
    std::fs::create_dir_all(&scratch).map_err(|e| e.to_string())?;
    Ok(scratch)
}

// A scratch id is a uuid; reject anything that isn't [A-Za-z0-9-] so a crafted id
// can't escape the scratch dir via ".." or a path-with-separators.
fn validate_scratch_id(id: &str) -> Result<(), String> {
    if id.is_empty() || id.len() > 64 {
        return Err("invalid scratch id".into());
    }
    if !id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-') {
        return Err("invalid scratch id".into());
    }
    Ok(())
}

#[tauri::command]
pub fn save_scratch(app: tauri::AppHandle, id: String, content: String) -> Result<(), String> {
    validate_scratch_id(&id)?;
    let dir = scratch_dir(&app)?;
    let path = dir.join(&id);
    let path = path.to_string_lossy().into_owned();
    // Scratch buffers are internal recovery state, not user files -- always LF, no BOM.
    atomic_write_bytes(&path, content.as_bytes())
}

#[tauri::command]
pub fn load_scratch(app: tauri::AppHandle, id: String) -> Result<Option<String>, String> {
    validate_scratch_id(&id)?;
    let dir = scratch_dir(&app)?;
    let path = dir.join(&id);
    if !path.exists() {
        return Ok(None);
    }
    std::fs::read_to_string(path)
        .map(Some)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_scratch(app: tauri::AppHandle, id: String) -> Result<(), String> {
    validate_scratch_id(&id)?;
    let dir = scratch_dir(&app)?;
    let path = dir.join(&id);
    if path.exists() {
        std::fs::remove_file(path).map_err(|e| e.to_string())?;
    }
    Ok(())
}
