mod commands;
mod db;
mod panel;

use std::sync::Mutex;

use tauri::Manager;

fn avoliq_database_path(data_dir: &std::path::Path) -> std::path::PathBuf {
    data_dir.join("Avoliq").join("avoliq.db")
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // single-instance は最初に登録しないと正しく動かない
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            // 2つ目のインスタンスが起動されたら、既存のパレットを出すだけにする
            panel::show_panel(app);
        }))
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
            commands::tags_list,
            commands::tag_create,
            commands::tag_rename,
            commands::tag_delete,
            commands::task_tag_toggle,
            commands::setting_get,
            commands::setting_set,
            commands::palette_hide,
        ])
        .setup(|app| {
            // Dockアイコンを出さずメニューバー常駐アプリとして振る舞う
            #[cfg(target_os = "macos")]
            app.set_activation_policy(tauri::ActivationPolicy::Accessory);

            // ~/Library/Application Support/Avoliq/avoliq.db
            // app_data_dir() だとバンドル識別子のディレクトリになるので data_dir() を使う
            let db_path = avoliq_database_path(&app.path().data_dir()?);
            let mut conn = db::open_at(&db_path).map_err(|e| e.to_string())?;
            db::repo::seed_if_empty(&mut conn).map_err(|e| e.to_string())?;
            app.manage(commands::DbState(Mutex::new(conn)));

            // ログイン時の自動起動プラグイン(既定はOFF、設定画面でトグルする)
            #[cfg(desktop)]
            app.handle().plugin(tauri_plugin_autostart::init(
                tauri_plugin_autostart::MacosLauncher::LaunchAgent,
                None,
            ))?;

            // ウィンドウをNSPanel化する
            panel::init_panel(app)?;

            // settingsのhotkeyキー（既定 Alt+Space）でグローバルショートカットを登録する。
            // 失敗してもemit/settings記録は済んでいる（フロントが拾って表示する）ので、
            // 起動自体は止めない。
            if let Err(e) = panel::register_hotkey(app.handle()) {
                eprintln!("ホットキー登録に失敗しました: {e}");
            }
            // メニューバー常駐アイコン
            panel::init_tray(app)?;

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::avoliq_database_path;
    use std::path::Path;

    #[test]
    fn database_path_is_scoped_to_avoliq() {
        assert_eq!(
            avoliq_database_path(Path::new("/tmp/application-support")),
            Path::new("/tmp/application-support/Avoliq/avoliq.db"),
        );
    }
}
