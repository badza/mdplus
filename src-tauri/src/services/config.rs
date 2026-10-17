use serde::{Deserialize, Serialize};
use tauri::Manager;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppSettings {
    // "auto", or an appearance id: light, paper, fog, dark, ink, moss, dusk.
    pub theme: String,
    pub font_size: u32,
    pub font_family: String,
    pub word_wrap: bool,
    // Write uses the same centered column as Read. Off unless the file says so.
    #[serde(default)]
    pub focus_mode: bool,
    // Write and Split keep marks and blocks as typed text. Defaulted so a
    // settings.json from before Full markdown existed still loads.
    #[serde(default)]
    pub full_markdown: bool,
    pub auto_save: bool,
    pub restore_session: bool,
    pub default_encoding: String,
    pub recent_files_limit: u32,
    // "source" | "split" | "preview". Defaulted so a settings.json written
    // before view modes existed still loads.
    #[serde(default = "default_view_mode")]
    pub view_mode: String,
    // "system", or a frontend catalog id such as "en".
    #[serde(default = "default_locale")]
    pub locale: String,
}

fn default_view_mode() -> String {
    "source".into()
}

fn default_locale() -> String {
    "system".into()
}

impl Default for AppSettings {
    fn default() -> Self {
        AppSettings {
            theme: "auto".into(),
            font_size: 14,
            font_family: "system-ui".into(),
            word_wrap: true,
            focus_mode: false,
            full_markdown: false,
            auto_save: false,
            restore_session: true,
            default_encoding: "utf-8".into(),
            recent_files_limit: 15,
            view_mode: default_view_mode(),
            locale: default_locale(),
        }
    }
}

fn settings_file(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    let dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join("settings.json"))
}

fn normalize(settings: &mut AppSettings) {
    // 0 is what a missing number used to become. The settings stepper starts at 1.
    if settings.recent_files_limit == 0 {
        settings.recent_files_limit = 15;
    } else if settings.recent_files_limit > 50 {
        settings.recent_files_limit = 50;
    }
}

pub fn load(app: &tauri::AppHandle) -> Result<AppSettings, String> {
    let path = settings_file(app)?;
    if !path.exists() {
        return Ok(AppSettings::default());
    }
    let json = std::fs::read_to_string(path).map_err(|e| e.to_string())?;
    let mut settings: AppSettings = serde_json::from_str(&json).map_err(|e| e.to_string())?;
    normalize(&mut settings);
    Ok(settings)
}

pub fn save(app: &tauri::AppHandle, settings: &AppSettings) -> Result<(), String> {
    let path = settings_file(app)?;
    let json = serde_json::to_string_pretty(settings).map_err(|e| e.to_string())?;
    std::fs::write(path, json).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn defaults_round_trip_through_json() {
        let settings = AppSettings::default();
        let json = serde_json::to_string(&settings).expect("serialize");
        let restored: AppSettings = serde_json::from_str(&json).expect("parse");
        assert_eq!(restored.theme, "auto");
        assert_eq!(restored.recent_files_limit, 15);
        assert_eq!(restored.view_mode, "source");
        assert_eq!(restored.locale, "system");
        assert!(!restored.focus_mode);
        assert!(!restored.full_markdown);
    }

    #[test]
    fn settings_without_view_mode_still_parse() {
        let json = r#"{
            "theme": "dark",
            "fontSize": 16,
            "fontFamily": "Georgia",
            "wordWrap": false,
            "autoSave": true,
            "restoreSession": false,
            "defaultEncoding": "utf-8",
            "recentFilesLimit": 8
        }"#;
        let restored: AppSettings = serde_json::from_str(json).expect("parse");
        assert_eq!(restored.view_mode, "source");
        assert_eq!(restored.font_size, 16);
        assert_eq!(restored.theme, "dark");
        assert_eq!(restored.locale, "system");
        assert!(!restored.focus_mode);
        assert!(!restored.full_markdown);
    }

    #[test]
    fn recent_files_limit_zero_becomes_fifteen() {
        let mut settings = AppSettings::default();
        settings.recent_files_limit = 0;
        normalize(&mut settings);
        assert_eq!(settings.recent_files_limit, 15);

        settings.recent_files_limit = 80;
        normalize(&mut settings);
        assert_eq!(settings.recent_files_limit, 50);

        settings.recent_files_limit = 8;
        normalize(&mut settings);
        assert_eq!(settings.recent_files_limit, 8);
    }
}
