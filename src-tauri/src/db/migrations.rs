//! schema_migrations 方式のマイグレーション。

use rusqlite::Connection;

use super::Result;

/// マイグレーション v1: 初期スキーマ
const V1: &str = r#"
CREATE TABLE boards (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  position   INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE statuses (
  id         TEXT PRIMARY KEY,
  board_id   TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  color      TEXT NOT NULL,
  position   INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE tasks (
  id         TEXT PRIMARY KEY,
  board_id   TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  status_id  TEXT NOT NULL REFERENCES statuses(id),
  title      TEXT NOT NULL,
  content_md TEXT NOT NULL DEFAULT '',
  position   INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT
);
CREATE TABLE settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
"#;

/// (バージョン, SQL) の一覧。将来のマイグレーションは末尾に足すだけでよい。
pub const MIGRATIONS: &[(i64, &str)] = &[(1, V1)];

/// 未適用のマイグレーションを順に適用する。何度呼んでも安全（冪等）。
pub fn migrate(conn: &mut Connection) -> Result<()> {
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS schema_migrations (
           version    INTEGER PRIMARY KEY,
           applied_at TEXT NOT NULL DEFAULT (datetime('now'))
         );",
    )?;

    for (version, sql) in MIGRATIONS {
        let applied: i64 = conn.query_row(
            "SELECT COUNT(*) FROM schema_migrations WHERE version = ?1",
            [*version],
            |row| row.get(0),
        )?;
        if applied > 0 {
            continue;
        }

        // DDLと適用記録は同一トランザクションで行う（途中で落ちても中途半端にならない）
        let tx = conn.transaction()?;
        tx.execute_batch(sql)?;
        tx.execute(
            "INSERT INTO schema_migrations (version) VALUES (?1)",
            [*version],
        )?;
        tx.commit()?;
    }

    Ok(())
}

/// 適用済みの最大バージョンを返す。1件も無ければ 0。
/// 現状はテストの検証専用（本体コードから使うようになったら cfg を外す）
#[cfg(test)]
pub fn current_version(conn: &Connection) -> Result<i64> {
    let version: Option<i64> = conn.query_row(
        "SELECT MAX(version) FROM schema_migrations",
        [],
        |row| row.get(0),
    )?;
    Ok(version.unwrap_or(0))
}

#[cfg(test)]
mod tests {
    use crate::db;

    /// テーブル名が存在するか調べる
    fn table_exists(conn: &rusqlite::Connection, name: &str) -> bool {
        let count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = ?1",
                [name],
                |row| row.get(0),
            )
            .expect("sqlite_master を引けること");
        count == 1
    }

    #[test]
    fn v1のテーブルが全部作られる() {
        let conn = db::open_in_memory().expect("インメモリDBを開けること");

        assert!(table_exists(&conn, "boards"));
        assert!(table_exists(&conn, "statuses"));
        assert!(table_exists(&conn, "tasks"));
        assert!(table_exists(&conn, "settings"));
        assert!(table_exists(&conn, "schema_migrations"));
    }

    #[test]
    fn 適用後のスキーマバージョンは1になる() {
        let conn = db::open_in_memory().expect("インメモリDBを開けること");

        let version = super::current_version(&conn).expect("バージョンを取得できること");

        assert_eq!(version, 1);
    }

    #[test]
    fn migrateを二度呼んでもエラーにならない() {
        let mut conn = db::open_in_memory().expect("インメモリDBを開けること");

        super::migrate(&mut conn).expect("2回目のmigrateも成功すること");

        let applied: i64 = conn
            .query_row("SELECT COUNT(*) FROM schema_migrations", [], |row| row.get(0))
            .expect("件数を数えられること");
        assert_eq!(applied, 1, "同じバージョンが二重に記録されてはいけない");
    }

    #[test]
    fn 外部キーが有効になっている() {
        let conn = db::open_in_memory().expect("インメモリDBを開けること");

        let enabled: i64 = conn
            .query_row("PRAGMA foreign_keys", [], |row| row.get(0))
            .expect("PRAGMAを引けること");

        assert_eq!(enabled, 1);
    }

    #[test]
    fn 存在しないボードIDのステータスは作れない() {
        let conn = db::open_in_memory().expect("インメモリDBを開けること");

        let result = conn.execute(
            "INSERT INTO statuses (id, board_id, name, color, position) VALUES ('s1', 'no-such-board', 'X', '#000000', 0)",
            [],
        );

        assert!(result.is_err(), "外部キー制約で弾かれること");
    }
}
