use crate::services::session::{self, SessionState};

#[tauri::command]
pub fn save_session(app: tauri::AppHandle, session: SessionState) -> Result<(), String> {
    session::save(&app, &session)
}

#[tauri::command]
pub fn load_session(app: tauri::AppHandle) -> Result<SessionState, String> {
    session::load(&app)
}
