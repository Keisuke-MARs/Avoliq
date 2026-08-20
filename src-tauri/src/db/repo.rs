//! リポジトリ層。SQLを書くのはこのファイルだけ。Tauriには依存しない。
//!
//! 並び順は「整数positionの全件再採番方式」で管理する。レーン内の件数は少ない前提。

use rusqlite::{params, Connection, OptionalExtension, Row, Transaction};
use uuid::Uuid;

use super::{Board, RepoError, Result, Status, Task};

/// 新規ボード作成時に自動投入するデフォルトステータス（name, color）。並び順は配列の順。
pub const DEFAULT_STATUSES: &[(&str, &str)] = &[
    ("未着手", "#8E8E93"),
    ("進行中", "#007AFF"),
    ("確認中", "#FF9500"),
    ("完了", "#34C759"),
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
    for (index, (status_name, color)) in DEFAULT_STATUSES.iter().enumerate() {
        tx.execute(
            "INSERT INTO statuses (id, board_id, name, color, position) VALUES (?1, ?2, ?3, ?4, ?5)",
            params![new_id(), &board_id, *status_name, *color, index as i64],
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

/// ボードを物理削除する。所属するステータスとタスクも消える。
///
/// スキーマ上は ON DELETE CASCADE が付いているが、tasks.status_id → statuses(id) の
/// 外部キーがカスケードの処理順によっては先に破られてしまう。順序を自分で決めて消す。
pub fn board_delete(conn: &mut Connection, id: &str) -> Result<()> {
    let tx = conn.transaction()?;
    tx.execute("DELETE FROM tasks WHERE board_id = ?1", params![id])?;
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

/// IDでタスクを1件引く（削除済みも引ける）
fn task_by_id(conn: &Connection, id: &str) -> Result<Task> {
    conn.query_row(
        "SELECT id, board_id, status_id, title, content_md, position, created_at, updated_at
         FROM tasks WHERE id = ?1",
        params![id],
        row_to_task,
    )
    .optional()?
    .ok_or_else(|| RepoError::NotFound(format!("タスク {id}")))
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

/// ボード内の生存タスク一覧（position昇順）
pub fn tasks_list(conn: &mut Connection, board_id: &str) -> Result<Vec<Task>> {
    let mut stmt = conn.prepare(
        "SELECT id, board_id, status_id, title, content_md, position, created_at, updated_at
         FROM tasks
         WHERE board_id = ?1 AND deleted_at IS NULL
         ORDER BY position, rowid",
    )?;
    let tasks = stmt
        .query_map(params![board_id], row_to_task)?
        .collect::<rusqlite::Result<Vec<Task>>>()?;
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
                ("進行中", "#007AFF", 1),
                ("確認中", "#FF9500", 2),
                ("完了", "#34C759", 3),
            ]
        );
        assert!(statuses.iter().all(|s| s.board_id == board.id));
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
}
