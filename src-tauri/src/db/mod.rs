//! DB層のエントリポイント。接続の生成・初期化と、フロントへ渡すモデル型を定義する。

pub mod migrations;

use std::path::Path;

use rusqlite::Connection;
use serde::{Deserialize, Serialize};

/// リポジトリ層のエラー。Tauriコマンドでは Display 経由で String に変換する。
#[derive(Debug)]
pub enum RepoError {
    /// SQLite そのもののエラー
    Sqlite(rusqlite::Error),
    /// 対象レコードが見つからない
    NotFound(String),
    /// 業務ルール違反（例: 最後のステータスは削除できない）
    Rule(String),
}

impl std::fmt::Display for RepoError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            RepoError::Sqlite(e) => write!(f, "DBエラー: {e}"),
            RepoError::NotFound(what) => write!(f, "見つかりません: {what}"),
            RepoError::Rule(message) => write!(f, "{message}"),
        }
    }
}

impl std::error::Error for RepoError {}

impl From<rusqlite::Error> for RepoError {
    fn from(error: rusqlite::Error) -> Self {
        RepoError::Sqlite(error)
    }
}

/// DB層の共通 Result 型
pub type Result<T> = std::result::Result<T, RepoError>;

/// 接続を使える状態にする（外部キー有効化 + 未適用マイグレーションの適用）。
fn prepare(conn: &mut Connection) -> Result<()> {
    // 外部キーは接続ごとに有効化する必要がある（SQLiteの既定はOFF）
    conn.execute_batch("PRAGMA foreign_keys = ON;")?;
    migrations::migrate(conn)?;
    Ok(())
}

/// テスト用のインメモリ接続を作る。
pub fn open_in_memory() -> Result<Connection> {
    let mut conn = Connection::open_in_memory()?;
    prepare(&mut conn)?;
    Ok(conn)
}

/// 指定パスのDBを開く。親ディレクトリが無ければ作る。
pub fn open_at(path: &Path) -> Result<Connection> {
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir)
            .map_err(|e| RepoError::Rule(format!("DBディレクトリを作成できません: {e}")))?;
    }
    let mut conn = Connection::open(path)?;
    prepare(&mut conn)?;
    Ok(conn)
}

/// ボード
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Board {
    pub id: String,
    pub name: String,
    pub position: i64,
}

/// ステータス（カンバンのレーン）
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Status {
    pub id: String,
    pub board_id: String,
    pub name: String,
    pub color: String,
    pub position: i64,
}

/// タスク
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Task {
    pub id: String,
    pub board_id: String,
    pub status_id: String,
    pub title: String,
    pub content_md: String,
    pub position: i64,
    pub created_at: String,
    pub updated_at: String,
}
