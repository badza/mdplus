mod commands;
mod models;
mod services;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            commands::tabs::save_session,
            commands::tabs::load_session,
            commands::file::save_file,
            commands::file::save_file_as,
            commands::file::open_file_path,
            commands::file::stat_file,
            commands::file::save_scratch,
            commands::file::load_scratch,
            commands::file::delete_scratch,
            commands::remote::fetch_markdown_url,
            commands::handoff::write_handoff_file,
            commands::handoff::open_in_terminal,
            commands::settings::get_settings,
            commands::settings::save_settings,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
