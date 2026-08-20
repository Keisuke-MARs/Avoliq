//! Tauriコマンド層。リポジトリ層への薄い委譲に徹する。
//! ここで DB のロックを取り、RepoError を String に変換する。

use std::sync::Mutex;

use rusqlite::Connection;
use tauri::State;

use crate::db::{repo, Board, Status, Task};

/// DB接続をアプリ全体で共有するための状態。
pub struct DbState(pub Mutex<Connection>);

/// ロック取得の失敗メッセージ（他スレッドがパニックした場合のみ起きる）
const LOCK_ERROR: &str = "DB接続のロックに失敗しました";

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
pub fn setting_get(state: State<'_, DbState>, key: String) -> Result<Option<String>, String> {
    let mut conn = state.0.lock().map_err(|_| LOCK_ERROR.to_string())?;
    repo::setting_get(&mut conn, &key).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn setting_set(
    state: State<'_, DbState>,
    key: String,
    value: String,
) -> Result<(), String> {
    let mut conn = state.0.lock().map_err(|_| LOCK_ERROR.to_string())?;
    repo::setting_set(&mut conn, &key, &value).map_err(|e| e.to_string())
}
