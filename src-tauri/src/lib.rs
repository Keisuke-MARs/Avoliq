mod commands;
mod db;
mod panel;

use std::sync::Mutex;

use tauri::Manager;

fn avoliq_database_path(data_dir: &std::path::Path) -> std::path::PathBuf {
    data_dir.join("Avoliq").join("avoliq.db")
}

/// 本文の画像を配信する独自スキーム名。src/lib/taskImage.ts の IMAGE_URL_SCHEME と一致させる。
const IMAGE_URL_SCHEME: &str = "avoliq-img";

/// avoliq-img のURLから画像idを取り出す。
///
/// macOSでは `avoliq-img://<id>` の形でハンドラに渡るためホスト部がidになる。
/// 他のプラットフォームでは `avoliq-img://localhost/<id>` の形になりうるので、
/// ホストが空か localhost のときだけパスの先頭スラッシュを外して使う。
fn image_id_from_uri(uri: &tauri::http::Uri) -> Option<String> {
    let host = uri.host().unwrap_or_default();
    let candidate = if host.is_empty() || host == "localhost" {
        uri.path().trim_start_matches('/').to_string()
    } else {
        host.to_string()
    };
    if candidate.is_empty() {
        None
    } else {
        Some(candidate)
    }
}

/// ボディを持たない応答。画像が出ないだけで本文の描画は壊さない。
fn image_error(status: tauri::http::StatusCode) -> tauri::http::Response<Vec<u8>> {
    tauri::http::Response::builder()
        .status(status)
        .body(Vec::new())
        .expect("空ボディの応答は必ず組める")
}

/// avoliq-img の要求に応える。DBから画像を引いてそのまま返す。
fn serve_image(
    app: &tauri::AppHandle,
    uri: &tauri::http::Uri,
) -> tauri::http::Response<Vec<u8>> {
    let Some(id) = image_id_from_uri(uri) else {
        return image_error(tauri::http::StatusCode::BAD_REQUEST);
    };
    // DbStateはsetup()でmanageされる。ハンドラが走るのは必ず起動後だが、
    // 取れなかった場合にpanicさせずエラー応答で済ませる
    let Some(state) = app.try_state::<commands::DbState>() else {
        return image_error(tauri::http::StatusCode::INTERNAL_SERVER_ERROR);
    };
    let Ok(mut conn) = state.0.lock() else {
        return image_error(tauri::http::StatusCode::INTERNAL_SERVER_ERROR);
    };
    match db::repo::image_read(&mut conn, &id) {
        Ok((mime, bytes)) => tauri::http::Response::builder()
            .status(tauri::http::StatusCode::OK)
            .header(tauri::http::header::CONTENT_TYPE, mime)
            .body(bytes)
            .unwrap_or_else(|_| image_error(tauri::http::StatusCode::INTERNAL_SERVER_ERROR)),
        Err(_) => image_error(tauri::http::StatusCode::NOT_FOUND),
    }
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
            commands::image_create,
            commands::setting_get,
            commands::setting_set,
            commands::palette_hide,
        ])
        // 本文の画像をDBから直接Webviewへ返す。
        // 同期版ではなく非同期版を使うのは、DBのロック待ちでWebviewの描画を止めないため
        .register_asynchronous_uri_scheme_protocol(IMAGE_URL_SCHEME, |ctx, request, responder| {
            let app = ctx.app_handle().clone();
            std::thread::spawn(move || {
                responder.respond(serve_image(&app, request.uri()));
            });
        })
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

    #[test]
    fn ホスト部から画像idを取り出す() {
        let uri: tauri::http::Uri = "avoliq-img://abc-123"
            .parse()
            .expect("URIをパースできること");

        assert_eq!(super::image_id_from_uri(&uri), Some("abc-123".to_string()));
    }

    #[test]
    fn localhost形式ではパスから画像idを取り出す() {
        // macOS以外では avoliq-img://localhost/<id> の形で渡りうる
        let uri: tauri::http::Uri = "avoliq-img://localhost/abc-123"
            .parse()
            .expect("URIをパースできること");

        assert_eq!(super::image_id_from_uri(&uri), Some("abc-123".to_string()));
    }

    #[test]
    fn idを含まないURLはNoneになる() {
        let uri: tauri::http::Uri = "avoliq-img://localhost/"
            .parse()
            .expect("URIをパースできること");

        assert_eq!(super::image_id_from_uri(&uri), None);
    }
}
