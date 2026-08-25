//! Tauriコマンド層。リポジトリ層への薄い委譲に徹する。
//! ここで DB のロックを取り、RepoError を String に変換する。

use std::sync::Mutex;

use base64::prelude::{Engine as _, BASE64_STANDARD};
use rusqlite::Connection;
use tauri::AppHandle;
use tauri::State;

use crate::db::{repo, Board, Status, Tag, Task};
use crate::panel;

/// DB接続をアプリ全体で共有するための状態。
pub struct DbState(pub Mutex<Connection>);

/// ロック取得の失敗メッセージ（他スレッドがパニックした場合のみ起きる）
const LOCK_ERROR: &str = "DB接続のロックに失敗しました";

/// 貼り付けを受け付ける画像の形式。src/lib/taskImage.ts の ALLOWED_IMAGE_MIME と一致させる。
const ALLOWED_IMAGE_MIME: [&str; 4] = ["image/png", "image/jpeg", "image/gif", "image/webp"];

/// 画像1枚の上限バイト数(10MB)。src/lib/taskImage.ts の MAX_IMAGE_BYTES と一致させる。
const MAX_IMAGE_BYTES: usize = 10 * 1024 * 1024;

/// base64文字列を検査つきでバイト列に戻す。
///
/// フロント側でも同じ検査をするが、IPCは誰からでも叩けるのでこちらを正とする。
/// メッセージはそのままトーストに出るため日本語で書く。
fn decode_image(mime: &str, data_base64: &str) -> Result<Vec<u8>, String> {
    if !ALLOWED_IMAGE_MIME.contains(&mime) {
        return Err("この形式の画像は貼り付けられません".to_string());
    }
    let bytes = BASE64_STANDARD
        .decode(data_base64)
        .map_err(|_| "画像データを読み取れませんでした".to_string())?;
    if bytes.len() > MAX_IMAGE_BYTES {
        return Err("画像が大きすぎます（10MBまで）".to_string());
    }
    if bytes.is_empty() {
        return Err("画像データが空です".to_string());
    }
    Ok(bytes)
}

#[tauri::command]
pub fn boards_list(state: State<'_, DbState>) -> Result<Vec<Board>, String> {
    let mut conn = state.0.lock().map_err(|_| LOCK_ERROR.to_string())?;
    repo::boards_list(&mut conn).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn board_create(state: State<'_, DbState>, name: String) -> Result<Board, String> {
    let mut conn = state.0.lock().map_err(|_| LOCK_ERROR.to_string())?;
    repo::board_create(&mut conn, &name).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn board_rename(
    state: State<'_, DbState>,
    id: String,
    name: String,
) -> Result<Board, String> {
    let mut conn = state.0.lock().map_err(|_| LOCK_ERROR.to_string())?;
    repo::board_rename(&mut conn, &id, &name).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn board_delete(state: State<'_, DbState>, id: String) -> Result<(), String> {
    let mut conn = state.0.lock().map_err(|_| LOCK_ERROR.to_string())?;
    repo::board_delete(&mut conn, &id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn statuses_list(
    state: State<'_, DbState>,
    board_id: String,
) -> Result<Vec<Status>, String> {
    let mut conn = state.0.lock().map_err(|_| LOCK_ERROR.to_string())?;
    repo::statuses_list(&mut conn, &board_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn status_create(
    state: State<'_, DbState>,
    board_id: String,
    name: String,
    color: String,
) -> Result<Status, String> {
    let mut conn = state.0.lock().map_err(|_| LOCK_ERROR.to_string())?;
    repo::status_create(&mut conn, &board_id, &name, &color).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn status_update(
    state: State<'_, DbState>,
    id: String,
    name: Option<String>,
    color: Option<String>,
) -> Result<Status, String> {
    let mut conn = state.0.lock().map_err(|_| LOCK_ERROR.to_string())?;
    repo::status_update(&mut conn, &id, name.as_deref(), color.as_deref())
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn status_delete(state: State<'_, DbState>, id: String) -> Result<(), String> {
    let mut conn = state.0.lock().map_err(|_| LOCK_ERROR.to_string())?;
    repo::status_delete(&mut conn, &id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn status_reorder(
    state: State<'_, DbState>,
    id: String,
    new_index: i64,
) -> Result<Vec<Status>, String> {
    let mut conn = state.0.lock().map_err(|_| LOCK_ERROR.to_string())?;
    repo::status_reorder(&mut conn, &id, new_index).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn tasks_list(state: State<'_, DbState>, board_id: String) -> Result<Vec<Task>, String> {
    let mut conn = state.0.lock().map_err(|_| LOCK_ERROR.to_string())?;
    repo::tasks_list(&mut conn, &board_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn task_create(
    state: State<'_, DbState>,
    board_id: String,
    status_id: String,
    title: String,
) -> Result<Task, String> {
    let mut conn = state.0.lock().map_err(|_| LOCK_ERROR.to_string())?;
    repo::task_create(&mut conn, &board_id, &status_id, &title).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn task_update(
    state: State<'_, DbState>,
    id: String,
    title: Option<String>,
    content_md: Option<String>,
) -> Result<Task, String> {
    let mut conn = state.0.lock().map_err(|_| LOCK_ERROR.to_string())?;
    repo::task_update(&mut conn, &id, title.as_deref(), content_md.as_deref())
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn task_move(
    state: State<'_, DbState>,
    id: String,
    status_id: String,
    new_index: i64,
) -> Result<Task, String> {
    let mut conn = state.0.lock().map_err(|_| LOCK_ERROR.to_string())?;
    repo::task_move(&mut conn, &id, &status_id, new_index).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn task_delete(state: State<'_, DbState>, id: String) -> Result<Task, String> {
    let mut conn = state.0.lock().map_err(|_| LOCK_ERROR.to_string())?;
    repo::task_delete(&mut conn, &id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn task_restore(state: State<'_, DbState>, id: String) -> Result<Task, String> {
    let mut conn = state.0.lock().map_err(|_| LOCK_ERROR.to_string())?;
    repo::task_restore(&mut conn, &id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn tags_list(state: State<'_, DbState>, board_id: String) -> Result<Vec<Tag>, String> {
    let mut conn = state.0.lock().map_err(|_| LOCK_ERROR.to_string())?;
    repo::tags_list(&mut conn, &board_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn tag_create(
    state: State<'_, DbState>,
    board_id: String,
    name: String,
) -> Result<Tag, String> {
    let mut conn = state.0.lock().map_err(|_| LOCK_ERROR.to_string())?;
    repo::tag_create(&mut conn, &board_id, &name).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn tag_rename(state: State<'_, DbState>, id: String, name: String) -> Result<Tag, String> {
    let mut conn = state.0.lock().map_err(|_| LOCK_ERROR.to_string())?;
    repo::tag_rename(&mut conn, &id, &name).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn tag_delete(state: State<'_, DbState>, id: String) -> Result<(), String> {
    let mut conn = state.0.lock().map_err(|_| LOCK_ERROR.to_string())?;
    repo::tag_delete(&mut conn, &id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn task_tag_toggle(
    state: State<'_, DbState>,
    task_id: String,
    tag_id: String,
) -> Result<Vec<String>, String> {
    let mut conn = state.0.lock().map_err(|_| LOCK_ERROR.to_string())?;
    repo::task_tag_toggle(&mut conn, &task_id, &tag_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn setting_get(state: State<'_, DbState>, key: String) -> Result<Option<String>, String> {
    let mut conn = state.0.lock().map_err(|_| LOCK_ERROR.to_string())?;
    repo::setting_get(&mut conn, &key).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn setting_set(
    app: AppHandle,
    state: State<'_, DbState>,
    key: String,
    value: String,
) -> Result<(), String> {
    {
        // ここでロックを解放してから再登録に進む（register_hotkey が同じロックを取る）
        let mut conn = state.0.lock().map_err(|_| LOCK_ERROR.to_string())?;
        repo::setting_set(&mut conn, &key, &value).map_err(|e| e.to_string())?;
    }

    // ホットキーを変えたら即座に登録し直す
    if key == repo::HOTKEY_SETTING_KEY {
        panel::reregister_hotkey(&app)?;
    }

    Ok(())
}

/// タスク本文に貼り付けた画像を保存し、本文から参照するためのidを返す。
/// フロントはこのidを avoliq-img://<id> の形にして本文のMarkdownに書く。
#[tauri::command]
pub fn image_create(
    state: State<'_, DbState>,
    task_id: String,
    mime: String,
    data_base64: String,
) -> Result<String, String> {
    let bytes = decode_image(&mime, &data_base64)?;
    let mut conn = state.0.lock().map_err(|_| LOCK_ERROR.to_string())?;
    repo::image_create(&mut conn, &task_id, &mime, &bytes).map_err(|e| e.to_string())
}

/// パレットを隠す。フロントの Esc から呼ぶ。
/// NSPanel なので JS 側の window.hide() ではなく Rust 側で orderOut する必要がある。
#[tauri::command]
pub fn palette_hide(app: AppHandle) -> Result<(), String> {
    panel::hide_panel(&app);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{decode_image, MAX_IMAGE_BYTES};
    use base64::prelude::{Engine as _, BASE64_STANDARD};

    #[test]
    fn 許可していない形式は弾かれる() {
        let encoded = BASE64_STANDARD.encode([0x3C, 0x73, 0x76, 0x67]);

        let result = decode_image("image/svg+xml", &encoded);

        assert_eq!(result.unwrap_err(), "この形式の画像は貼り付けられません");
    }

    #[test]
    fn base64として壊れていれば弾かれる() {
        let result = decode_image("image/png", "###");

        assert_eq!(result.unwrap_err(), "画像データを読み取れませんでした");
    }

    #[test]
    fn 上限を超えるサイズは弾かれる() {
        let encoded = BASE64_STANDARD.encode(vec![0u8; MAX_IMAGE_BYTES + 1]);

        let result = decode_image("image/png", &encoded);

        assert_eq!(result.unwrap_err(), "画像が大きすぎます（10MBまで）");
    }

    #[test]
    fn 空の画像は弾かれる() {
        let result = decode_image("image/png", "");

        assert_eq!(result.unwrap_err(), "画像データが空です");
    }

    #[test]
    fn 対応形式は元のバイト列に戻る() {
        let encoded = BASE64_STANDARD.encode([0x89, 0x50, 0x4E, 0x47]);

        let bytes = decode_image("image/png", &encoded).expect("デコードできること");

        assert_eq!(bytes, vec![0x89, 0x50, 0x4E, 0x47]);
    }

    #[test]
    fn png以外の対応形式も通る() {
        let encoded = BASE64_STANDARD.encode([0xFF, 0xD8]);

        assert!(decode_image("image/jpeg", &encoded).is_ok());
        assert!(decode_image("image/gif", &encoded).is_ok());
        assert!(decode_image("image/webp", &encoded).is_ok());
    }
}
