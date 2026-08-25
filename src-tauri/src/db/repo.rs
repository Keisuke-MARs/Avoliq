//! リポジトリ層。SQLを書くのはこのファイルだけ。Tauriには依存しない。
//!
//! 並び順は「整数positionの全件再採番方式」で管理する。レーン内の件数は少ない前提。

use std::collections::HashMap;

use rusqlite::{params, Connection, OptionalExtension, Row, Transaction};
use uuid::Uuid;

use super::{Board, RepoError, Result, Status, Tag, Task};

/// ステータス色プリセット（design/status-presets.json）の1件。
/// TS側の STATUS_COLORS と同じファイルを読むことで、色のズレを構造的に防ぐ。
/// JSONには表示用の name もあるが、Rust側で使うのは色だけ。
/// serdeはデフォルトで未知フィールドを無視してパースするので、
/// 使わない name はこの構造体に定義しなくてよい。
#[derive(serde::Deserialize)]
struct StatusPreset {
    value: String,
}

/// プリセットのJSON。コンパイル時に埋め込むので実行時のI/Oは無い。
const STATUS_PRESETS_JSON: &str = include_str!("../../../design/status-presets.json");

/// 新規ボードのデフォルトステータス名。色はプリセットの先頭4件を順に使う。
const DEFAULT_STATUS_NAMES: [&str; 4] = ["未着手", "進行中", "確認中", "完了"];

/// 新規ボード作成時に自動投入するデフォルトステータス（name, color）。
/// 名前はRust側、色はプリセットの先頭4件。並び順は配列の順。
fn default_statuses() -> Vec<(String, String)> {
    let presets: Vec<StatusPreset> = serde_json::from_str(STATUS_PRESETS_JSON)
        .expect("design/status-presets.json のパースに失敗しました");
    DEFAULT_STATUS_NAMES
        .iter()
        .zip(presets.into_iter())
        .map(|(name, preset)| (name.to_string(), preset.value))
        .collect()
}

/// タグ色のプリセット。ステータス色より彩度を落とし、看板の主役（ステータス色）を食わないようにする。
/// 作成時に「そのボードでまだ使われていない最初の色」を選ぶ。全部埋まったら先頭から循環する。
///
/// この値と並び順は、フロントの `src/lib/tagPalette.ts` の `TAG_COLORS` と同一でなければならない。
/// フロントはDBに保存されたこの色をキーに文字色（fgLight）を引くため、片方だけ変更すると
/// 文字色が引けなくなる。どちらかを変えるときは必ず両方を直すこと。
pub const TAG_COLORS: &[&str] = &[
    "#7EA9E8", "#E8B478", "#7FCF9A", "#E88A85", "#B98CD8", "#E88AA6", "#8FC9E0", "#A8A8AE",
    "#C9B478",
];

/// 新しいUUID文字列を作る
fn new_id() -> String {
    Uuid::new_v4().to_string()
}

fn row_to_board(row: &Row<'_>) -> rusqlite::Result<Board> {
    Ok(Board {
        id: row.get("id")?,
        name: row.get("name")?,
        position: row.get("position")?,
    })
}

fn row_to_status(row: &Row<'_>) -> rusqlite::Result<Status> {
    Ok(Status {
        id: row.get("id")?,
        board_id: row.get("board_id")?,
        name: row.get("name")?,
        color: row.get("color")?,
        position: row.get("position")?,
    })
}

fn row_to_tag(row: &Row<'_>) -> rusqlite::Result<Tag> {
    Ok(Tag {
        id: row.get("id")?,
        board_id: row.get("board_id")?,
        name: row.get("name")?,
        color: row.get("color")?,
        position: row.get("position")?,
    })
}

/// IDでタグを1件引く
fn tag_by_id(conn: &Connection, id: &str) -> Result<Tag> {
    conn.query_row(
        "SELECT id, board_id, name, color, position FROM tags WHERE id = ?1",
        params![id],
        row_to_tag,
    )
    .optional()?
    .ok_or_else(|| RepoError::NotFound(format!("タグ {id}")))
}

/// 行→Task。tag_ids は行に含まれないので空で作る。
/// **Task を外へ返す経路は task_by_id と tasks_list の2つだけ**で、そこで必ず tag_ids を埋める。
fn row_to_task(row: &Row<'_>) -> rusqlite::Result<Task> {
    Ok(Task {
        id: row.get("id")?,
        board_id: row.get("board_id")?,
        status_id: row.get("status_id")?,
        title: row.get("title")?,
        content_md: row.get("content_md")?,
        position: row.get("position")?,
        created_at: row.get("created_at")?,
        updated_at: row.get("updated_at")?,
        tag_ids: Vec::new(),
    })
}

/// IDでボードを1件引く
fn board_by_id(conn: &Connection, id: &str) -> Result<Board> {
    conn.query_row(
        "SELECT id, name, position FROM boards WHERE id = ?1",
        params![id],
        row_to_board,
    )
    .optional()?
    .ok_or_else(|| RepoError::NotFound(format!("ボード {id}")))
}

/// ボード一覧（position昇順）
pub fn boards_list(conn: &mut Connection) -> Result<Vec<Board>> {
    let mut stmt =
        conn.prepare("SELECT id, name, position FROM boards ORDER BY position, rowid")?;
    let boards = stmt
        .query_map([], row_to_board)?
        .collect::<rusqlite::Result<Vec<Board>>>()?;
    Ok(boards)
}

/// ボードを作る。デフォルトステータス4つも同時に作る。
pub fn board_create(conn: &mut Connection, name: &str) -> Result<Board> {
    let board_id = new_id();

    let tx = conn.transaction()?;
    let next_position: i64 = tx.query_row(
        "SELECT COALESCE(MAX(position) + 1, 0) FROM boards",
        [],
        |row| row.get(0),
    )?;
    tx.execute(
        "INSERT INTO boards (id, name, position) VALUES (?1, ?2, ?3)",
        params![&board_id, name, next_position],
    )?;
    for (index, (status_name, color)) in default_statuses().iter().enumerate() {
        tx.execute(
            "INSERT INTO statuses (id, board_id, name, color, position) VALUES (?1, ?2, ?3, ?4, ?5)",
            params![new_id(), &board_id, status_name, color, index as i64],
        )?;
    }
    tx.commit()?;

    board_by_id(conn, &board_id)
}

/// ボードを改名する
pub fn board_rename(conn: &mut Connection, id: &str, name: &str) -> Result<Board> {
    let changed = conn.execute(
        "UPDATE boards SET name = ?2, updated_at = datetime('now') WHERE id = ?1",
        params![id, name],
    )?;
    if changed == 0 {
        return Err(RepoError::NotFound(format!("ボード {id}")));
    }
    board_by_id(conn, id)
}

/// ボードを物理削除する。所属するステータス・タスク・タグ・タスクタグも消える。
///
/// スキーマ上は ON DELETE CASCADE が付いているが、tasks.status_id → statuses(id) の
/// 外部キーがカスケードの処理順によっては先に破られてしまう。順序を自分で決めて消す。
/// task_tags は tasks と tags の両方を参照する中間テーブルなので、一番先に消す。
pub fn board_delete(conn: &mut Connection, id: &str) -> Result<()> {
    let tx = conn.transaction()?;
    tx.execute(
        "DELETE FROM task_tags WHERE task_id IN (SELECT id FROM tasks WHERE board_id = ?1)",
        params![id],
    )?;
    tx.execute("DELETE FROM tasks WHERE board_id = ?1", params![id])?;
    tx.execute("DELETE FROM tags WHERE board_id = ?1", params![id])?;
    tx.execute("DELETE FROM statuses WHERE board_id = ?1", params![id])?;
    let changed = tx.execute("DELETE FROM boards WHERE id = ?1", params![id])?;
    if changed == 0 {
        return Err(RepoError::NotFound(format!("ボード {id}")));
    }
    tx.commit()?;
    Ok(())
}

/// 生存タスクの position を 0..n-1 に振り直す（レーン単位）
fn renumber_lane(tx: &Transaction<'_>, status_id: &str) -> Result<()> {
    let ids: Vec<String> = {
        let mut stmt = tx.prepare(
            "SELECT id FROM tasks
             WHERE status_id = ?1 AND deleted_at IS NULL
             ORDER BY position, rowid",
        )?;
        let mapped = stmt.query_map(params![status_id], |row| row.get::<_, String>(0))?;
        let collected: rusqlite::Result<Vec<String>> = mapped.collect();
        collected?
    };
    for (index, id) in ids.iter().enumerate() {
        tx.execute(
            "UPDATE tasks SET position = ?2 WHERE id = ?1",
            params![id, index as i64],
        )?;
    }
    Ok(())
}

/// IDでタスクを1件引く（削除済みも引ける、tag_ids も埋める）
fn task_by_id(conn: &Connection, id: &str) -> Result<Task> {
    let mut task = conn
        .query_row(
            "SELECT id, board_id, status_id, title, content_md, position, created_at, updated_at
             FROM tasks WHERE id = ?1",
            params![id],
            row_to_task,
        )
        .optional()?
        .ok_or_else(|| RepoError::NotFound(format!("タスク {id}")))?;
    task.tag_ids = load_tag_ids(conn, id)?;
    Ok(task)
}

/// ボード内のステータス一覧（position昇順）
pub fn statuses_list(conn: &mut Connection, board_id: &str) -> Result<Vec<Status>> {
    let mut stmt = conn.prepare(
        "SELECT id, board_id, name, color, position FROM statuses
         WHERE board_id = ?1 ORDER BY position, rowid",
    )?;
    let statuses = stmt
        .query_map(params![board_id], row_to_status)?
        .collect::<rusqlite::Result<Vec<Status>>>()?;
    Ok(statuses)
}

/// ボード内の生存タスク一覧（position昇順・tag_ids 込み）
pub fn tasks_list(conn: &mut Connection, board_id: &str) -> Result<Vec<Task>> {
    let mut tasks = {
        let mut stmt = conn.prepare(
            "SELECT id, board_id, status_id, title, content_md, position, created_at, updated_at
             FROM tasks
             WHERE board_id = ?1 AND deleted_at IS NULL
             ORDER BY position, rowid",
        )?;
        let mapped = stmt.query_map(params![board_id], row_to_task)?;
        let collected: rusqlite::Result<Vec<Task>> = mapped.collect();
        collected?
    };

    // N+1 を避け、ボード分の task_tags を1クエリでまとめて引く
    let by_task = load_tag_ids_for_board(conn, board_id)?;
    for task in tasks.iter_mut() {
        task.tag_ids = by_task.get(&task.id).cloned().unwrap_or_default();
    }
    Ok(tasks)
}

/// タスクをレーン先頭(position=0)に作る。既存の生存タスクは1つずつ後ろへずれる。
pub fn task_create(
    conn: &mut Connection,
    board_id: &str,
    status_id: &str,
    title: &str,
) -> Result<Task> {
    let id = new_id();

    let tx = conn.transaction()?;
    // 指定ステータスが指定ボードに属しているか検証する（別ボードのステータスIDを渡された事故を防ぐ）
    let status = status_by_id(&tx, status_id)?;
    if status.board_id != board_id {
        return Err(RepoError::Rule(
            "ステータスが指定のボードに属していません".to_string(),
        ));
    }
    tx.execute(
        "UPDATE tasks SET position = position + 1
         WHERE status_id = ?1 AND deleted_at IS NULL",
        params![status_id],
    )?;
    tx.execute(
        "INSERT INTO tasks (id, board_id, status_id, title, content_md, position)
         VALUES (?1, ?2, ?3, ?4, '', 0)",
        params![&id, board_id, status_id, title],
    )?;
    renumber_lane(&tx, status_id)?;
    tx.commit()?;

    task_by_id(conn, &id)
}

/// IDでステータスを1件引く
fn status_by_id(conn: &Connection, id: &str) -> Result<Status> {
    conn.query_row(
        "SELECT id, board_id, name, color, position FROM statuses WHERE id = ?1",
        params![id],
        row_to_status,
    )
    .optional()?
    .ok_or_else(|| RepoError::NotFound(format!("ステータス {id}")))
}

/// ボード内のステータスIDを並び順で取り出す
fn status_ids_in_order(tx: &Transaction<'_>, board_id: &str) -> Result<Vec<String>> {
    let mut stmt = tx.prepare(
        "SELECT id FROM statuses WHERE board_id = ?1 ORDER BY position, rowid",
    )?;
    let ids = stmt
        .query_map(params![board_id], |row| row.get::<_, String>(0))?
        .collect::<rusqlite::Result<Vec<String>>>()?;
    Ok(ids)
}

/// 渡された順序どおりに position を 0..n-1 で書き込む
fn write_status_positions(tx: &Transaction<'_>, ids: &[String]) -> Result<()> {
    for (index, id) in ids.iter().enumerate() {
        tx.execute(
            "UPDATE statuses SET position = ?2, updated_at = datetime('now') WHERE id = ?1",
            params![id, index as i64],
        )?;
    }
    Ok(())
}

/// ステータスをボード末尾に追加する
pub fn status_create(
    conn: &mut Connection,
    board_id: &str,
    name: &str,
    color: &str,
) -> Result<Status> {
    let next_position: i64 = conn.query_row(
        "SELECT COALESCE(MAX(position) + 1, 0) FROM statuses WHERE board_id = ?1",
        params![board_id],
        |row| row.get(0),
    )?;
    let id = new_id();
    conn.execute(
        "INSERT INTO statuses (id, board_id, name, color, position) VALUES (?1, ?2, ?3, ?4, ?5)",
        params![&id, board_id, name, color, next_position],
    )?;
    status_by_id(conn, &id)
}

/// ステータスの名前・色を更新する（None の項目は変更しない）
pub fn status_update(
    conn: &mut Connection,
    id: &str,
    name: Option<&str>,
    color: Option<&str>,
) -> Result<Status> {
    let current = status_by_id(conn, id)?;
    let new_name = name.unwrap_or(&current.name);
    let new_color = color.unwrap_or(&current.color);
    conn.execute(
        "UPDATE statuses SET name = ?2, color = ?3, updated_at = datetime('now') WHERE id = ?1",
        params![id, new_name, new_color],
    )?;
    status_by_id(conn, id)
}

/// ステータスを new_index の位置へ動かし、ボード内全件を再採番して返す
pub fn status_reorder(conn: &mut Connection, id: &str, new_index: i64) -> Result<Vec<Status>> {
    let target = status_by_id(conn, id)?;

    let tx = conn.transaction()?;
    let mut ids = status_ids_in_order(&tx, &target.board_id)?;
    ids.retain(|existing| existing != &target.id);
    // 0..len の範囲に丸める（len を指定すると末尾になる）
    let insert_at = new_index.clamp(0, ids.len() as i64) as usize;
    ids.insert(insert_at, target.id.clone());
    write_status_positions(&tx, &ids)?;
    tx.commit()?;

    statuses_list(conn, &target.board_id)
}

/// ステータスを削除する。所属タスクはボード先頭ステータスへ退避する。
/// ボードに1つしかステータスが無い場合はエラー。
pub fn status_delete(conn: &mut Connection, id: &str) -> Result<()> {
    let target = status_by_id(conn, id)?;

    let total: i64 = conn.query_row(
        "SELECT COUNT(*) FROM statuses WHERE board_id = ?1",
        params![&target.board_id],
        |row| row.get(0),
    )?;
    if total <= 1 {
        return Err(RepoError::Rule(
            "最後のステータスは削除できません".to_string(),
        ));
    }

    // 退避先 = 削除対象を除いたボード先頭のステータス
    let fallback_id: String = conn.query_row(
        "SELECT id FROM statuses
         WHERE board_id = ?1 AND id <> ?2
         ORDER BY position, rowid LIMIT 1",
        params![&target.board_id, &target.id],
        |row| row.get(0),
    )?;

    let tx = conn.transaction()?;
    // 削除済みタスクも含めて退避させる（復元したときに壊れたIDを指さないように）
    tx.execute(
        "UPDATE tasks SET status_id = ?2, updated_at = datetime('now') WHERE status_id = ?1",
        params![&target.id, &fallback_id],
    )?;
    tx.execute("DELETE FROM statuses WHERE id = ?1", params![&target.id])?;
    let remaining = status_ids_in_order(&tx, &target.board_id)?;
    write_status_positions(&tx, &remaining)?;
    renumber_lane(&tx, &fallback_id)?;
    tx.commit()?;

    Ok(())
}

/// タスクのタイトル・本文を更新する（None の項目は変更しない）
pub fn task_update(
    conn: &mut Connection,
    id: &str,
    title: Option<&str>,
    content_md: Option<&str>,
) -> Result<Task> {
    let current = task_by_id(conn, id)?;
    let new_title = title.unwrap_or(&current.title);
    let new_content = content_md.unwrap_or(&current.content_md);
    conn.execute(
        "UPDATE tasks SET title = ?2, content_md = ?3, updated_at = datetime('now')
         WHERE id = ?1",
        params![id, new_title, new_content],
    )?;
    task_by_id(conn, id)
}

/// 指定レーンの生存タスクIDを並び順で取り出す（except_id は除外する）
fn lane_ids_in_order(
    tx: &Transaction<'_>,
    status_id: &str,
    except_id: &str,
) -> Result<Vec<String>> {
    let mut stmt = tx.prepare(
        "SELECT id FROM tasks
         WHERE status_id = ?1 AND deleted_at IS NULL AND id <> ?2
         ORDER BY position, rowid",
    )?;
    let ids = stmt
        .query_map(params![status_id, except_id], |row| row.get::<_, String>(0))?
        .collect::<rusqlite::Result<Vec<String>>>()?;
    Ok(ids)
}

/// 渡された順序どおりに position を 0..n-1 で書き込む
fn write_task_positions(tx: &Transaction<'_>, ids: &[String]) -> Result<()> {
    for (index, id) in ids.iter().enumerate() {
        tx.execute(
            "UPDATE tasks SET position = ?2 WHERE id = ?1",
            params![id, index as i64],
        )?;
    }
    Ok(())
}

/// タスクを status_id レーンの new_index へ移す。移動元・移動先の両レーンを再採番する。
pub fn task_move(
    conn: &mut Connection,
    id: &str,
    status_id: &str,
    new_index: i64,
) -> Result<Task> {
    let current = task_by_id(conn, id)?;
    let from_status_id = current.status_id.clone();

    let tx = conn.transaction()?;
    // 移動先ステータスがタスクと同じボードに属しているか検証する（ボード跨ぎ移動を拒否）
    let target_status = status_by_id(&tx, status_id)?;
    if target_status.board_id != current.board_id {
        return Err(RepoError::Rule(
            "ステータスが指定のボードに属していません".to_string(),
        ));
    }
    let mut ids = lane_ids_in_order(&tx, status_id, id)?;
    // 0..len の範囲に丸める（len を指定すると末尾になる）
    let insert_at = new_index.clamp(0, ids.len() as i64) as usize;
    ids.insert(insert_at, id.to_string());

    tx.execute(
        "UPDATE tasks SET status_id = ?2, updated_at = datetime('now') WHERE id = ?1",
        params![id, status_id],
    )?;
    write_task_positions(&tx, &ids)?;
    if from_status_id != status_id {
        renumber_lane(&tx, &from_status_id)?;
    }
    tx.commit()?;

    task_by_id(conn, id)
}

/// タスクをソフトデリートする。deleted_at を入れ、レーンの生存タスクを詰め直す。
/// 削除した行の position はそのまま残すので、復元時に元の位置へ戻せる。
pub fn task_delete(conn: &mut Connection, id: &str) -> Result<Task> {
    let current = task_by_id(conn, id)?;

    let tx = conn.transaction()?;
    tx.execute(
        "UPDATE tasks SET deleted_at = datetime('now'), updated_at = datetime('now')
         WHERE id = ?1",
        params![id],
    )?;
    renumber_lane(&tx, &current.status_id)?;
    tx.commit()?;

    task_by_id(conn, id)
}

/// ソフトデリートしたタスクを復元する。削除時に保持していた position の位置へ戻す。
pub fn task_restore(conn: &mut Connection, id: &str) -> Result<Task> {
    let current = task_by_id(conn, id)?;

    let tx = conn.transaction()?;
    let mut ids = lane_ids_in_order(&tx, &current.status_id, id)?;
    // 生存タスクは 0..n-1 に詰まっているので、保持していた position をそのまま挿入位置に使える
    let insert_at = current.position.clamp(0, ids.len() as i64) as usize;
    ids.insert(insert_at, id.to_string());

    tx.execute(
        "UPDATE tasks SET deleted_at = NULL, updated_at = datetime('now') WHERE id = ?1",
        params![id],
    )?;
    write_task_positions(&tx, &ids)?;
    tx.commit()?;

    task_by_id(conn, id)
}

/// タスク本文に貼り付けた画像を1枚保存し、生成したidを返す。
///
/// サイズと形式の検査はコマンド層で済ませてある前提で、ここは永続化に徹する。
/// task_id の存在だけ先に確かめるのは、外部キー違反のSQLite原文が
/// そのままフロントのトーストに出るのを避けるため。
pub fn image_create(
    conn: &mut Connection,
    task_id: &str,
    mime: &str,
    bytes: &[u8],
) -> Result<String> {
    task_by_id(conn, task_id)?;

    let id = new_id();
    conn.execute(
        "INSERT INTO images (id, task_id, mime, bytes) VALUES (?1, ?2, ?3, ?4)",
        params![&id, task_id, mime, bytes],
    )?;
    Ok(id)
}

/// idから画像の (mime, バイト列) を引く。avoliq-img スキームのハンドラから呼ぶ。
pub fn image_read(conn: &mut Connection, id: &str) -> Result<(String, Vec<u8>)> {
    conn.query_row(
        "SELECT mime, bytes FROM images WHERE id = ?1",
        params![id],
        |row| Ok((row.get("mime")?, row.get("bytes")?)),
    )
    .optional()?
    .ok_or_else(|| RepoError::NotFound(format!("画像 {id}")))
}

/// ホットキー設定の settings キー名
pub const HOTKEY_SETTING_KEY: &str = "hotkey";

/// ホットキー登録に失敗したメッセージを保存する settings キー名。
/// 起動直後のイベント取りこぼし対策として、フロントはここも読む。
pub const HOTKEY_ERROR_SETTING_KEY: &str = "hotkeyError";

/// ホットキーの既定値
pub const DEFAULT_HOTKEY: &str = "Alt+Space";

/// 設定値を1件取る。未設定なら None。
pub fn setting_get(conn: &mut Connection, key: &str) -> Result<Option<String>> {
    let value = conn
        .query_row(
            "SELECT value FROM settings WHERE key = ?1",
            params![key],
            |row| row.get::<_, String>(0),
        )
        .optional()?;
    Ok(value)
}

/// 設定値を保存する（既にあれば上書き）
pub fn setting_set(conn: &mut Connection, key: &str, value: &str) -> Result<()> {
    conn.execute(
        "INSERT INTO settings (key, value) VALUES (?1, ?2)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        params![key, value],
    )?;
    Ok(())
}

/// 初回起動時のシード。ボードが1枚も無ければ「メイン」を作り、ホットキー既定値を入れる。
pub fn seed_if_empty(conn: &mut Connection) -> Result<()> {
    let board_count: i64 =
        conn.query_row("SELECT COUNT(*) FROM boards", [], |row| row.get(0))?;
    if board_count == 0 {
        board_create(conn, "メイン")?;
    }
    if setting_get(conn, HOTKEY_SETTING_KEY)?.is_none() {
        setting_set(conn, HOTKEY_SETTING_KEY, DEFAULT_HOTKEY)?;
    }
    Ok(())
}

// ---- タグ ----

/// タグ名を検証して正規化する（前後の空白を落とす）
fn normalize_tag_name(name: &str) -> Result<String> {
    let trimmed = name.trim();
    if trimmed.is_empty() {
        return Err(RepoError::Rule("タグ名を入力してください".to_string()));
    }
    Ok(trimmed.to_string())
}

/// タグ一覧（position昇順）
pub fn tags_list(conn: &mut Connection, board_id: &str) -> Result<Vec<Tag>> {
    let mut stmt = conn.prepare(
        "SELECT id, board_id, name, color, position FROM tags
         WHERE board_id = ?1
         ORDER BY position, rowid",
    )?;
    let tags = stmt
        .query_map(params![board_id], row_to_tag)?
        .collect::<rusqlite::Result<Vec<Tag>>>()?;
    Ok(tags)
}

/// タグを作る。色はそのボードで未使用の色から自動で決まり、以後変わらない。
pub fn tag_create(conn: &mut Connection, board_id: &str, name: &str) -> Result<Tag> {
    let name = normalize_tag_name(name)?;
    let id = new_id();

    let tx = conn.transaction()?;
    // UNIQUE INDEX は SQLite 既定の BINARY 照合なので Bug と bug を通してしまう。
    // 大文字小文字を無視した同名拒否はここで行い、INDEX は最後の砦として残す。
    let duplicated: i64 = tx.query_row(
        "SELECT COUNT(*) FROM tags WHERE board_id = ?1 AND LOWER(name) = LOWER(?2)",
        params![board_id, &name],
        |row| row.get(0),
    )?;
    if duplicated > 0 {
        return Err(RepoError::Rule(format!("タグ「{name}」は既にあります")));
    }

    let used: Vec<String> = {
        let mut stmt = tx.prepare("SELECT color FROM tags WHERE board_id = ?1")?;
        let mapped = stmt.query_map(params![board_id], |row| row.get::<_, String>(0))?;
        let collected: rusqlite::Result<Vec<String>> = mapped.collect();
        collected?
    };
    let color = TAG_COLORS
        .iter()
        .find(|candidate| !used.iter().any(|u| u == *candidate))
        .copied()
        .unwrap_or(TAG_COLORS[used.len() % TAG_COLORS.len()]);

    let next_position: i64 = tx.query_row(
        "SELECT COALESCE(MAX(position) + 1, 0) FROM tags WHERE board_id = ?1",
        params![board_id],
        |row| row.get(0),
    )?;
    tx.execute(
        "INSERT INTO tags (id, board_id, name, color, position) VALUES (?1, ?2, ?3, ?4, ?5)",
        params![&id, board_id, &name, color, next_position],
    )?;
    tx.commit()?;

    tag_by_id(conn, &id)
}

/// タグを改名する。色とpositionは変わらない。
pub fn tag_rename(conn: &mut Connection, id: &str, name: &str) -> Result<Tag> {
    let name = normalize_tag_name(name)?;

    let tx = conn.transaction()?;
    let board_id: String = tx
        .query_row("SELECT board_id FROM tags WHERE id = ?1", params![id], |row| {
            row.get(0)
        })
        .optional()?
        .ok_or_else(|| RepoError::NotFound(format!("タグ {id}")))?;
    // 自分自身は衝突相手から除く（同じ名前へ改名しても通るようにする）
    let duplicated: i64 = tx.query_row(
        "SELECT COUNT(*) FROM tags WHERE board_id = ?1 AND LOWER(name) = LOWER(?2) AND id <> ?3",
        params![&board_id, &name, id],
        |row| row.get(0),
    )?;
    if duplicated > 0 {
        return Err(RepoError::Rule(format!("タグ「{name}」は既にあります")));
    }
    tx.execute(
        "UPDATE tags SET name = ?2, updated_at = datetime('now') WHERE id = ?1",
        params![id, &name],
    )?;
    tx.commit()?;

    tag_by_id(conn, id)
}

/// タグを削除する。task_tags は ON DELETE CASCADE で一緒に消える。
pub fn tag_delete(conn: &mut Connection, id: &str) -> Result<()> {
    let changed = conn.execute("DELETE FROM tags WHERE id = ?1", params![id])?;
    if changed == 0 {
        return Err(RepoError::NotFound(format!("タグ {id}")));
    }
    Ok(())
}

/// 1タスクに付いているタグidを tags.position 昇順で返す
fn load_tag_ids(conn: &Connection, task_id: &str) -> Result<Vec<String>> {
    let mut stmt = conn.prepare(
        "SELECT tt.tag_id
         FROM task_tags tt
         JOIN tags t ON t.id = tt.tag_id
         WHERE tt.task_id = ?1
         ORDER BY t.position, t.rowid",
    )?;
    let ids = stmt
        .query_map(params![task_id], |row| row.get::<_, String>(0))?
        .collect::<rusqlite::Result<Vec<String>>>()?;
    Ok(ids)
}

/// ボード内の全タスクについて タスクid → タグid列 を1クエリで引く
fn load_tag_ids_for_board(
    conn: &Connection,
    board_id: &str,
) -> Result<HashMap<String, Vec<String>>> {
    let mut stmt = conn.prepare(
        "SELECT tt.task_id, tt.tag_id
         FROM task_tags tt
         JOIN tags t  ON t.id = tt.tag_id
         JOIN tasks k ON k.id = tt.task_id
         WHERE k.board_id = ?1
         ORDER BY t.position, t.rowid",
    )?;
    let rows = stmt.query_map(params![board_id], |row| {
        Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
    })?;
    let mut map: HashMap<String, Vec<String>> = HashMap::new();
    for row in rows {
        let (task_id, tag_id) = row?;
        map.entry(task_id).or_default().push(tag_id);
    }
    Ok(map)
}

/// タスクのタグを付け外しする（トグル）。戻り値はトグル後の tag_ids。
pub fn task_tag_toggle(conn: &mut Connection, task_id: &str, tag_id: &str) -> Result<Vec<String>> {
    let tx = conn.transaction()?;
    // タスクとタグが同じボードに属しているか検証する。
    // task_tags にはボードの列が無いため、外部キー制約だけでは「別ボードのタグを付ける」事故を防げない。
    // task_create / task_move と同じ要領で、ここで明示的に検証する。
    let task = task_by_id(&tx, task_id)?;
    let tag = tag_by_id(&tx, tag_id)?;
    if tag.board_id != task.board_id {
        return Err(RepoError::Rule(
            "タグが指定のボードに属していません".to_string(),
        ));
    }

    let attached: i64 = tx.query_row(
        "SELECT COUNT(*) FROM task_tags WHERE task_id = ?1 AND tag_id = ?2",
        params![task_id, tag_id],
        |row| row.get(0),
    )?;
    if attached > 0 {
        tx.execute(
            "DELETE FROM task_tags WHERE task_id = ?1 AND tag_id = ?2",
            params![task_id, tag_id],
        )?;
    } else {
        // 存在確認とボード検証は上で済んでいるので、ここでの INSERT は通常想定どおり成功する
        tx.execute(
            "INSERT INTO task_tags (task_id, tag_id) VALUES (?1, ?2)",
            params![task_id, tag_id],
        )?;
    }
    tx.commit()?;

    load_tag_ids(conn, task_id)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db;

    #[test]
    fn ボードを作ると一覧に出る() {
        let mut conn = db::open_in_memory().expect("インメモリDBを開けること");

        let created = board_create(&mut conn, "メイン").expect("ボードを作れること");
        let boards = boards_list(&mut conn).expect("一覧を取れること");

        assert_eq!(created.name, "メイン");
        assert_eq!(created.position, 0);
        assert_eq!(boards.len(), 1);
        assert_eq!(boards[0], created);
    }

    #[test]
    fn ボードのpositionは作成順に採番される() {
        let mut conn = db::open_in_memory().expect("インメモリDBを開けること");

        board_create(&mut conn, "1枚目").expect("作れること");
        board_create(&mut conn, "2枚目").expect("作れること");
        board_create(&mut conn, "3枚目").expect("作れること");

        let boards = boards_list(&mut conn).expect("一覧を取れること");
        let names: Vec<&str> = boards.iter().map(|b| b.name.as_str()).collect();
        let positions: Vec<i64> = boards.iter().map(|b| b.position).collect();

        assert_eq!(names, vec!["1枚目", "2枚目", "3枚目"]);
        assert_eq!(positions, vec![0, 1, 2]);
    }

    #[test]
    fn ボード作成時にデフォルトステータスが4つ入る() {
        let mut conn = db::open_in_memory().expect("インメモリDBを開けること");

        let board = board_create(&mut conn, "メイン").expect("ボードを作れること");
        let statuses = statuses_list(&mut conn, &board.id).expect("ステータス一覧を取れること");

        let actual: Vec<(&str, &str, i64)> = statuses
            .iter()
            .map(|s| (s.name.as_str(), s.color.as_str(), s.position))
            .collect();
        assert_eq!(
            actual,
            vec![
                ("未着手", "#8E8E93", 0),
                ("進行中", "#5AC8FA", 1),
                ("確認中", "#FF9500", 2),
                ("完了", "#34C759", 3),
            ]
        );
        assert!(statuses.iter().all(|s| s.board_id == board.id));
    }

    #[test]
    fn default_statuses_はプリセットの先頭4件を返す() {
        let defaults = default_statuses();
        assert_eq!(defaults.len(), 4);
        assert_eq!(defaults[0], ("未着手".to_string(), "#8E8E93".to_string()));
        // ここは design/status-presets.json の2件目と一致する必要がある
        assert_eq!(defaults[1].1, "#5AC8FA");
    }

    #[test]
    fn ボードを改名できる() {
        let mut conn = db::open_in_memory().expect("インメモリDBを開けること");
        let board = board_create(&mut conn, "旧名").expect("ボードを作れること");

        let renamed = board_rename(&mut conn, &board.id, "新名").expect("改名できること");

        assert_eq!(renamed.id, board.id);
        assert_eq!(renamed.name, "新名");
        assert_eq!(renamed.position, board.position);
    }

    #[test]
    fn 存在しないボードの改名はNotFoundになる() {
        let mut conn = db::open_in_memory().expect("インメモリDBを開けること");

        let result = board_rename(&mut conn, "no-such-id", "新名");

        assert!(matches!(result, Err(RepoError::NotFound(_))));
    }

    #[test]
    fn ボードを削除するとステータスとタスクも消える() {
        let mut conn = db::open_in_memory().expect("インメモリDBを開けること");
        let board = board_create(&mut conn, "メイン").expect("ボードを作れること");
        let statuses = statuses_list(&mut conn, &board.id).expect("ステータス一覧を取れること");
        task_create(&mut conn, &board.id, &statuses[0].id, "作業").expect("タスクを作れること");

        board_delete(&mut conn, &board.id).expect("ボードを削除できること");

        assert_eq!(boards_list(&mut conn).expect("一覧").len(), 0);
        assert_eq!(
            statuses_list(&mut conn, &board.id).expect("ステータス一覧").len(),
            0
        );
        assert_eq!(tasks_list(&mut conn, &board.id).expect("タスク一覧").len(), 0);
    }

    #[test]
    fn ボードを消すとタグとタスクタグも消える() {
        let mut conn = db::open_in_memory().expect("インメモリDBを開けること");
        let board = board_create(&mut conn, "メイン").expect("ボードを作れること");
        let statuses = statuses_list(&mut conn, &board.id).expect("ステータス一覧を取れること");
        let task = task_create(&mut conn, &board.id, &statuses[0].id, "作業")
            .expect("タスクを作れること");
        let tag = super::tag_create(&mut conn, &board.id, "バグ").expect("タグを作れること");
        super::task_tag_toggle(&mut conn, &task.id, &tag.id).expect("タグを付けられること");

        board_delete(&mut conn, &board.id).expect("ボードを削除できること");

        let tags: i64 = conn
            .query_row("SELECT COUNT(*) FROM tags", [], |row| row.get(0))
            .expect("件数を数えられること");
        let links: i64 = conn
            .query_row("SELECT COUNT(*) FROM task_tags", [], |row| row.get(0))
            .expect("件数を数えられること");
        assert_eq!(tags, 0);
        assert_eq!(links, 0);
    }

    /// テスト用: インメモリDB + ボード1枚（デフォルトステータス4つ付き）を用意する
    fn setup_board() -> (rusqlite::Connection, String) {
        let mut conn = db::open_in_memory().expect("インメモリDBを開けること");
        let board = board_create(&mut conn, "テスト").expect("ボードを作れること");
        (conn, board.id)
    }

    #[test]
    fn ステータスは末尾に追加される() {
        let (mut conn, board_id) = setup_board();

        let created = status_create(&mut conn, &board_id, "保留", "#AF52DE")
            .expect("ステータスを作れること");

        assert_eq!(created.position, 4, "デフォルト4つの後ろに付く");
        assert_eq!(created.name, "保留");
        assert_eq!(created.color, "#AF52DE");
        assert_eq!(created.board_id, board_id);
    }

    #[test]
    fn ステータスの名前だけ更新できる() {
        let (mut conn, board_id) = setup_board();
        let statuses = statuses_list(&mut conn, &board_id).expect("一覧を取れること");
        let target = &statuses[1];

        let updated = status_update(&mut conn, &target.id, Some("作業中"), None)
            .expect("更新できること");

        assert_eq!(updated.name, "作業中");
        assert_eq!(updated.color, target.color, "色は変わらない");
    }

    #[test]
    fn ステータスの色だけ更新できる() {
        let (mut conn, board_id) = setup_board();
        let statuses = statuses_list(&mut conn, &board_id).expect("一覧を取れること");
        let target = &statuses[1];

        let updated = status_update(&mut conn, &target.id, None, Some("#FF2D55"))
            .expect("更新できること");

        assert_eq!(updated.color, "#FF2D55");
        assert_eq!(updated.name, target.name, "名前は変わらない");
    }

    #[test]
    fn ステータスを先頭へ並び替えると全件が再採番される() {
        let (mut conn, board_id) = setup_board();
        let statuses = statuses_list(&mut conn, &board_id).expect("一覧を取れること");
        let done_id = statuses[3].id.clone();

        let reordered = status_reorder(&mut conn, &done_id, 0).expect("並び替えできること");

        let names: Vec<&str> = reordered.iter().map(|s| s.name.as_str()).collect();
        let positions: Vec<i64> = reordered.iter().map(|s| s.position).collect();
        assert_eq!(names, vec!["完了", "未着手", "進行中", "確認中"]);
        assert_eq!(positions, vec![0, 1, 2, 3]);
    }

    #[test]
    fn 範囲外のインデックスは末尾にクランプされる() {
        let (mut conn, board_id) = setup_board();
        let statuses = statuses_list(&mut conn, &board_id).expect("一覧を取れること");
        let todo_id = statuses[0].id.clone();

        let reordered = status_reorder(&mut conn, &todo_id, 99).expect("並び替えできること");

        let names: Vec<&str> = reordered.iter().map(|s| s.name.as_str()).collect();
        assert_eq!(names, vec!["進行中", "確認中", "完了", "未着手"]);
    }

    #[test]
    fn ステータスを消すと所属タスクは先頭ステータスへ退避する() {
        let (mut conn, board_id) = setup_board();
        let statuses = statuses_list(&mut conn, &board_id).expect("一覧を取れること");
        let todo_id = statuses[0].id.clone();
        let doing_id = statuses[1].id.clone();
        task_create(&mut conn, &board_id, &todo_id, "既存").expect("タスクを作れること");
        let moved = task_create(&mut conn, &board_id, &doing_id, "退避対象")
            .expect("タスクを作れること");

        status_delete(&mut conn, &doing_id).expect("ステータスを削除できること");

        let tasks = tasks_list(&mut conn, &board_id).expect("タスク一覧を取れること");
        let target = tasks
            .iter()
            .find(|t| t.id == moved.id)
            .expect("退避したタスクが残っていること");
        assert_eq!(target.status_id, todo_id, "ボード先頭ステータスへ移る");
        assert_eq!(tasks.len(), 2);
    }

    #[test]
    fn ステータス削除後に退避先レーンが再採番される() {
        let (mut conn, board_id) = setup_board();
        let statuses = statuses_list(&mut conn, &board_id).expect("一覧を取れること");
        let todo_id = statuses[0].id.clone();
        let doing_id = statuses[1].id.clone();
        task_create(&mut conn, &board_id, &todo_id, "A").expect("タスクを作れること");
        task_create(&mut conn, &board_id, &doing_id, "B").expect("タスクを作れること");

        status_delete(&mut conn, &doing_id).expect("ステータスを削除できること");

        let tasks = tasks_list(&mut conn, &board_id).expect("タスク一覧を取れること");
        let mut positions: Vec<i64> = tasks.iter().map(|t| t.position).collect();
        positions.sort();
        assert_eq!(positions, vec![0, 1], "0から連番になっていること");
    }

    #[test]
    fn ステータス削除後に残りのステータスが再採番される() {
        let (mut conn, board_id) = setup_board();
        let statuses = statuses_list(&mut conn, &board_id).expect("一覧を取れること");
        let todo_id = statuses[0].id.clone();

        status_delete(&mut conn, &todo_id).expect("ステータスを削除できること");

        let remaining = statuses_list(&mut conn, &board_id).expect("一覧を取れること");
        let names: Vec<&str> = remaining.iter().map(|s| s.name.as_str()).collect();
        let positions: Vec<i64> = remaining.iter().map(|s| s.position).collect();
        assert_eq!(names, vec!["進行中", "確認中", "完了"]);
        assert_eq!(positions, vec![0, 1, 2]);
    }

    #[test]
    fn 最後の1つのステータスは削除できない() {
        let (mut conn, board_id) = setup_board();
        let statuses = statuses_list(&mut conn, &board_id).expect("一覧を取れること");
        for status in statuses.iter().take(3) {
            status_delete(&mut conn, &status.id).expect("3つまでは削除できること");
        }

        let last = statuses_list(&mut conn, &board_id).expect("一覧を取れること");
        assert_eq!(last.len(), 1);
        let result = status_delete(&mut conn, &last[0].id);

        assert!(matches!(result, Err(RepoError::Rule(_))));
        assert_eq!(
            statuses_list(&mut conn, &board_id).expect("一覧").len(),
            1,
            "失敗したので消えていないこと"
        );
    }

    #[test]
    fn 新規タスクはレーン先頭に入る() {
        let (mut conn, board_id) = setup_board();
        let statuses = statuses_list(&mut conn, &board_id).expect("一覧を取れること");
        let todo_id = statuses[0].id.clone();

        task_create(&mut conn, &board_id, &todo_id, "A").expect("作れること");
        task_create(&mut conn, &board_id, &todo_id, "B").expect("作れること");
        let newest = task_create(&mut conn, &board_id, &todo_id, "C").expect("作れること");

        let tasks = tasks_list(&mut conn, &board_id).expect("一覧を取れること");
        let titles: Vec<&str> = tasks.iter().map(|t| t.title.as_str()).collect();
        let positions: Vec<i64> = tasks.iter().map(|t| t.position).collect();
        assert_eq!(titles, vec!["C", "B", "A"]);
        assert_eq!(positions, vec![0, 1, 2]);
        assert_eq!(newest.position, 0);
    }

    #[test]
    fn 新規タスクの本文は空文字で始まる() {
        let (mut conn, board_id) = setup_board();
        let statuses = statuses_list(&mut conn, &board_id).expect("一覧を取れること");

        let task = task_create(&mut conn, &board_id, &statuses[0].id, "新規")
            .expect("作れること");

        assert_eq!(task.content_md, "");
        assert_eq!(task.title, "新規");
        assert_eq!(task.status_id, statuses[0].id);
        assert_eq!(task.board_id, board_id);
    }

    #[test]
    fn 別ボードのステータスへタスクを作ろうとするとエラーになる() {
        let mut conn = db::open_in_memory().expect("インメモリDBを開けること");
        let board_a = board_create(&mut conn, "A").expect("ボードを作れること");
        let board_b = board_create(&mut conn, "B").expect("ボードを作れること");
        let statuses_b = statuses_list(&mut conn, &board_b.id).expect("一覧を取れること");

        let result = task_create(&mut conn, &board_a.id, &statuses_b[0].id, "不正な作成");

        assert!(matches!(result, Err(RepoError::Rule(_))));
        assert_eq!(
            tasks_list(&mut conn, &board_a.id).expect("一覧").len(),
            0,
            "失敗したので作られていないこと"
        );
    }

    #[test]
    fn レーンが違えばpositionは独立して0から始まる() {
        let (mut conn, board_id) = setup_board();
        let statuses = statuses_list(&mut conn, &board_id).expect("一覧を取れること");

        let a = task_create(&mut conn, &board_id, &statuses[0].id, "A").expect("作れること");
        let b = task_create(&mut conn, &board_id, &statuses[1].id, "B").expect("作れること");

        assert_eq!(a.position, 0);
        assert_eq!(b.position, 0);
    }

    #[test]
    fn タスクのタイトルだけ更新できる() {
        let (mut conn, board_id) = setup_board();
        let statuses = statuses_list(&mut conn, &board_id).expect("一覧を取れること");
        let task = task_create(&mut conn, &board_id, &statuses[0].id, "旧題")
            .expect("作れること");

        let updated = task_update(&mut conn, &task.id, Some("新題"), None)
            .expect("更新できること");

        assert_eq!(updated.title, "新題");
        assert_eq!(updated.content_md, "");
    }

    #[test]
    fn タスクの本文だけ更新できる() {
        let (mut conn, board_id) = setup_board();
        let statuses = statuses_list(&mut conn, &board_id).expect("一覧を取れること");
        let task = task_create(&mut conn, &board_id, &statuses[0].id, "題")
            .expect("作れること");

        let updated = task_update(&mut conn, &task.id, None, Some("# 見出し\n本文"))
            .expect("更新できること");

        assert_eq!(updated.content_md, "# 見出し\n本文");
        assert_eq!(updated.title, "題", "タイトルは変わらない");
    }

    #[test]
    fn 存在しないタスクの更新はNotFoundになる() {
        let (mut conn, _board_id) = setup_board();

        let result = task_update(&mut conn, "no-such-id", Some("題"), None);

        assert!(matches!(result, Err(RepoError::NotFound(_))));
    }

    /// テスト用: 指定レーンの生存タスクのタイトルを並び順で返す
    fn lane_titles(conn: &mut rusqlite::Connection, board_id: &str, status_id: &str) -> Vec<String> {
        tasks_list(conn, board_id)
            .expect("一覧を取れること")
            .into_iter()
            .filter(|t| t.status_id == status_id)
            .map(|t| t.title)
            .collect()
    }

    #[test]
    fn 同じレーン内で並び順を変えられる() {
        let (mut conn, board_id) = setup_board();
        let statuses = statuses_list(&mut conn, &board_id).expect("一覧を取れること");
        let todo_id = statuses[0].id.clone();
        task_create(&mut conn, &board_id, &todo_id, "A").expect("作れること");
        task_create(&mut conn, &board_id, &todo_id, "B").expect("作れること");
        let c = task_create(&mut conn, &board_id, &todo_id, "C").expect("作れること");
        // この時点のレーンは C, B, A

        let moved = task_move(&mut conn, &c.id, &todo_id, 2).expect("移動できること");

        assert_eq!(moved.position, 2);
        assert_eq!(lane_titles(&mut conn, &board_id, &todo_id), vec!["B", "A", "C"]);
    }

    #[test]
    fn 別レーンへ移すと両方のレーンが再採番される() {
        let (mut conn, board_id) = setup_board();
        let statuses = statuses_list(&mut conn, &board_id).expect("一覧を取れること");
        let todo_id = statuses[0].id.clone();
        let doing_id = statuses[1].id.clone();
        task_create(&mut conn, &board_id, &todo_id, "A").expect("作れること");
        let b = task_create(&mut conn, &board_id, &todo_id, "B").expect("作れること");
        task_create(&mut conn, &board_id, &doing_id, "X").expect("作れること");
        // todo は B, A / doing は X

        let moved = task_move(&mut conn, &b.id, &doing_id, 0).expect("移動できること");

        assert_eq!(moved.status_id, doing_id);
        assert_eq!(moved.position, 0);
        assert_eq!(lane_titles(&mut conn, &board_id, &doing_id), vec!["B", "X"]);
        assert_eq!(lane_titles(&mut conn, &board_id, &todo_id), vec!["A"]);
        let remaining = tasks_list(&mut conn, &board_id)
            .expect("一覧を取れること")
            .into_iter()
            .find(|t| t.title == "A")
            .expect("A が残っていること");
        assert_eq!(remaining.position, 0, "移動元レーンが0から詰め直される");
    }

    #[test]
    fn 別ボードのステータスへタスクを移そうとするとエラーになる() {
        let mut conn = db::open_in_memory().expect("インメモリDBを開けること");
        let board_a = board_create(&mut conn, "A").expect("ボードを作れること");
        let board_b = board_create(&mut conn, "B").expect("ボードを作れること");
        let statuses_a = statuses_list(&mut conn, &board_a.id).expect("一覧を取れること");
        let statuses_b = statuses_list(&mut conn, &board_b.id).expect("一覧を取れること");
        let task = task_create(&mut conn, &board_a.id, &statuses_a[0].id, "対象")
            .expect("タスクを作れること");

        let result = task_move(&mut conn, &task.id, &statuses_b[0].id, 0);

        assert!(matches!(result, Err(RepoError::Rule(_))));
        let unchanged = tasks_list(&mut conn, &board_a.id)
            .expect("一覧を取れること")
            .into_iter()
            .find(|t| t.id == task.id)
            .expect("タスクが残っていること");
        assert_eq!(unchanged.status_id, statuses_a[0].id, "失敗したので移動していないこと");
    }

    #[test]
    fn 範囲外のインデックスは末尾にクランプされる_タスク版() {
        let (mut conn, board_id) = setup_board();
        let statuses = statuses_list(&mut conn, &board_id).expect("一覧を取れること");
        let todo_id = statuses[0].id.clone();
        let doing_id = statuses[1].id.clone();
        task_create(&mut conn, &board_id, &doing_id, "X").expect("作れること");
        task_create(&mut conn, &board_id, &doing_id, "Y").expect("作れること");
        let a = task_create(&mut conn, &board_id, &todo_id, "A").expect("作れること");

        let moved = task_move(&mut conn, &a.id, &doing_id, 99).expect("移動できること");

        assert_eq!(moved.position, 2);
        assert_eq!(lane_titles(&mut conn, &board_id, &doing_id), vec!["Y", "X", "A"]);
    }

    #[test]
    fn 負のインデックスは先頭にクランプされる() {
        let (mut conn, board_id) = setup_board();
        let statuses = statuses_list(&mut conn, &board_id).expect("一覧を取れること");
        let todo_id = statuses[0].id.clone();
        task_create(&mut conn, &board_id, &todo_id, "A").expect("作れること");
        let b = task_create(&mut conn, &board_id, &todo_id, "B").expect("作れること");
        // レーンは B, A
        task_move(&mut conn, &b.id, &todo_id, 1).expect("いったん末尾へ");

        let moved = task_move(&mut conn, &b.id, &todo_id, -5).expect("移動できること");

        assert_eq!(moved.position, 0);
        assert_eq!(lane_titles(&mut conn, &board_id, &todo_id), vec!["B", "A"]);
    }

    #[test]
    fn 削除したタスクは一覧から消えるが行は残る() {
        let (mut conn, board_id) = setup_board();
        let statuses = statuses_list(&mut conn, &board_id).expect("一覧を取れること");
        let task = task_create(&mut conn, &board_id, &statuses[0].id, "消す")
            .expect("作れること");

        let deleted = task_delete(&mut conn, &task.id).expect("削除できること");

        assert_eq!(deleted.id, task.id);
        assert_eq!(tasks_list(&mut conn, &board_id).expect("一覧").len(), 0);
        let rows: i64 = conn
            .query_row("SELECT COUNT(*) FROM tasks", [], |row| row.get(0))
            .expect("件数を数えられること");
        assert_eq!(rows, 1, "物理削除ではないこと");
    }

    #[test]
    fn 削除後に残ったタスクが再採番される() {
        let (mut conn, board_id) = setup_board();
        let statuses = statuses_list(&mut conn, &board_id).expect("一覧を取れること");
        let todo_id = statuses[0].id.clone();
        task_create(&mut conn, &board_id, &todo_id, "A").expect("作れること");
        let b = task_create(&mut conn, &board_id, &todo_id, "B").expect("作れること");
        task_create(&mut conn, &board_id, &todo_id, "C").expect("作れること");
        // レーンは C, B, A

        task_delete(&mut conn, &b.id).expect("削除できること");

        assert_eq!(lane_titles(&mut conn, &board_id, &todo_id), vec!["C", "A"]);
        let positions: Vec<i64> = tasks_list(&mut conn, &board_id)
            .expect("一覧")
            .iter()
            .map(|t| t.position)
            .collect();
        assert_eq!(positions, vec![0, 1]);
    }

    #[test]
    fn 復元すると元の位置に戻る() {
        let (mut conn, board_id) = setup_board();
        let statuses = statuses_list(&mut conn, &board_id).expect("一覧を取れること");
        let todo_id = statuses[0].id.clone();
        task_create(&mut conn, &board_id, &todo_id, "A").expect("作れること");
        let b = task_create(&mut conn, &board_id, &todo_id, "B").expect("作れること");
        task_create(&mut conn, &board_id, &todo_id, "C").expect("作れること");
        // レーンは C, B, A
        task_delete(&mut conn, &b.id).expect("削除できること");

        let restored = task_restore(&mut conn, &b.id).expect("復元できること");

        assert_eq!(restored.position, 1);
        assert_eq!(lane_titles(&mut conn, &board_id, &todo_id), vec!["C", "B", "A"]);
    }

    #[test]
    fn 先頭のタスクを削除して復元しても先頭に戻る() {
        let (mut conn, board_id) = setup_board();
        let statuses = statuses_list(&mut conn, &board_id).expect("一覧を取れること");
        let todo_id = statuses[0].id.clone();
        task_create(&mut conn, &board_id, &todo_id, "A").expect("作れること");
        let c = task_create(&mut conn, &board_id, &todo_id, "C").expect("作れること");
        // レーンは C, A
        task_delete(&mut conn, &c.id).expect("削除できること");

        task_restore(&mut conn, &c.id).expect("復元できること");

        assert_eq!(lane_titles(&mut conn, &board_id, &todo_id), vec!["C", "A"]);
    }

    #[test]
    fn 削除済みタスクは他レーンの採番に影響しない() {
        let (mut conn, board_id) = setup_board();
        let statuses = statuses_list(&mut conn, &board_id).expect("一覧を取れること");
        let todo_id = statuses[0].id.clone();
        let a = task_create(&mut conn, &board_id, &todo_id, "A").expect("作れること");
        task_delete(&mut conn, &a.id).expect("削除できること");

        let b = task_create(&mut conn, &board_id, &todo_id, "B").expect("作れること");

        assert_eq!(b.position, 0);
        assert_eq!(lane_titles(&mut conn, &board_id, &todo_id), vec!["B"]);
    }

    #[test]
    fn タグを作ると一覧に出る() {
        let (mut conn, board_id) = setup_board();

        let created = super::tag_create(&mut conn, &board_id, "バグ").expect("タグを作れること");

        let tags = super::tags_list(&mut conn, &board_id).expect("一覧を引けること");
        assert_eq!(tags.len(), 1);
        assert_eq!(tags[0].id, created.id);
        assert_eq!(tags[0].name, "バグ");
        assert_eq!(tags[0].position, 0);
    }

    #[test]
    fn タグ名は前後の空白を落として保存される() {
        let (mut conn, board_id) = setup_board();

        let created = super::tag_create(&mut conn, &board_id, "  バグ  ").expect("タグを作れること");

        assert_eq!(created.name, "バグ");
    }

    #[test]
    fn 空のタグ名は作れない() {
        let (mut conn, board_id) = setup_board();

        let result = super::tag_create(&mut conn, &board_id, "   ");

        assert!(result.is_err());
    }

    #[test]
    fn 同名のタグは大文字小文字を無視して弾かれる() {
        let (mut conn, board_id) = setup_board();
        super::tag_create(&mut conn, &board_id, "Bug").expect("1件目を作れること");

        let result = super::tag_create(&mut conn, &board_id, "bug");

        assert!(result.is_err(), "大文字小文字違いも同名として弾くこと");
    }

    #[test]
    fn 別のボードなら同名のタグを作れる() {
        let (mut conn, board_a) = setup_board();
        let board_b = super::board_create(&mut conn, "私用").expect("2枚目のボード").id;
        super::tag_create(&mut conn, &board_a, "バグ").expect("Aに作れること");

        let created = super::tag_create(&mut conn, &board_b, "バグ").expect("Bにも作れること");

        assert_eq!(created.board_id, board_b);
    }

    #[test]
    fn タグ色は未使用の色から順に割り当てられる() {
        let (mut conn, board_id) = setup_board();

        let first = super::tag_create(&mut conn, &board_id, "一").expect("1件目");
        let second = super::tag_create(&mut conn, &board_id, "二").expect("2件目");

        assert_eq!(first.color, super::TAG_COLORS[0]);
        assert_eq!(second.color, super::TAG_COLORS[1]);
    }

    #[test]
    fn 途中のタグを消しても残りのタグの色は変わらない() {
        let (mut conn, board_id) = setup_board();
        let first = super::tag_create(&mut conn, &board_id, "一").expect("1件目");
        let second = super::tag_create(&mut conn, &board_id, "二").expect("2件目");

        super::tag_delete(&mut conn, &first.id).expect("1件目を消せること");

        let tags = super::tags_list(&mut conn, &board_id).expect("一覧を引けること");
        assert_eq!(tags.len(), 1);
        assert_eq!(tags[0].color, second.color, "色は作成時に確定して動かないこと");
    }

    #[test]
    fn 色を使い切ったら先頭から循環する() {
        let (mut conn, board_id) = setup_board();
        for index in 0..super::TAG_COLORS.len() {
            super::tag_create(&mut conn, &board_id, &format!("タグ{index}")).expect("作れること");
        }

        let extra = super::tag_create(&mut conn, &board_id, "あふれ").expect("10件目も作れること");

        assert_eq!(extra.color, super::TAG_COLORS[0]);
    }

    #[test]
    fn タグを改名できる() {
        let (mut conn, board_id) = setup_board();
        let created = super::tag_create(&mut conn, &board_id, "バグ").expect("作れること");

        let renamed = super::tag_rename(&mut conn, &created.id, " 不具合 ").expect("改名できること");

        assert_eq!(renamed.name, "不具合");
        assert_eq!(renamed.color, created.color, "改名しても色は変わらないこと");
    }

    #[test]
    fn 既にある名前へは改名できない() {
        let (mut conn, board_id) = setup_board();
        super::tag_create(&mut conn, &board_id, "バグ").expect("1件目");
        let second = super::tag_create(&mut conn, &board_id, "設計").expect("2件目");

        let result = super::tag_rename(&mut conn, &second.id, "バグ");

        assert!(result.is_err());
    }

    #[test]
    fn 自分自身と同じ名前への改名は通る() {
        let (mut conn, board_id) = setup_board();
        let created = super::tag_create(&mut conn, &board_id, "バグ").expect("作れること");

        let renamed = super::tag_rename(&mut conn, &created.id, "バグ").expect("通ること");

        assert_eq!(renamed.name, "バグ");
    }

    #[test]
    fn 存在しないタグは削除できない() {
        let mut conn = db::open_in_memory().expect("インメモリDBを開けること");

        let result = super::tag_delete(&mut conn, "no-such-tag");

        assert!(result.is_err());
    }

    /// テスト用: ボード・先頭ステータス・タスク1件を作って (conn, board_id, task_id) を返す
    fn setup_board_with_task() -> (rusqlite::Connection, String, String) {
        let (mut conn, board_id) = setup_board();
        let statuses = super::statuses_list(&mut conn, &board_id).expect("ステータス一覧");
        let task = super::task_create(&mut conn, &board_id, &statuses[0].id, "タスク")
            .expect("タスクを作れること");
        (conn, board_id, task.id)
    }

    #[test]
    fn タグの付け外しはトグルになる() {
        let (mut conn, board_id, task_id) = setup_board_with_task();
        let tag = super::tag_create(&mut conn, &board_id, "バグ").expect("タグを作れること");

        let attached =
            super::task_tag_toggle(&mut conn, &task_id, &tag.id).expect("付けられること");
        assert_eq!(attached, vec![tag.id.clone()]);

        let detached = super::task_tag_toggle(&mut conn, &task_id, &tag.id).expect("外せること");
        assert!(detached.is_empty());
    }

    #[test]
    fn tasks_listのtagIdsはタグのposition昇順になる() {
        let (mut conn, board_id, task_id) = setup_board_with_task();
        let first = super::tag_create(&mut conn, &board_id, "一").expect("1件目");
        let second = super::tag_create(&mut conn, &board_id, "二").expect("2件目");
        // わざと position の降順に付ける
        super::task_tag_toggle(&mut conn, &task_id, &second.id).expect("二を付ける");
        super::task_tag_toggle(&mut conn, &task_id, &first.id).expect("一を付ける");

        let tasks = super::tasks_list(&mut conn, &board_id).expect("一覧を引けること");

        assert_eq!(tasks[0].tag_ids, vec![first.id, second.id]);
    }

    #[test]
    fn task_updateの戻り値にもtagIdsが入る() {
        let (mut conn, board_id, task_id) = setup_board_with_task();
        let tag = super::tag_create(&mut conn, &board_id, "バグ").expect("タグを作れること");
        super::task_tag_toggle(&mut conn, &task_id, &tag.id).expect("付けられること");

        let updated = super::task_update(&mut conn, &task_id, Some("新タイトル"), None)
            .expect("更新できること");

        assert_eq!(updated.tag_ids, vec![tag.id]);
    }

    #[test]
    fn 存在しないタグは付けられない() {
        let (mut conn, _board_id, task_id) = setup_board_with_task();

        let result = super::task_tag_toggle(&mut conn, &task_id, "no-such-tag");

        assert!(
            matches!(result, Err(RepoError::NotFound(_))),
            "タグの存在チェックでNotFoundとして弾かれること"
        );
    }

    #[test]
    fn 別ボードのタグを付けようとするとエラーになる() {
        let (mut conn, _board_id, task_id) = setup_board_with_task();
        let other_board_id = super::board_create(&mut conn, "別ボード")
            .expect("別ボードを作れること")
            .id;
        let other_tag = super::tag_create(&mut conn, &other_board_id, "他ボードのタグ")
            .expect("タグを作れること");

        let result = super::task_tag_toggle(&mut conn, &task_id, &other_tag.id);

        assert!(matches!(result, Err(RepoError::Rule(_))));
    }

    #[test]
    fn タグを消すとタスクからも外れる() {
        let (mut conn, board_id, task_id) = setup_board_with_task();
        let tag = super::tag_create(&mut conn, &board_id, "バグ").expect("タグを作れること");
        super::task_tag_toggle(&mut conn, &task_id, &tag.id).expect("付けられること");

        super::tag_delete(&mut conn, &tag.id).expect("タグを消せること");

        let tasks = super::tasks_list(&mut conn, &board_id).expect("一覧を引けること");
        assert!(tasks[0].tag_ids.is_empty());
    }

    #[test]
    fn タスクをソフトデリートしてもタグは残る() {
        let (mut conn, board_id, task_id) = setup_board_with_task();
        let tag = super::tag_create(&mut conn, &board_id, "バグ").expect("タグを作れること");
        super::task_tag_toggle(&mut conn, &task_id, &tag.id).expect("付けられること");

        super::task_delete(&mut conn, &task_id).expect("削除できること");
        let restored = super::task_restore(&mut conn, &task_id).expect("復元できること");

        assert_eq!(restored.tag_ids, vec![tag.id], "復元後もタグ付きであること");
    }

    #[test]
    fn 未設定のキーはNoneを返す() {
        let mut conn = db::open_in_memory().expect("インメモリDBを開けること");

        let value = setting_get(&mut conn, "hotkey").expect("取得できること");

        assert_eq!(value, None);
    }

    #[test]
    fn 設定は上書き保存できる() {
        let mut conn = db::open_in_memory().expect("インメモリDBを開けること");

        setting_set(&mut conn, "hotkey", "Alt+Space").expect("保存できること");
        setting_set(&mut conn, "hotkey", "Ctrl+Space").expect("上書きできること");

        assert_eq!(
            setting_get(&mut conn, "hotkey").expect("取得できること"),
            Some("Ctrl+Space".to_string())
        );
        let rows: i64 = conn
            .query_row("SELECT COUNT(*) FROM settings", [], |row| row.get(0))
            .expect("件数を数えられること");
        assert_eq!(rows, 1, "行が増えないこと");
    }

    #[test]
    fn 初回シードでメインボードとホットキー既定値が入る() {
        let mut conn = db::open_in_memory().expect("インメモリDBを開けること");

        seed_if_empty(&mut conn).expect("シードできること");

        let boards = boards_list(&mut conn).expect("一覧を取れること");
        assert_eq!(boards.len(), 1);
        assert_eq!(boards[0].name, "メイン");
        let statuses = statuses_list(&mut conn, &boards[0].id).expect("一覧を取れること");
        assert_eq!(statuses.len(), 4);
        assert_eq!(
            setting_get(&mut conn, HOTKEY_SETTING_KEY).expect("取得できること"),
            Some(DEFAULT_HOTKEY.to_string())
        );
    }

    #[test]
    fn 二度目のシードでは何も増えない() {
        let mut conn = db::open_in_memory().expect("インメモリDBを開けること");
        seed_if_empty(&mut conn).expect("1回目");

        seed_if_empty(&mut conn).expect("2回目");

        assert_eq!(boards_list(&mut conn).expect("一覧").len(), 1);
    }

    #[test]
    fn ホットキーを変更済みならシードで上書きしない() {
        let mut conn = db::open_in_memory().expect("インメモリDBを開けること");
        setting_set(&mut conn, HOTKEY_SETTING_KEY, "Ctrl+Shift+T").expect("保存できること");

        seed_if_empty(&mut conn).expect("シードできること");

        assert_eq!(
            setting_get(&mut conn, HOTKEY_SETTING_KEY).expect("取得できること"),
            Some("Ctrl+Shift+T".to_string())
        );
    }

    #[test]
    fn 設定キー名は計画書2と3が参照するので固定する() {
        // 実装コントラクトで固定された名前。変えると後続の計画書が壊れる。
        assert_eq!(HOTKEY_SETTING_KEY, "hotkey");
        assert_eq!(HOTKEY_ERROR_SETTING_KEY, "hotkeyError");
        assert_eq!(DEFAULT_HOTKEY, "Alt+Space");
    }

    /// 画像テスト用に、ボード1枚とタスク1件を作って返す
    fn setup_task(conn: &mut Connection) -> Task {
        let board = board_create(conn, "メイン").expect("ボードを作れること");
        let statuses = statuses_list(conn, &board.id).expect("ステータス一覧を取れること");
        task_create(conn, &board.id, &statuses[0].id, "画像つきタスク").expect("タスクを作れること")
    }

    #[test]
    fn 保存した画像をidで引き戻せる() {
        let mut conn = db::open_in_memory().expect("インメモリDBを開けること");
        let task = setup_task(&mut conn);

        let id = image_create(&mut conn, &task.id, "image/png", &[0x89, 0x50, 0x4E, 0x47])
            .expect("画像を保存できること");
        let (mime, bytes) = image_read(&mut conn, &id).expect("画像を引けること");

        assert_eq!(mime, "image/png");
        assert_eq!(bytes, vec![0x89, 0x50, 0x4E, 0x47]);
    }

    #[test]
    fn 存在しないタスクの画像は保存できない() {
        let mut conn = db::open_in_memory().expect("インメモリDBを開けること");

        let result = image_create(&mut conn, "no-such-task", "image/png", &[0x89]);

        assert!(
            matches!(result, Err(RepoError::NotFound(_))),
            "外部キー違反ではなくNotFoundで返すこと"
        );
    }

    #[test]
    fn 存在しない画像idはNotFoundになる() {
        let mut conn = db::open_in_memory().expect("インメモリDBを開けること");

        let result = image_read(&mut conn, "no-such-image");

        assert!(matches!(result, Err(RepoError::NotFound(_))));
    }

    #[test]
    fn 画像は毎回別のidで保存される() {
        let mut conn = db::open_in_memory().expect("インメモリDBを開けること");
        let task = setup_task(&mut conn);

        let first = image_create(&mut conn, &task.id, "image/png", &[0x01])
            .expect("1枚目を保存できること");
        let second = image_create(&mut conn, &task.id, "image/png", &[0x02])
            .expect("2枚目を保存できること");

        assert_ne!(first, second);
        assert_eq!(image_read(&mut conn, &first).expect("1枚目を引けること").1, vec![0x01]);
        assert_eq!(image_read(&mut conn, &second).expect("2枚目を引けること").1, vec![0x02]);
    }

    #[test]
    fn タスクを削除して復元しても画像は残る() {
        let mut conn = db::open_in_memory().expect("インメモリDBを開けること");
        let task = setup_task(&mut conn);
        let id = image_create(&mut conn, &task.id, "image/png", &[0x89, 0x50])
            .expect("画像を保存できること");

        task_delete(&mut conn, &task.id).expect("タスクを削除できること");
        assert!(
            image_read(&mut conn, &id).is_ok(),
            "論理削除では画像を消してはいけない（復元で戻せなくなる）"
        );

        task_restore(&mut conn, &task.id).expect("タスクを復元できること");

        let (_, bytes) = image_read(&mut conn, &id).expect("復元後も画像を引けること");
        assert_eq!(bytes, vec![0x89, 0x50]);
    }

    #[test]
    fn ボードを削除すると画像も消える() {
        let mut conn = db::open_in_memory().expect("インメモリDBを開けること");
        let board = board_create(&mut conn, "メイン").expect("ボードを作れること");
        let statuses = statuses_list(&mut conn, &board.id).expect("ステータス一覧を取れること");
        let task = task_create(&mut conn, &board.id, &statuses[0].id, "画像つきタスク")
            .expect("タスクを作れること");
        let id = image_create(&mut conn, &task.id, "image/png", &[0x89])
            .expect("画像を保存できること");

        board_delete(&mut conn, &board.id).expect("ボードを削除できること");

        assert!(
            matches!(image_read(&mut conn, &id), Err(RepoError::NotFound(_))),
            "ボード削除で画像が取り残されてはいけない"
        );
    }
}
