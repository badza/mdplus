use serde::{Deserialize, Serialize};

// Note: cursor is stored as a raw document offset (not spec's {line, col} pair) to
// match how CodeMirror's EditorState.selection already works on the frontend --
// converting to/from line+col would need the document text and buys nothing here.
//
// scratchId: present for untitled tabs whose content is persisted to a per-id file
// under app_config_dir/scratch/ (see commands/file.rs). None for file-backed tabs.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "camelCase")]
pub enum TabKind {
    #[default]
    Document,
    Settings,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TabState {
    pub id: String,
    pub title: String,
    pub local_path: Option<String>,
    pub scratch_id: Option<String>,
    pub content: Option<String>,
    pub dirty: bool,
    pub is_deleted: bool,
    pub cursor: u32,
    pub scroll_position: Option<f64>,
    // Missing on sessions saved before the Settings tab existed.
    #[serde(default)]
    pub kind: TabKind,
    // Set when the note was opened from a URL. The bytes live in the scratch
    // buffer; this is only the link we show and use for relative images.
    #[serde(default)]
    pub source_url: Option<String>,
}
