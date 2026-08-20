mod commands;
mod db;
mod panel;

use std::sync::Mutex;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_nspanel::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            commands::boards_list,
            commands::board_create,
            commands::board_rename,
            commands::board_delete,
            commands::statuses_list,
            commands::status_create,
            commands::status_update,
            commands::status_delete,
            commands::status_reorder,
            commands::tasks_list,
            commands::task_create,
            commands::task_update,
            commands::task_move,
            commands::task_delete,
            commands::task_restore,
            commands::setting_get,
            commands::setting_set,
            commands::palette_hide,
        ])
        .setup(|app| {
            // ~/Library/Application Support/smartTask/smart-task.db
            // app_data_dir() だとバンドル識別子のディレクトリになるので data_dir() を使う
            let db_path = app
                .path()
                .data_dir()?
                .join("smartTask")
                .join("smart-task.db");
            let mut conn = db::open_at(&db_path).map_err(|e| e.to_string())?;
            db::repo::seed_if_empty(&mut conn).map_err(|e| e.to_string())?;
            app.manage(commands::DbState(Mutex::new(conn)));

            // ウィンドウをNSPanel化する
            panel::init_panel(app)?;

            // settingsのhotkeyキー（既定 Alt+Space）でグローバルショートカットを登録する
            panel::register_hotkey(app.handle())?;

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
