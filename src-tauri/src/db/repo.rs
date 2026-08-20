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
}
