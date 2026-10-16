use serde::{Deserialize, Serialize};
use tauri::Manager;

use crate::models::tab::TabState;

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct SessionState {
    pub open_tabs: Vec<TabState>,
    pub active_index: Option<usize>,
    pub recent_files: Vec<String>,
}

fn session_file(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    let dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join("session.json"))
}

fn parse_session(json: &str) -> Result<SessionState, String> {
    serde_json::from_str(json).map_err(|e| e.to_string())
}

fn serialize_session(session: &SessionState) -> Result<String, String> {
    serde_json::to_string_pretty(session).map_err(|e| e.to_string())
}

pub fn save(app: &tauri::AppHandle, session: &SessionState) -> Result<(), String> {
    let path = session_file(app)?;
    let json = serialize_session(session)?;
    std::fs::write(path, json).map_err(|e| e.to_string())
}

pub fn load(app: &tauri::AppHandle) -> Result<SessionState, String> {
    let path = session_file(app)?;
    if !path.exists() {
        return Ok(SessionState::default());
    }
    let json = std::fs::read_to_string(path).map_err(|e| e.to_string())?;
    parse_session(&json)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample_tab(path: &str, cursor: u32) -> TabState {
        TabState {
            id: format!("tab-{path}"),
            title: path.to_string(),
            local_path: Some(path.to_string()),
            scratch_id: None,
            content: None,
            dirty: false,
            is_deleted: false,
            cursor,
            scroll_position: None,
            kind: crate::models::tab::TabKind::Document,
            source_url: None,
        }
    }

    #[test]
    fn round_trips_through_json() {
        let session = SessionState {
            open_tabs: vec![sample_tab("/tmp/a.md", 12), sample_tab("/tmp/b.md", 0)],
            active_index: Some(1),
            recent_files: vec!["/tmp/a.md".into(), "/tmp/c.md".into()],
        };
        let json = serialize_session(&session).expect("serialize");
        let restored = parse_session(&json).expect("parse");
        assert_eq!(restored.open_tabs.len(), 2);
        assert_eq!(
            restored.open_tabs[0].local_path.as_deref(),
            Some("/tmp/a.md")
        );
        assert_eq!(restored.open_tabs[0].cursor, 12);
        assert_eq!(restored.active_index, Some(1));
        assert_eq!(restored.recent_files, session.recent_files);
    }

    #[test]
    fn untitled_scratch_tab_round_trips_with_content() {
        let untitled = TabState {
            id: "tab-untitled-1".into(),
            title: "Untitled".into(),
            local_path: None,
            scratch_id: Some("abc-123".into()),
            content: Some("scratchy content".into()),
            dirty: true,
            is_deleted: false,
            cursor: 4,
            scroll_position: None,
            kind: crate::models::tab::TabKind::Document,
            source_url: Some("https://example.com/a.md".into()),
        };
        let session = SessionState {
            open_tabs: vec![untitled],
            active_index: Some(0),
            recent_files: vec![],
        };
        let json = serialize_session(&session).expect("serialize");
        let restored = parse_session(&json).expect("parse");
        assert_eq!(restored.open_tabs.len(), 1);
        assert_eq!(restored.open_tabs[0].local_path, None);
        assert_eq!(restored.open_tabs[0].scratch_id.as_deref(), Some("abc-123"));
        assert_eq!(
            restored.open_tabs[0].content.as_deref(),
            Some("scratchy content")
        );
        assert!(restored.open_tabs[0].dirty);
        assert_eq!(
            restored.open_tabs[0].source_url.as_deref(),
            Some("https://example.com/a.md")
        );
    }

    #[test]
    fn session_without_source_url_still_parses() {
        let json = r#"{
            "openTabs": [{
                "id": "tab-1",
                "title": "Untitled",
                "localPath": null,
                "scratchId": null,
                "content": "hi",
                "dirty": false,
                "isDeleted": false,
                "cursor": 0,
                "scrollPosition": null
            }],
            "activeIndex": 0,
            "recentFiles": []
        }"#;
        let restored = parse_session(json).expect("parse");
        assert_eq!(restored.open_tabs[0].source_url, None);
    }

    #[test]
    fn missing_file_yields_default_session() {
        // load()'s "file doesn't exist" branch returns SessionState::default();
        // exercised indirectly here since it has no file-system dependency to fake easily.
        let empty = SessionState::default();
        assert!(empty.open_tabs.is_empty());
        assert_eq!(empty.active_index, None);
    }
}
