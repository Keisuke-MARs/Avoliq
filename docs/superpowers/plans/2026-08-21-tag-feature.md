# タグ機能 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Avoliq のタスクに複数のタグを付けられるようにし、看板に色付きチップで表示し、検索バーの `#タグ名` で絞り込めるようにする。

**Architecture:** SQLite に `tags` / `task_tags` を migration v2 で追加し、Rust のリポジトリ層に CRUD とトグルを実装する。`Task` に `tagIds` を持たせ、Task を返す全経路（`task_by_id` と `tasks_list` の2箇所のみ）で埋める。フロントは `⌘K` で開くオーバーレイ「タグパレット」1枚で付与・作成・改名・削除を完結させ、看板のカードには自動割当色のチップを出す。

**Tech Stack:** Rust / rusqlite / Tauri v2 / React 19 / TypeScript / zustand / Tailwind v4 / Vitest + Testing Library / cargo test

**設計書:** `docs/superpowers/specs/2026-08-21-tag-feature-design.md`（本計画はこの設計書に完全に従う。名前・型・シグネチャを勝手に変えないこと）

## 前提コマンド

- Rust テスト: `cd src-tauri && cargo test`
- フロントテスト: `npm run test -- --run`（単体は `npm run test -- --run src/lib/boardNav.test.ts`）
- 型チェック＋ビルド: `npm run build`

## ファイル構成

**新規作成**

| ファイル | 責務 |
|---|---|
| `src/lib/tagPalette.ts` | タグ色プリセット9色と、チップ配色を返す純関数 |
| `src/lib/tagPalette.test.ts` | 同上のテスト |
| `src/components/TagPalette.tsx` | `⌘K` で開くタグ付与・管理オーバーレイ |
| `src/components/TagPalette.test.tsx` | 同上のテスト |

**変更**

| ファイル | 変更内容 |
|---|---|
| `src-tauri/src/db/migrations.rs` | migration v2（`tags` / `task_tags`） |
| `src-tauri/src/db/mod.rs` | `Tag` 構造体追加 / `Task` に `tag_ids` |
| `src-tauri/src/db/repo.rs` | タグ CRUD・トグル・`tag_ids` の充填・`board_delete` |
| `src-tauri/src/commands.rs` | タグ系 Tauri コマンド5つ |
| `src-tauri/src/lib.rs` | `invoke_handler` へ登録 |
| `src/types.ts` | `Tag` 追加 / `Task.tagIds` |
| `src/lib/api.ts` | invoke ラッパー5つ |
| `src/lib/boardNav.ts` | `parseSearchQuery` 追加 / `filterTasks` 拡張 |
| `src/store/appStore.ts` | `tags` / `tagPaletteOpen` / タグ系アクション |
| `src/test/fixtures.ts` | `makeTask` に `tagIds` / `tags` フィクスチャ |
| `src/index.css` | `--st-tag-*` トークン |
| `src/components/TaskCard.tsx` | チップ表示と `+n` |
| `src/components/TaskDetail.tsx` | タイトル直下のタグ行 |
| `src/components/Board.tsx` | `filterTasks` の引数追加 |
| `src/components/SearchBar.tsx` | `#` サジェストと絞り込みハイライト |
| `src/components/Palette.tsx` | `TagPalette` のマウント |
| `src/components/FooterHints.tsx` | `⌘K タグ` |
| `src/hooks/useKeyboard.ts` | `⌘K` / `defaultPrevented` / `tagPaletteOpen` ガード |

---

# フェーズ1 — Rust（DB層）

### Task 1: migration v2（tags / task_tags）

**Files:**
- Modify: `src-tauri/src/db/migrations.rs:43`（`MIGRATIONS` 定数）
- Test: `src-tauri/src/db/migrations.rs`（同ファイルの `#[cfg(test)] mod tests`）

- [ ] **Step 1: 失敗するテストを書く**

`src-tauri/src/db/migrations.rs` の `mod tests` の末尾に追加する。

```rust
    #[test]
    fn v2でタグのテーブルが作られる() {
        let conn = db::open_in_memory().expect("インメモリDBを開けること");

        assert!(table_exists(&conn, "tags"));
        assert!(table_exists(&conn, "task_tags"));
    }

    #[test]
    fn 適用後のスキーマバージョンは2になる() {
        let conn = db::open_in_memory().expect("インメモリDBを開けること");

        let version = super::current_version(&conn).expect("バージョンを取得できること");

        assert_eq!(version, 2);
    }

    #[test]
    fn 同じボードに同名のタグは入れられない() {
        let conn = db::open_in_memory().expect("インメモリDBを開けること");
        conn.execute(
            "INSERT INTO boards (id, name, position) VALUES ('b1', 'メイン', 0)",
            [],
        )
        .expect("ボードを作れること");
        conn.execute(
            "INSERT INTO tags (id, board_id, name, color, position) VALUES ('g1', 'b1', 'バグ', '#7EA9E8', 0)",
            [],
        )
        .expect("1件目のタグを作れること");

        let result = conn.execute(
            "INSERT INTO tags (id, board_id, name, color, position) VALUES ('g2', 'b1', 'バグ', '#E8B478', 1)",
            [],
        );

        assert!(result.is_err(), "UNIQUE制約で弾かれること");
    }
```

既存の `適用後のスキーマバージョンは1になる` テストは v2 追加で必ず落ちるので、**削除する**（上の `適用後のスキーマバージョンは2になる` が置き換え）。

- [ ] **Step 2: テストを実行して失敗を確認**

Run: `cd src-tauri && cargo test migrations`
Expected: FAIL（`table_exists(&conn, "tags")` が false、バージョンが 1）

- [ ] **Step 3: 最小の実装を書く**

`src-tauri/src/db/migrations.rs` の `V1` 定数の直後に追加する。

```rust
/// マイグレーション v2: タグ（tags / task_tags）
const V2: &str = r#"
CREATE TABLE tags (
  id         TEXT PRIMARY KEY,
  board_id   TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  color      TEXT NOT NULL,
  position   INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX idx_tags_board_name ON tags(board_id, name);

CREATE TABLE task_tags (
  task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  tag_id  TEXT NOT NULL REFERENCES tags(id)  ON DELETE CASCADE,
  PRIMARY KEY (task_id, tag_id)
);
CREATE INDEX idx_task_tags_tag ON task_tags(tag_id);
"#;
```

`MIGRATIONS` を書き換える。

```rust
pub const MIGRATIONS: &[(i64, &str)] = &[(1, V1), (2, V2)];
```

- [ ] **Step 4: テストを実行して成功を確認**

Run: `cd src-tauri && cargo test migrations`
Expected: PASS（既存の `migrateを二度呼んでもエラーにならない` は件数を数えているので、そちらは `assert_eq!(applied, 1, ...)` を `assert_eq!(applied, 2, ...)` に直す必要がある。落ちたら直すこと）

- [ ] **Step 5: コミット**

```bash
git add src-tauri/src/db/migrations.rs
git commit -m "feat: タグ用テーブルのマイグレーション(v2)を追加"
```

---

### Task 2: Tag 型と tags の CRUD（色の自動割当込み）

**Files:**
- Modify: `src-tauri/src/db/mod.rs:102`（`Task` の後ろに `Tag` を追加）
- Modify: `src-tauri/src/db/repo.rs`
- Test: `src-tauri/src/db/repo.rs`（同ファイルの `#[cfg(test)] mod tests`）

- [ ] **Step 1: 失敗するテストを書く**

`src-tauri/src/db/repo.rs` の `mod tests` に追加する。既存テストがボードを作るためのヘルパを持っているはずなので、無ければ次のヘルパを `mod tests` の先頭に置く。

```rust
    /// テスト用: 空のDBにボードを1枚作ってそのidを返す
    fn setup_board(conn: &mut rusqlite::Connection) -> String {
        super::board_create(conn, "メイン").expect("ボードを作れること").id
    }
```

```rust
    #[test]
    fn タグを作ると一覧に出る() {
        let mut conn = db::open_in_memory().expect("インメモリDBを開けること");
        let board_id = setup_board(&mut conn);

        let created = super::tag_create(&mut conn, &board_id, "バグ").expect("タグを作れること");

        let tags = super::tags_list(&mut conn, &board_id).expect("一覧を引けること");
        assert_eq!(tags.len(), 1);
        assert_eq!(tags[0].id, created.id);
        assert_eq!(tags[0].name, "バグ");
        assert_eq!(tags[0].position, 0);
    }

    #[test]
    fn タグ名は前後の空白を落として保存される() {
        let mut conn = db::open_in_memory().expect("インメモリDBを開けること");
        let board_id = setup_board(&mut conn);

        let created = super::tag_create(&mut conn, &board_id, "  バグ  ").expect("タグを作れること");

        assert_eq!(created.name, "バグ");
    }

    #[test]
    fn 空のタグ名は作れない() {
        let mut conn = db::open_in_memory().expect("インメモリDBを開けること");
        let board_id = setup_board(&mut conn);

        let result = super::tag_create(&mut conn, &board_id, "   ");

        assert!(result.is_err());
    }

    #[test]
    fn 同名のタグは大文字小文字を無視して弾かれる() {
        let mut conn = db::open_in_memory().expect("インメモリDBを開けること");
        let board_id = setup_board(&mut conn);
        super::tag_create(&mut conn, &board_id, "Bug").expect("1件目を作れること");

        let result = super::tag_create(&mut conn, &board_id, "bug");

        assert!(result.is_err(), "大文字小文字違いも同名として弾くこと");
    }

    #[test]
    fn 別のボードなら同名のタグを作れる() {
        let mut conn = db::open_in_memory().expect("インメモリDBを開けること");
        let board_a = setup_board(&mut conn);
        let board_b = super::board_create(&mut conn, "私用").expect("2枚目のボード").id;
        super::tag_create(&mut conn, &board_a, "バグ").expect("Aに作れること");

        let created = super::tag_create(&mut conn, &board_b, "バグ").expect("Bにも作れること");

        assert_eq!(created.board_id, board_b);
    }

    #[test]
    fn タグ色は未使用の色から順に割り当てられる() {
        let mut conn = db::open_in_memory().expect("インメモリDBを開けること");
        let board_id = setup_board(&mut conn);

        let first = super::tag_create(&mut conn, &board_id, "一").expect("1件目");
        let second = super::tag_create(&mut conn, &board_id, "二").expect("2件目");

        assert_eq!(first.color, super::TAG_COLORS[0]);
        assert_eq!(second.color, super::TAG_COLORS[1]);
    }

    #[test]
    fn 途中のタグを消しても残りのタグの色は変わらない() {
        let mut conn = db::open_in_memory().expect("インメモリDBを開けること");
        let board_id = setup_board(&mut conn);
        let first = super::tag_create(&mut conn, &board_id, "一").expect("1件目");
        let second = super::tag_create(&mut conn, &board_id, "二").expect("2件目");

        super::tag_delete(&mut conn, &first.id).expect("1件目を消せること");

        let tags = super::tags_list(&mut conn, &board_id).expect("一覧を引けること");
        assert_eq!(tags.len(), 1);
        assert_eq!(tags[0].color, second.color, "色は作成時に確定して動かないこと");
    }

    #[test]
    fn 色を使い切ったら先頭から循環する() {
        let mut conn = db::open_in_memory().expect("インメモリDBを開けること");
        let board_id = setup_board(&mut conn);
        for index in 0..super::TAG_COLORS.len() {
            super::tag_create(&mut conn, &board_id, &format!("タグ{index}")).expect("作れること");
        }

        let extra = super::tag_create(&mut conn, &board_id, "あふれ").expect("10件目も作れること");

        assert_eq!(extra.color, super::TAG_COLORS[0]);
    }

    #[test]
    fn タグを改名できる() {
        let mut conn = db::open_in_memory().expect("インメモリDBを開けること");
        let board_id = setup_board(&mut conn);
        let created = super::tag_create(&mut conn, &board_id, "バグ").expect("作れること");

        let renamed = super::tag_rename(&mut conn, &created.id, " 不具合 ").expect("改名できること");

        assert_eq!(renamed.name, "不具合");
        assert_eq!(renamed.color, created.color, "改名しても色は変わらないこと");
    }

    #[test]
    fn 既にある名前へは改名できない() {
        let mut conn = db::open_in_memory().expect("インメモリDBを開けること");
        let board_id = setup_board(&mut conn);
        super::tag_create(&mut conn, &board_id, "バグ").expect("1件目");
        let second = super::tag_create(&mut conn, &board_id, "設計").expect("2件目");

        let result = super::tag_rename(&mut conn, &second.id, "バグ");

        assert!(result.is_err());
    }

    #[test]
    fn 自分自身と同じ名前への改名は通る() {
        let mut conn = db::open_in_memory().expect("インメモリDBを開けること");
        let board_id = setup_board(&mut conn);
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
```

- [ ] **Step 2: テストを実行して失敗を確認**

Run: `cd src-tauri && cargo test タグ`
Expected: FAIL（`cannot find function 'tag_create' in module 'super'` などのコンパイルエラー）

- [ ] **Step 3: 最小の実装を書く**

`src-tauri/src/db/mod.rs` の `Task` 構造体の直後に追加する。

```rust
/// タグ（ボードごとのラベル）
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Tag {
    pub id: String,
    pub board_id: String,
    pub name: String,
    pub color: String,
    pub position: i64,
}
```

`src-tauri/src/db/repo.rs` の `use super::{...}` に `Tag` を足す。

```rust
use super::{Board, RepoError, Result, Status, Tag, Task};
```

`DEFAULT_STATUSES` の直後に色プリセットを置く。

```rust
/// タグ色のプリセット。ステータス色より彩度を落とし、看板の主役（ステータス色）を食わないようにする。
/// 作成時に「そのボードでまだ使われていない最初の色」を選ぶ。全部埋まったら先頭から循環する。
pub const TAG_COLORS: &[&str] = &[
    "#7EA9E8", "#E8B478", "#7FCF9A", "#E88A85", "#B98CD8", "#E88AA6", "#8FC9E0", "#A8A8AE",
    "#C9B478",
];
```

`row_to_status` の直後に追加する。

```rust
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
```

ファイル末尾（`#[cfg(test)] mod tests` の直前）にタグ関連の関数をまとめて追加する。

```rust
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
```

- [ ] **Step 4: テストを実行して成功を確認**

Run: `cd src-tauri && cargo test タグ`
Expected: PASS（12件）

- [ ] **Step 5: コミット**

```bash
git add src-tauri/src/db/mod.rs src-tauri/src/db/repo.rs
git commit -m "feat: タグのCRUDと色の自動割当をリポジトリ層に実装"
```

---

### Task 3: task_tags のトグルと Task.tagIds

**Files:**
- Modify: `src-tauri/src/db/mod.rs:93-102`（`Task` に `tag_ids`）
- Modify: `src-tauri/src/db/repo.rs:41-50`（`row_to_task`）, `:150-157`（`task_by_id`）, `:174-185`（`tasks_list`）
- Test: `src-tauri/src/db/repo.rs`

- [ ] **Step 1: 失敗するテストを書く**

`src-tauri/src/db/repo.rs` の `mod tests` に追加する。

```rust
    /// テスト用: ボード・先頭ステータス・タスク1件を作って (board_id, task_id) を返す
    fn setup_board_with_task(conn: &mut rusqlite::Connection) -> (String, String) {
        let board_id = setup_board(conn);
        let statuses = super::statuses_list(conn, &board_id).expect("ステータス一覧");
        let task = super::task_create(conn, &board_id, &statuses[0].id, "タスク")
            .expect("タスクを作れること");
        (board_id, task.id)
    }

    #[test]
    fn タグの付け外しはトグルになる() {
        let mut conn = db::open_in_memory().expect("インメモリDBを開けること");
        let (board_id, task_id) = setup_board_with_task(&mut conn);
        let tag = super::tag_create(&mut conn, &board_id, "バグ").expect("タグを作れること");

        let attached =
            super::task_tag_toggle(&mut conn, &task_id, &tag.id).expect("付けられること");
        assert_eq!(attached, vec![tag.id.clone()]);

        let detached =
            super::task_tag_toggle(&mut conn, &task_id, &tag.id).expect("外せること");
        assert!(detached.is_empty());
    }

    #[test]
    fn tasks_listのtagIdsはタグのposition昇順になる() {
        let mut conn = db::open_in_memory().expect("インメモリDBを開けること");
        let (board_id, task_id) = setup_board_with_task(&mut conn);
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
        let mut conn = db::open_in_memory().expect("インメモリDBを開けること");
        let (board_id, task_id) = setup_board_with_task(&mut conn);
        let tag = super::tag_create(&mut conn, &board_id, "バグ").expect("タグを作れること");
        super::task_tag_toggle(&mut conn, &task_id, &tag.id).expect("付けられること");

        let updated =
            super::task_update(&mut conn, &task_id, Some("新タイトル"), None).expect("更新できること");

        assert_eq!(updated.tag_ids, vec![tag.id]);
    }

    #[test]
    fn 存在しないタグは付けられない() {
        let mut conn = db::open_in_memory().expect("インメモリDBを開けること");
        let (_board_id, task_id) = setup_board_with_task(&mut conn);

        let result = super::task_tag_toggle(&mut conn, &task_id, "no-such-tag");

        assert!(result.is_err(), "外部キー制約で弾かれること");
    }

    #[test]
    fn タグを消すとタスクからも外れる() {
        let mut conn = db::open_in_memory().expect("インメモリDBを開けること");
        let (board_id, task_id) = setup_board_with_task(&mut conn);
        let tag = super::tag_create(&mut conn, &board_id, "バグ").expect("タグを作れること");
        super::task_tag_toggle(&mut conn, &task_id, &tag.id).expect("付けられること");

        super::tag_delete(&mut conn, &tag.id).expect("タグを消せること");

        let tasks = super::tasks_list(&mut conn, &board_id).expect("一覧を引けること");
        assert!(tasks[0].tag_ids.is_empty());
    }

    #[test]
    fn タスクをソフトデリートしてもタグは残る() {
        let mut conn = db::open_in_memory().expect("インメモリDBを開けること");
        let (_board_id, task_id) = setup_board_with_task(&mut conn);
        let board_id = _board_id;
        let tag = super::tag_create(&mut conn, &board_id, "バグ").expect("タグを作れること");
        super::task_tag_toggle(&mut conn, &task_id, &tag.id).expect("付けられること");

        super::task_delete(&mut conn, &task_id).expect("削除できること");
        let restored = super::task_restore(&mut conn, &task_id).expect("復元できること");

        assert_eq!(restored.tag_ids, vec![tag.id], "復元後もタグ付きであること");
    }
```

- [ ] **Step 2: テストを実行して失敗を確認**

Run: `cd src-tauri && cargo test タグ`
Expected: FAIL（`no field 'tag_ids' on type 'Task'` / `cannot find function 'task_tag_toggle'`）

- [ ] **Step 3: 最小の実装を書く**

`src-tauri/src/db/mod.rs` の `Task` に1フィールド足す。

```rust
pub struct Task {
    pub id: String,
    pub board_id: String,
    pub status_id: String,
    pub title: String,
    pub content_md: String,
    pub position: i64,
    pub created_at: String,
    pub updated_at: String,
    /// 付いているタグのid。tags.position 昇順。DBの行には無いので後から埋める。
    pub tag_ids: Vec<String>,
}
```

`src-tauri/src/db/repo.rs` の先頭 `use` に `HashMap` を足す。

```rust
use std::collections::HashMap;
```

`row_to_task`（41行目付近）を書き換える。行そのものには tagIds が無いので空で作り、呼び出し側で埋める。

```rust
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
```

`task_by_id`（150行目付近）を書き換える。

```rust
/// IDでタスクを1件引く（tag_ids も埋める）
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
```

> 注意: 既存の `task_by_id` の SELECT 句が上と違う場合は、**既存の SELECT 句をそのまま使い**、
> `task.tag_ids = load_tag_ids(conn, id)?;` の1行だけを足す形にすること。

`tasks_list`（174行目付近）を書き換える。

```rust
/// ボードの生存タスク一覧（position昇順・tag_ids 込み）
pub fn tasks_list(conn: &mut Connection, board_id: &str) -> Result<Vec<Task>> {
    let mut tasks = {
        let mut stmt = conn.prepare(
            "SELECT id, board_id, status_id, title, content_md, position, created_at, updated_at
             FROM tasks
             WHERE board_id = ?1 AND deleted_at IS NULL
             ORDER BY position, rowid",
        )?;
        stmt.query_map(params![board_id], row_to_task)?
            .collect::<rusqlite::Result<Vec<Task>>>()?
    };

    // N+1 を避け、ボード分の task_tags を1クエリでまとめて引く
    let by_task = load_tag_ids_for_board(conn, board_id)?;
    for task in tasks.iter_mut() {
        task.tag_ids = by_task.get(&task.id).cloned().unwrap_or_default();
    }
    Ok(tasks)
}
```

Task 2 で足した「タグ」セクションの末尾に、トグルと読み出しを追加する。

```rust
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
pub fn task_tag_toggle(
    conn: &mut Connection,
    task_id: &str,
    tag_id: &str,
) -> Result<Vec<String>> {
    let tx = conn.transaction()?;
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
        // 存在しない task_id / tag_id はここで外部キー制約に弾かれる
        tx.execute(
            "INSERT INTO task_tags (task_id, tag_id) VALUES (?1, ?2)",
            params![task_id, tag_id],
        )?;
    }
    tx.commit()?;

    load_tag_ids(conn, task_id)
}
```

- [ ] **Step 4: テストを実行して成功を確認**

Run: `cd src-tauri && cargo test`
Expected: PASS（既存44件 + 追加分。`Task` の構築箇所が他にあってコンパイルエラーになったら `tag_ids: Vec::new()` を足す）

- [ ] **Step 5: コミット**

```bash
git add src-tauri/src/db/mod.rs src-tauri/src/db/repo.rs
git commit -m "feat: タスクへのタグ付け外しとtagIdsの返却を実装"
```

---

### Task 4: board_delete のカスケード

**Files:**
- Modify: `src-tauri/src/db/repo.rs:116-126`
- Test: `src-tauri/src/db/repo.rs`

- [ ] **Step 1: 失敗するテストを書く**

```rust
    #[test]
    fn ボードを消すとタグとタスクタグも消える() {
        let mut conn = db::open_in_memory().expect("インメモリDBを開けること");
        let (board_id, task_id) = setup_board_with_task(&mut conn);
        let tag = super::tag_create(&mut conn, &board_id, "バグ").expect("タグを作れること");
        super::task_tag_toggle(&mut conn, &task_id, &tag.id).expect("付けられること");

        super::board_delete(&mut conn, &board_id).expect("ボードを消せること");

        let tags: i64 = conn
            .query_row("SELECT COUNT(*) FROM tags", [], |row| row.get(0))
            .expect("件数を数えられること");
        let links: i64 = conn
            .query_row("SELECT COUNT(*) FROM task_tags", [], |row| row.get(0))
            .expect("件数を数えられること");
        assert_eq!(tags, 0);
        assert_eq!(links, 0);
    }
```

- [ ] **Step 2: テストを実行して失敗を確認**

Run: `cd src-tauri && cargo test ボードを消すと`
Expected: FAIL（`DELETE FROM tasks` が `task_tags` の外部キーに弾かれてエラー、または tags が残る）

- [ ] **Step 3: 最小の実装を書く**

`src-tauri/src/db/repo.rs:116` の `board_delete` を書き換える。

```rust
/// ボードを物理削除する。FK違反を避けるため task_tags → tasks → tags → statuses → boards の順で消す。
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
```

- [ ] **Step 4: テストを実行して成功を確認**

Run: `cd src-tauri && cargo test`
Expected: PASS（全件）

- [ ] **Step 5: コミット**

```bash
git add src-tauri/src/db/repo.rs
git commit -m "fix: ボード削除でタグとタスクタグも消えるようにする"
```

---

### Task 5: Tauri コマンドの公開

**Files:**
- Modify: `src-tauri/src/commands.rs`
- Modify: `src-tauri/src/lib.rs:23-42`

このタスクはリポジトリ層への薄い委譲だけで、ロジックが無いためテストは書かない（既存のコマンド層と同じ方針）。ビルドが通ることで検証する。

- [ ] **Step 1: commands.rs にコマンドを追加**

`src-tauri/src/commands.rs` の `use` を書き換える。

```rust
use crate::db::{repo, Board, Status, Tag, Task};
```

タスク系コマンドの後ろ（設定系コマンドの手前）に追加する。

```rust
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
```

- [ ] **Step 2: lib.rs の invoke_handler に登録**

`src-tauri/src/lib.rs:38` の `commands::task_restore,` の直後に5行足す。

```rust
            commands::task_restore,
            commands::tags_list,
            commands::tag_create,
            commands::tag_rename,
            commands::tag_delete,
            commands::task_tag_toggle,
            commands::setting_get,
```

- [ ] **Step 3: ビルドとテストを実行**

Run: `cd src-tauri && cargo test`
Expected: PASS（全件。未使用警告が出ないこと）

- [ ] **Step 4: コミット**

```bash
git add src-tauri/src/commands.rs src-tauri/src/lib.rs
git commit -m "feat: タグ操作のTauriコマンドを公開"
```

---

# フェーズ2 — フロント基盤

### Task 6: 型・フィクスチャ・APIラッパー

**Files:**
- Modify: `src/types.ts`
- Modify: `src/test/fixtures.ts`
- Modify: `src/lib/api.ts`
- Test: `src/lib/api.test.ts`

- [ ] **Step 1: 失敗するテストを書く**

`src/lib/api.test.ts` に追加する（既存ファイルは `invoke` をモックして「invoke名と引数」を検証している。同じ書き方に合わせること）。

```ts
  it("tagsList はキャメルケースの boardId を渡す", async () => {
    invokeMock.mockResolvedValue([]);

    await api.tagsList("board-1");

    expect(invokeMock).toHaveBeenCalledWith("tags_list", { boardId: "board-1" });
  });

  it("tagCreate は boardId と name を渡す", async () => {
    invokeMock.mockResolvedValue({});

    await api.tagCreate("board-1", "バグ");

    expect(invokeMock).toHaveBeenCalledWith("tag_create", {
      boardId: "board-1",
      name: "バグ",
    });
  });

  it("taskTagToggle は taskId と tagId を渡す", async () => {
    invokeMock.mockResolvedValue([]);

    await api.taskTagToggle("t-a", "g-1");

    expect(invokeMock).toHaveBeenCalledWith("task_tag_toggle", {
      taskId: "t-a",
      tagId: "g-1",
    });
  });
```

> `invokeMock` の変数名は既存の `src/lib/api.test.ts` に合わせること。違う名前なら既存に揃える。

- [ ] **Step 2: テストを実行して失敗を確認**

Run: `npm run test -- --run src/lib/api.test.ts`
Expected: FAIL（`api.tagsList is not a function`）

- [ ] **Step 3: 最小の実装を書く**

`src/types.ts` を書き換える。

```ts
export interface Tag {
  id: string;
  boardId: string;
  name: string;
  color: string;
  position: number;
}

export interface Task {
  id: string;
  boardId: string;
  statusId: string;
  title: string;
  contentMd: string;
  position: number;
  createdAt: string;
  updatedAt: string;
  /** 付いているタグのid。tags.position 昇順（Rust側が保証する） */
  tagIds: string[];
}
```

`src/lib/api.ts` の「設定」セクションの手前に追加する。

```ts
// ---- タグ ----

export function tagsList(boardId: string): Promise<Tag[]> {
  return invoke<Tag[]>("tags_list", { boardId });
}

export function tagCreate(boardId: string, name: string): Promise<Tag> {
  return invoke<Tag>("tag_create", { boardId, name });
}

export function tagRename(id: string, name: string): Promise<Tag> {
  return invoke<Tag>("tag_rename", { id, name });
}

export function tagDelete(id: string): Promise<void> {
  return invoke<void>("tag_delete", { id });
}

/** タスクのタグを付け外しする。戻り値はトグル後の tagIds。 */
export function taskTagToggle(taskId: string, tagId: string): Promise<string[]> {
  return invoke<string[]>("task_tag_toggle", { taskId, tagId });
}
```

同ファイル冒頭の import に `Tag` を足す。

```ts
import type { Board, Status, Tag, Task } from "@/types";
```

`src/test/fixtures.ts` を書き換える。

```ts
import type { Board, Status, Tag, Task } from "@/types";

export const board: Board = { id: "board-1", name: "メイン", position: 0 };
export const board2: Board = { id: "board-2", name: "私用", position: 1 };

export const statuses: Status[] = [
  { id: "st-todo", boardId: "board-1", name: "未着手", color: "#8E8E93", position: 0 },
  { id: "st-doing", boardId: "board-1", name: "進行中", color: "#007AFF", position: 1 },
  { id: "st-check", boardId: "board-1", name: "確認中", color: "#FF9500", position: 2 },
  { id: "st-done", boardId: "board-1", name: "完了", color: "#34C759", position: 3 },
];

export const tags: Tag[] = [
  { id: "tag-bug", boardId: "board-1", name: "バグ", color: "#7EA9E8", position: 0 },
  { id: "tag-urgent", boardId: "board-1", name: "緊急", color: "#E8B478", position: 1 },
  { id: "tag-design", boardId: "board-1", name: "設計", color: "#7FCF9A", position: 2 },
];

function makeTask(
  id: string,
  statusId: string,
  title: string,
  position: number,
  tagIds: string[] = [],
): Task {
  return {
    id,
    boardId: "board-1",
    statusId,
    title,
    contentMd: "",
    position,
    createdAt: "2026-08-20T00:00:00Z",
    updatedAt: "2026-08-20T00:00:00Z",
    tagIds,
  };
}

// 未着手に3件 / 進行中に2件 / 確認中は空 / 完了に1件
export const tasks: Task[] = [
  makeTask("t-a", "st-todo", "牛乳を買う", 0, ["tag-bug"]),
  makeTask("t-b", "st-todo", "資料をまとめる", 1),
  makeTask("t-c", "st-todo", "牛丼を食べる", 2, ["tag-bug", "tag-urgent"]),
  makeTask("t-d", "st-doing", "設計レビュー", 0, ["tag-design"]),
  makeTask("t-e", "st-doing", "実装する", 1),
  makeTask("t-f", "st-done", "リリース準備", 0),
];

export { makeTask };
```

- [ ] **Step 4: テストを実行して成功を確認**

Run: `npm run test -- --run src/lib/api.test.ts`
Expected: PASS

Run: `npm run build`
Expected: 型エラーが出る場合、`Task` を直書きしているテストが原因。**そのテストを `makeTask` 経由に直すか `tagIds: []` を足して**全部通す。ここで全部潰しておくこと。

- [ ] **Step 5: 全テストを実行**

Run: `npm run test -- --run`
Expected: PASS（既存236件が全部通ること）

- [ ] **Step 6: コミット**

```bash
git add src/types.ts src/lib/api.ts src/lib/api.test.ts src/test/fixtures.ts
git commit -m "feat: タグの型とAPIラッパーを追加"
```

---

### Task 7: タグ色プリセットとチップ配色

**Files:**
- Create: `src/lib/tagPalette.ts`
- Test: `src/lib/tagPalette.test.ts`

- [ ] **Step 1: 失敗するテストを書く**

`src/lib/tagPalette.test.ts` を新規作成する。

```ts
import { describe, expect, it } from "vitest";
import { TAG_COLORS, tagChipStyle } from "@/lib/tagPalette";

describe("tagChipStyle", () => {
  it("通常のカードでは薄塗りの地と濃い同系色の文字になる", () => {
    const style = tagChipStyle("#7EA9E8", false, false);

    expect(style).toEqual({ backgroundColor: "#7EA9E838", color: "#4A7CC4" });
  });

  it("ダークモードでは地をさらに薄くし、文字はタグ色そのものにする", () => {
    const style = tagChipStyle("#7EA9E8", false, true);

    expect(style).toEqual({ backgroundColor: "#7EA9E82E", color: "#7EA9E8" });
  });

  it("選択中カードの上ではタグ色を捨てて白に一本化する", () => {
    // ステータス色のベタ塗りの上ではどのタグ色も濁るため
    const style = tagChipStyle("#7EA9E8", true, false);

    expect(style).toEqual({ backgroundColor: "rgba(255,255,255,0.22)", color: "#fff" });
  });

  it("プリセットに無い色でも落ちず、文字色はその色をそのまま使う", () => {
    const style = tagChipStyle("#123456", false, false);

    expect(style).toEqual({ backgroundColor: "#12345638", color: "#123456" });
  });

  it("色の指定は大文字小文字を区別しない", () => {
    const style = tagChipStyle("#7ea9e8", false, false);

    expect(style.color).toBe("#4A7CC4");
  });
});

describe("TAG_COLORS", () => {
  it("9色ある", () => {
    expect(TAG_COLORS).toHaveLength(9);
  });

  it("色の重複が無い", () => {
    const values = TAG_COLORS.map((c) => c.value);

    expect(new Set(values).size).toBe(values.length);
  });
});
```

- [ ] **Step 2: テストを実行して失敗を確認**

Run: `npm run test -- --run src/lib/tagPalette.test.ts`
Expected: FAIL（`Failed to resolve import "@/lib/tagPalette"`）

- [ ] **Step 3: 最小の実装を書く**

`src/lib/tagPalette.ts` を新規作成する。

```ts
/**
 * タグ色のプリセット。ステータス色（statusPalette.ts）より彩度を落として、
 * 「ステータス＝鮮やか / タグ＝くすんだ色」という階層を保つ。
 * value は Rust 側の TAG_COLORS と同じ並び・同じ値でなければならない。
 */
export const TAG_COLORS = [
  { name: "ブルー", value: "#7EA9E8", fgLight: "#4A7CC4" },
  { name: "オレンジ", value: "#E8B478", fgLight: "#B07B32" },
  { name: "グリーン", value: "#7FCF9A", fgLight: "#4D9E6D" },
  { name: "レッド", value: "#E88A85", fgLight: "#C9615B" },
  { name: "パープル", value: "#B98CD8", fgLight: "#8B5FB5" },
  { name: "ピンク", value: "#E88AA6", fgLight: "#C25A7C" },
  { name: "ティール", value: "#8FC9E0", fgLight: "#4F92AE" },
  { name: "グレー", value: "#A8A8AE", fgLight: "#7A7A80" },
  { name: "イエロー", value: "#C9B478", fgLight: "#9A8534" },
] as const;

export interface ChipStyle {
  backgroundColor: string;
  color: string;
}

/**
 * タグチップの配色を返す。
 * @param hex タグの色（'#RRGGBB'）
 * @param onStatus 選択中カード（ステータス色のベタ塗り）の上に載せるか
 * @param dark ダークモードか
 */
export function tagChipStyle(hex: string, onStatus: boolean, dark: boolean): ChipStyle {
  // 選択中カードはステータス色で全面が塗られる。どんなタグ色を載せても濁るので、
  // ここだけはタグ色を捨てて白の不透明度に一本化する。
  if (onStatus) {
    return { backgroundColor: "rgba(255,255,255,0.22)", color: "#fff" };
  }
  // 末尾2桁は8bitのアルファ。38 ≒ 22% / 2E ≒ 18%
  if (dark) {
    return { backgroundColor: `${hex}2E`, color: hex };
  }
  const preset = TAG_COLORS.find(
    (candidate) => candidate.value.toLowerCase() === hex.toLowerCase(),
  );
  return { backgroundColor: `${hex}38`, color: preset?.fgLight ?? hex };
}
```

- [ ] **Step 4: テストを実行して成功を確認**

Run: `npm run test -- --run src/lib/tagPalette.test.ts`
Expected: PASS（7件）

- [ ] **Step 5: コミット**

```bash
git add src/lib/tagPalette.ts src/lib/tagPalette.test.ts
git commit -m "feat: タグ色プリセットとチップ配色の純関数を追加"
```

---

### Task 8: 検索クエリのパースとタグ絞り込み

**Files:**
- Modify: `src/lib/boardNav.ts:16-20`
- Modify: `src/components/Board.tsx:14`
- Modify: `src/hooks/useKeyboard.ts:101`
- Modify: `src/store/appStore.ts:180`, `:342`
- Test: `src/lib/boardNav.test.ts`

- [ ] **Step 1: 失敗するテストを書く**

`src/lib/boardNav.test.ts` に追加する。

```ts
import { parseSearchQuery } from "@/lib/boardNav";
import { tags as tagFixtures } from "@/test/fixtures";

describe("parseSearchQuery", () => {
  it("タグとテキストを分ける", () => {
    expect(parseSearchQuery("ログイン #バグ #緊急")).toEqual({
      text: "ログイン",
      tagNames: ["バグ", "緊急"],
    });
  });

  it("全角の＃も半角と同じに扱う", () => {
    // 日本語入力ONの Shift+3 は環境によって全角＃になる
    expect(parseSearchQuery("＃バグ")).toEqual({ text: "", tagNames: ["バグ"] });
  });

  it("# 単独は入力途中とみなして無視する", () => {
    expect(parseSearchQuery("ログイン #")).toEqual({ text: "ログイン", tagNames: [] });
  });

  it("同じタグ名は大文字小文字を無視して1つにまとめる", () => {
    expect(parseSearchQuery("#Bug #bug")).toEqual({ text: "", tagNames: ["Bug"] });
  });

  it("テキストが複数あれば空白1つで連結する", () => {
    expect(parseSearchQuery("  ログイン   画面  ")).toEqual({
      text: "ログイン 画面",
      tagNames: [],
    });
  });
});

describe("filterTasks（タグ絞り込み）", () => {
  it("タグ名の完全一致で絞れる", () => {
    const result = filterTasks(taskFixtures, "#バグ", tagFixtures);

    expect(result.map((t) => t.id)).toEqual(["t-a", "t-c"]);
  });

  it("複数のタグはAND条件になる", () => {
    const result = filterTasks(taskFixtures, "#バグ #緊急", tagFixtures);

    expect(result.map((t) => t.id)).toEqual(["t-c"]);
  });

  it("タイトル検索と併用できる", () => {
    const result = filterTasks(taskFixtures, "牛乳 #バグ", tagFixtures);

    expect(result.map((t) => t.id)).toEqual(["t-a"]);
  });

  it("打ちかけの名前は前方一致で拾う（候補のORになる）", () => {
    // 「設」で始まるタグは「設計」だけ
    const result = filterTasks(taskFixtures, "#設", tagFixtures);

    expect(result.map((t) => t.id)).toEqual(["t-d"]);
  });

  it("完全一致するタグがあれば前方一致より優先する", () => {
    const extended = [
      ...tagFixtures,
      { id: "tag-bug2", boardId: "board-1", name: "バグ報告", color: "#E88A85", position: 3 },
    ];

    const result = filterTasks(taskFixtures, "#バグ", extended);

    expect(result.map((t) => t.id)).toEqual(["t-a", "t-c"]);
  });

  it("どのタグにも当たらない名前なら0件になる", () => {
    const result = filterTasks(taskFixtures, "#存在しない", tagFixtures);

    expect(result).toEqual([]);
  });
});
```

> 既存ファイルの import 名（`filterTasks` / `taskFixtures`）は既存の書き方に合わせること。
> 既存が `import { tasks } from "@/test/fixtures"` なら `taskFixtures` を `tasks` に読み替える。

- [ ] **Step 2: テストを実行して失敗を確認**

Run: `npm run test -- --run src/lib/boardNav.test.ts`
Expected: FAIL（`parseSearchQuery is not exported` / `filterTasks` が3引数を受けない）

- [ ] **Step 3: 最小の実装を書く**

`src/lib/boardNav.ts` の import と `filterTasks` を書き換える。

```ts
import type { Status, Tag, Task } from "@/types";
```

```ts
/** 検索クエリを「タイトル検索の文字列」と「タグ名」に分けた結果 */
export interface ParsedQuery {
  text: string;
  tagNames: string[];
}

/**
 * 検索クエリをパースする。
 * 日本語入力ONの Shift+3 が全角「＃」になる環境があるため、**この関数の冒頭でのみ**正規化する
 * （正規化を複数箇所に散らすと、1箇所漏れただけで「打っても何も起きない」状態になるため）。
 */
export function parseSearchQuery(query: string): ParsedQuery {
  const normalized = query.replace(/＃/g, "#");
  const tagNames: string[] = [];
  const rest: string[] = [];

  for (const token of normalized.split(/\s+/)) {
    if (token === "") continue;
    if (!token.startsWith("#")) {
      rest.push(token);
      continue;
    }
    const name = token.slice(1);
    // 「#」だけは入力途中なので無視する
    if (name === "") continue;
    const duplicated = tagNames.some((t) => t.toLowerCase() === name.toLowerCase());
    if (!duplicated) tagNames.push(name);
  }

  return { text: rest.join(" "), tagNames };
}

/**
 * 検索クエリでタスクを絞り込む。
 * タイトルは部分一致（英字は大文字小文字を区別しない）。
 * `#タグ名` はタグ名どうしがAND、1つのタグ名に対する候補（前方一致で複数当たる場合）はOR。
 */
export function filterTasks(tasks: Task[], query: string, tags: Tag[]): Task[] {
  const { text, tagNames } = parseSearchQuery(query);
  let result = tasks;

  const q = text.trim().toLowerCase();
  if (q !== "") {
    result = result.filter((t) => t.title.toLowerCase().includes(q));
  }

  for (const name of tagNames) {
    const lower = name.trim().toLowerCase();
    const exact = tags.find((t) => t.name.trim().toLowerCase() === lower);
    // 完全一致があればそれだけ。無ければ「打ちかけ」とみなして前方一致の候補をORで拾う
    const candidates =
      exact !== undefined
        ? [exact]
        : tags.filter((t) => t.name.trim().toLowerCase().startsWith(lower));
    // どのタグにも当たらないなら、全件を出さずに0件にする
    if (candidates.length === 0) return [];
    const ids = new Set(candidates.map((t) => t.id));
    result = result.filter((task) => task.tagIds.some((id) => ids.has(id)));
  }

  return result;
}
```

- [ ] **Step 4: 呼び出し元4箇所を直す**

第3引数は省略不可にしてあるので、直し忘れは型エラーで出る。

`src/components/Board.tsx:9-14`:

```tsx
  const statuses = useAppStore((s) => s.statuses);
  const tasks = useAppStore((s) => s.tasks);
  const tags = useAppStore((s) => s.tags);
  const searchQuery = useAppStore((s) => s.searchQuery);
  const selectedTaskId = useAppStore((s) => s.selectedTaskId);

  const lanes = buildLanes(statuses, filterTasks(tasks, searchQuery, tags));
```

`src/hooks/useKeyboard.ts:101`:

```ts
  const lanes = buildLanes(s.statuses, filterTasks(s.tasks, s.searchQuery, s.tags));
```

`src/store/appStore.ts` の `setSearchQuery`:

```ts
  setSearchQuery(q) {
    const { tasks, tags, selectedTaskId } = get();
    // 絞り込みの結果、選択中のカードが表示対象から外れたら選択を解除して検索バーへ戻す
    const stillVisible =
      selectedTaskId !== null && filterTasks(tasks, q, tags).some((t) => t.id === selectedTaskId);
    set({ searchQuery: q, selectedTaskId: stillVisible ? selectedTaskId : null });
  },
```

`src/store/appStore.ts` の `deleteSelectedTask`:

```ts
    const { tasks, statuses, tags, selectedTaskId, searchQuery, currentBoardId } = get();
    if (selectedTaskId === null) return;
    const target = tasks.find((t) => t.id === selectedTaskId);
    if (target === undefined) return;

    // 見えているカードの並びを基準に、次に選ぶカードを決める
    const lanes = buildLanes(statuses, filterTasks(tasks, searchQuery, tags));
```

> `s.tags` / `get().tags` は次の Task 9 で追加する。ここでは Task 9 を先に済ませてもよいが、
> 順に進める場合は Task 9 完了までコンパイルエラーが残る。**Task 8 と Task 9 は
> ひとまとめにコミットしてよい**（片方だけでは型が通らないため）。

- [ ] **Step 5: Task 9 を先に済ませてからテストを実行**

Run: `npm run test -- --run src/lib/boardNav.test.ts`
Expected: PASS（11件）

- [ ] **Step 6: コミット（Task 9 と同時でよい）**

```bash
git add src/lib/boardNav.ts src/lib/boardNav.test.ts src/components/Board.tsx src/hooks/useKeyboard.ts
git commit -m "feat: 検索クエリの#タグ記法とタグ絞り込みを実装"
```

---

# フェーズ3 — ストア

### Task 9: ストアにタグの状態と読み込みを足す

**Files:**
- Modify: `src/store/appStore.ts`
- Test: `src/store/appStore.test.ts`

- [ ] **Step 1: 失敗するテストを書く**

`src/store/appStore.test.ts` に追加する（既存ファイルは `api` をモックしている。同じモックに `tagsList` などを足すこと）。

```ts
  it("selectBoard はタグも読み込む", async () => {
    vi.mocked(api.statusesList).mockResolvedValue(fixtures.statuses);
    vi.mocked(api.tasksList).mockResolvedValue(fixtures.tasks);
    vi.mocked(api.tagsList).mockResolvedValue(fixtures.tags);

    await useAppStore.getState().selectBoard("board-1");

    expect(useAppStore.getState().tags).toEqual(fixtures.tags);
  });

  it("selectBoard は開いていたタグパレットを閉じる", async () => {
    vi.mocked(api.statusesList).mockResolvedValue(fixtures.statuses);
    vi.mocked(api.tasksList).mockResolvedValue(fixtures.tasks);
    vi.mocked(api.tagsList).mockResolvedValue(fixtures.tags);
    useAppStore.setState({ tagPaletteOpen: true });

    await useAppStore.getState().selectBoard("board-1");

    expect(useAppStore.getState().tagPaletteOpen).toBe(false);
  });

  it("openTagPalette はカード未選択なら開かない", () => {
    useAppStore.setState({ selectedTaskId: null });

    useAppStore.getState().openTagPalette();

    expect(useAppStore.getState().tagPaletteOpen).toBe(false);
  });

  it("openTagPalette はカード選択中なら開く", () => {
    useAppStore.setState({ selectedTaskId: "t-a" });

    useAppStore.getState().openTagPalette();

    expect(useAppStore.getState().tagPaletteOpen).toBe(true);
  });
```

- [ ] **Step 2: テストを実行して失敗を確認**

Run: `npm run test -- --run src/store/appStore.test.ts`
Expected: FAIL（`api.tagsList` がモック対象に無い / `openTagPalette is not a function`）

- [ ] **Step 3: 最小の実装を書く**

`src/store/appStore.ts` の import を書き換える。

```ts
import type { Board, Status, Tag, Task, View } from "@/types";
```

`AppState` に追加する（`pendingNewTaskId` の後ろ）。

```ts
  /** currentBoard のタグ。position昇順 */
  tags: Tag[];
  /** タグパレット（⌘Kで開くオーバーレイ）が開いているか */
  tagPaletteOpen: boolean;
```

アクションのシグネチャを追加する（`updateTaskTitle` の後ろ）。

```ts
  openTagPalette(): void;
  closeTagPalette(): void;
  toggleTaskTag(tagId: string): Promise<void>;
  createTagAndAttach(name: string): Promise<void>;
  renameTag(id: string, name: string): Promise<void>;
  deleteTag(id: string): Promise<void>;
```

`initialAppState` に追加する。

```ts
  tags: [] as Tag[],
  tagPaletteOpen: false,
```

`selectBoard` を書き換える（追加は3箇所: 同期クリア / Promise.all / set）。

```ts
  async selectBoard(boardId) {
    boardEpoch += 1;
    const epoch = boardEpoch;
    boardLoading = true;
    // 削除のundoはボードローカルな操作。切替要求の時点で同期的にクリアする。
    // タグパレットもボードが変わればタグ集合ごと無効になるので同時に閉じる。
    set({ lastDeletedTaskId: null, tagPaletteOpen: false });
    try {
      const [statuses, tasks, tags] = await Promise.all([
        api.statusesList(boardId),
        api.tasksList(boardId),
        api.tagsList(boardId),
      ]);
      if (epoch !== boardEpoch) return false; // 追い越されたので破棄する(boardLoadingは触らない)
      set({
        currentBoardId: boardId,
        statuses,
        tasks,
        tags,
        selectedTaskId: null,
        searchQuery: "",
        view: "board",
      });
      boardLoading = false;
      return true;
    } catch (e) {
      if (epoch !== boardEpoch) return false;
      boardLoading = false;
      toast.error(`ボードの読み込みに失敗しました: ${String(e)}`);
      return false;
    }
  },
```

ストア末尾（`updateTaskTitle` の後ろ）に開閉アクションを足す。

```ts
  openTagPalette() {
    // 対象タスクが無いときは無反応（トーストも出さない）
    if (get().selectedTaskId === null) return;
    set({ tagPaletteOpen: true });
  },

  closeTagPalette() {
    set({ tagPaletteOpen: false });
  },
```

- [ ] **Step 4: テストを実行して成功を確認**

Run: `npm run test -- --run src/store/appStore.test.ts`
Expected: FAIL（`toggleTaskTag is not a function` は Task 10 で実装するので、Task 9 のテスト4件だけ PASS していればよい。他のテストが `tags` 未定義で落ちる場合は初期値の追加漏れ）

- [ ] **Step 5: コミット（Task 8 と同時でよい）**

```bash
git add src/store/appStore.ts src/store/appStore.test.ts
git commit -m "feat: ストアにタグの状態とタグパレットの開閉を追加"
```

---

### Task 10: ストアのタグ系ミューテーション

**Files:**
- Modify: `src/store/appStore.ts`
- Test: `src/store/appStore.test.ts`

- [ ] **Step 1: 失敗するテストを書く**

```ts
  it("toggleTaskTag は付いていないタグを付ける", async () => {
    useAppStore.setState({
      currentBoardId: "board-1",
      tasks: fixtures.tasks,
      tags: fixtures.tags,
      selectedTaskId: "t-b",
    });
    vi.mocked(api.taskTagToggle).mockResolvedValue(["tag-bug"]);

    await useAppStore.getState().toggleTaskTag("tag-bug");

    const task = useAppStore.getState().tasks.find((t) => t.id === "t-b");
    expect(task?.tagIds).toEqual(["tag-bug"]);
    expect(api.taskTagToggle).toHaveBeenCalledWith("t-b", "tag-bug");
  });

  it("toggleTaskTag は付いているタグを外す", async () => {
    useAppStore.setState({
      currentBoardId: "board-1",
      tasks: fixtures.tasks,
      tags: fixtures.tags,
      selectedTaskId: "t-a",
    });
    vi.mocked(api.taskTagToggle).mockResolvedValue([]);

    await useAppStore.getState().toggleTaskTag("tag-bug");

    const task = useAppStore.getState().tasks.find((t) => t.id === "t-a");
    expect(task?.tagIds).toEqual([]);
  });

  it("toggleTaskTag は失敗したらDBの実状態へ戻す", async () => {
    useAppStore.setState({
      currentBoardId: "board-1",
      tasks: fixtures.tasks,
      tags: fixtures.tags,
      selectedTaskId: "t-b",
    });
    vi.mocked(api.taskTagToggle).mockRejectedValue(new Error("失敗"));
    vi.mocked(api.tasksList).mockResolvedValue(fixtures.tasks);

    await useAppStore.getState().toggleTaskTag("tag-bug");

    const task = useAppStore.getState().tasks.find((t) => t.id === "t-b");
    expect(task?.tagIds).toEqual([]);
  });

  it("createTagAndAttach は作ってから選択中タスクへ付ける", async () => {
    const created = {
      id: "tag-new",
      boardId: "board-1",
      name: "新規",
      color: "#E88A85",
      position: 3,
    };
    useAppStore.setState({
      currentBoardId: "board-1",
      tasks: fixtures.tasks,
      tags: fixtures.tags,
      selectedTaskId: "t-b",
    });
    vi.mocked(api.tagCreate).mockResolvedValue(created);
    vi.mocked(api.taskTagToggle).mockResolvedValue(["tag-new"]);

    await useAppStore.getState().createTagAndAttach("  新規  ");

    expect(api.tagCreate).toHaveBeenCalledWith("board-1", "新規");
    expect(useAppStore.getState().tags).toContainEqual(created);
    const task = useAppStore.getState().tasks.find((t) => t.id === "t-b");
    expect(task?.tagIds).toEqual(["tag-new"]);
  });

  it("renameTag は一覧の該当タグを差し替える", async () => {
    const renamed = {
      id: "tag-bug",
      boardId: "board-1",
      name: "不具合",
      color: "#7EA9E8",
      position: 0,
    };
    useAppStore.setState({ currentBoardId: "board-1", tags: fixtures.tags });
    vi.mocked(api.tagRename).mockResolvedValue(renamed);

    await useAppStore.getState().renameTag("tag-bug", "不具合");

    expect(useAppStore.getState().tags[0]).toEqual(renamed);
  });

  it("deleteTag はタグ一覧からも全タスクからも外す", async () => {
    useAppStore.setState({
      currentBoardId: "board-1",
      tasks: fixtures.tasks,
      tags: fixtures.tags,
    });
    vi.mocked(api.tagDelete).mockResolvedValue(undefined);

    await useAppStore.getState().deleteTag("tag-bug");

    const state = useAppStore.getState();
    expect(state.tags.map((t) => t.id)).toEqual(["tag-urgent", "tag-design"]);
    expect(state.tasks.every((t) => !t.tagIds.includes("tag-bug"))).toBe(true);
  });

  it("ボード切替の読込中はタグの付け外しを受け付けない", async () => {
    vi.mocked(api.statusesList).mockImplementation(() => new Promise(() => {}));
    vi.mocked(api.tasksList).mockImplementation(() => new Promise(() => {}));
    vi.mocked(api.tagsList).mockImplementation(() => new Promise(() => {}));
    useAppStore.setState({ tasks: fixtures.tasks, tags: fixtures.tags, selectedTaskId: "t-b" });
    void useAppStore.getState().selectBoard("board-2");

    await useAppStore.getState().toggleTaskTag("tag-bug");

    expect(api.taskTagToggle).not.toHaveBeenCalled();
  });
```

- [ ] **Step 2: テストを実行して失敗を確認**

Run: `npm run test -- --run src/store/appStore.test.ts`
Expected: FAIL（`toggleTaskTag is not a function`）

- [ ] **Step 3: 最小の実装を書く**

`src/store/appStore.ts` の `taskCreating` フラグの直後に、タグ系の二重実行防止フラグを足す。

```ts
/**
 * タグの作成・改名・削除の二重実行防止フラグ。
 * UI側の submittingRef と同じ発想で、応答待ち中の再実行を丸ごと拒否する。
 * ストアの外に置くのはテストの set/getState リセットに巻き込まれないようにするため。
 */
let tagSubmitting = false;
```

`closeTagPalette` の後ろに追加する。

```ts
  async toggleTaskTag(tagId) {
    if (boardLoading) return; // ボード切替の読込中は旧ボードのtasksを触ってしまうので拒否する
    const { tasks, selectedTaskId, currentBoardId } = get();
    if (selectedTaskId === null) return;
    const target = tasks.find((t) => t.id === selectedTaskId);
    if (target === undefined) return;

    const snapshot = tasks;
    const epoch = boardEpoch;
    const attached = target.tagIds.includes(tagId);
    // 楽観的更新: 押した瞬間にチップが増減する
    set({
      tasks: tasks.map((t) =>
        t.id === selectedTaskId
          ? {
              ...t,
              tagIds: attached
                ? t.tagIds.filter((id) => id !== tagId)
                : [...t.tagIds, tagId],
            }
          : t,
      ),
    });

    try {
      const tagIds = await api.taskTagToggle(selectedTaskId, tagId);
      if (epoch !== boardEpoch) return;
      // 並び順(tags.position昇順)はRust側の返り値を正とする
      set((s) => ({
        tasks: s.tasks.map((t) => (t.id === selectedTaskId ? { ...t, tagIds } : t)),
      }));
    } catch (e) {
      await recoverTasks(currentBoardId, snapshot, epoch);
      if (epoch !== boardEpoch) return;
      toast.error(`タグの変更に失敗しました: ${String(e)}`);
    }
  },

  async createTagAndAttach(name) {
    if (boardLoading) return;
    if (tagSubmitting) return; // 応答待ち中の⌘Enter連打による二重作成を防ぐ
    const { currentBoardId, selectedTaskId } = get();
    const trimmed = name.trim();
    if (currentBoardId === null || trimmed === "") return;

    const epoch = boardEpoch;
    tagSubmitting = true;
    try {
      const created = await api.tagCreate(currentBoardId, trimmed);
      if (epoch !== boardEpoch) return;
      set((s) => ({ tags: [...s.tags, created] }));
      // 作ったらそのまま選択中タスクへ付ける（作るだけで終わらせない）
      if (selectedTaskId !== null) {
        tagSubmitting = false;
        await get().toggleTaskTag(created.id);
      }
    } catch (e) {
      if (epoch !== boardEpoch) return;
      toast.error(`タグの作成に失敗しました: ${String(e)}`);
    } finally {
      tagSubmitting = false;
    }
  },

  async renameTag(id, name) {
    if (boardLoading) return;
    if (tagSubmitting) return;
    const trimmed = name.trim();
    if (trimmed === "") return;

    const epoch = boardEpoch;
    tagSubmitting = true;
    try {
      const updated = await api.tagRename(id, trimmed);
      if (epoch !== boardEpoch) return;
      set((s) => ({ tags: s.tags.map((t) => (t.id === id ? updated : t)) }));
    } catch (e) {
      if (epoch !== boardEpoch) return;
      toast.error(`タグの改名に失敗しました: ${String(e)}`);
    } finally {
      tagSubmitting = false;
    }
  },

  async deleteTag(id) {
    if (boardLoading) return;
    if (tagSubmitting) return;

    const epoch = boardEpoch;
    tagSubmitting = true;
    try {
      await api.tagDelete(id);
      if (epoch !== boardEpoch) return;
      // Rust側は task_tags を CASCADE で消すので、手元のタスクからも外す
      set((s) => ({
        tags: s.tags.filter((t) => t.id !== id),
        tasks: s.tasks.map((t) => ({ ...t, tagIds: t.tagIds.filter((tid) => tid !== id) })),
      }));
    } catch (e) {
      if (epoch !== boardEpoch) return;
      toast.error(`タグの削除に失敗しました: ${String(e)}`);
    } finally {
      tagSubmitting = false;
    }
  },
```

- [ ] **Step 4: テストを実行して成功を確認**

Run: `npm run test -- --run src/store/appStore.test.ts`
Expected: PASS（全件）

- [ ] **Step 5: 全テストを実行**

Run: `npm run test -- --run && npm run build`
Expected: PASS

- [ ] **Step 6: コミット**

```bash
git add src/store/appStore.ts src/store/appStore.test.ts
git commit -m "feat: タグの付け外し・作成・改名・削除をストアに実装"
```

---

# フェーズ4 — UI

### Task 11: CSS トークン

**Files:**
- Modify: `src/index.css`（ファイル末尾のレイヤー外の自作CSS領域）

テスト不要（トークン定義のみ）。

- [ ] **Step 1: トークンを追加**

`src/index.css` の `:root { --st-palette-bg: ... }`（153行目付近）のブロック末尾に足す。

```css
  --st-tag-fg: #6e6e73;
  --st-tag-bg: rgba(0, 0, 0, 0.055);
```

`@media (prefers-color-scheme: dark)` のブロック末尾に足す。

```css
    --st-tag-fg: #a1a1a6;
    --st-tag-bg: rgba(255, 255, 255, 0.09);
```

- [ ] **Step 2: ビルドを実行**

Run: `npm run build`
Expected: 成功

- [ ] **Step 3: コミット**

```bash
git add src/index.css
git commit -m "style: タグチップ用のカラートークンを追加"
```

---

### Task 12: 看板カードのタグチップ

**Files:**
- Modify: `src/components/TaskCard.tsx`
- Test: `src/components/TaskCard.test.tsx`（無ければ新規作成）

- [ ] **Step 1: 失敗するテストを書く**

`src/components/TaskCard.test.tsx`（新規なら丸ごとこの内容）。

```tsx
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { TaskCard } from "@/components/TaskCard";
import { useAppStore, initialAppState } from "@/store/appStore";
import { makeTask, tags as tagFixtures } from "@/test/fixtures";

describe("TaskCard のタグ表示", () => {
  beforeEach(() => {
    useAppStore.setState({ ...initialAppState, tags: tagFixtures });
  });

  it("タグ名をチップで表示する", () => {
    const task = makeTask("t-x", "st-todo", "タスク", 0, ["tag-bug", "tag-urgent"]);

    render(<TaskCard task={task} statusColor="#007AFF" selected={false} />);

    expect(screen.getByText("バグ")).toBeInTheDocument();
    expect(screen.getByText("緊急")).toBeInTheDocument();
  });

  it("タグが無いカードはチップ行そのものを描画しない", () => {
    const task = makeTask("t-y", "st-todo", "タスク", 0);

    render(<TaskCard task={task} statusColor="#007AFF" selected={false} />);

    expect(screen.queryByTestId("task-card-tags")).not.toBeInTheDocument();
  });

  it("ストアに無いタグidは無視する", () => {
    const task = makeTask("t-z", "st-todo", "タスク", 0, ["tag-bug", "tag-gone"]);

    render(<TaskCard task={task} statusColor="#007AFF" selected={false} />);

    expect(screen.getByTestId("task-card-tags").children).toHaveLength(1);
  });

  it("選択中カードではタグ色を捨てて白系の配色になる", () => {
    const task = makeTask("t-w", "st-todo", "タスク", 0, ["tag-bug"]);

    render(<TaskCard task={task} statusColor="#007AFF" selected />);

    const chip = screen.getByText("バグ");
    expect(chip).toHaveStyle({ color: "#fff" });
  });
});
```

- [ ] **Step 2: テストを実行して失敗を確認**

Run: `npm run test -- --run src/components/TaskCard.test.tsx`
Expected: FAIL（`Unable to find an element with the text: バグ`）

- [ ] **Step 3: 最小の実装を書く**

`src/components/TaskCard.tsx` を丸ごと書き換える。

```tsx
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { usePrefersDark } from "@/hooks/usePrefersDark";
import { tagChipStyle } from "@/lib/tagPalette";
import { useAppStore } from "@/store/appStore";
import type { Tag, Task } from "@/types";

interface TaskCardProps {
  task: Task;
  /** 所属レーンのステータス色。選択時の強調に使う */
  statusColor: string;
  selected: boolean;
}

/** 「+n」チップの想定幅(px)。実測せず固定で見積もる */
const MORE_CHIP_WIDTH = 26;
/** チップ間の隙間(px)。className の gap-[3px] と一致させること */
const CHIP_GAP = 3;

export function TaskCard({ task, statusColor, selected }: TaskCardProps) {
  const setSelectedTask = useAppStore((s) => s.setSelectedTask);
  const setView = useAppStore((s) => s.setView);
  const allTags = useAppStore((s) => s.tags);
  const isDark = usePrefersDark();
  const ref = useRef<HTMLDivElement>(null);

  // キーボードで選択が移動したとき、カードが画面外なら見える位置までスクロールする
  useEffect(() => {
    if (selected) ref.current?.scrollIntoView({ block: "nearest" });
  }, [selected]);

  // 既に消えたタグidが残っていても落ちないよう、引けたものだけ使う
  const tags = task.tagIds
    .map((id) => allTags.find((t) => t.id === id))
    .filter((t): t is Tag => t !== undefined);

  const tagKey = task.tagIds.join(",");
  const rowRef = useRef<HTMLDivElement>(null);
  // null = 「まだ測っていない」。この間は全チップを描画して、それを実測する
  const [visibleCount, setVisibleCount] = useState<number | null>(null);

  // タグが変わったら測り直す
  useLayoutEffect(() => {
    setVisibleCount(null);
  }, [tagKey]);

  useLayoutEffect(() => {
    // 測定は「全チップが描かれている」ときだけ行う（ここで早期returnするのでループしない）
    if (visibleCount !== null) return;
    const row = rowRef.current;
    if (row === null) return;
    const chips = Array.from(row.children) as HTMLElement[];
    if (chips.length === 0) return;

    const limit = row.clientWidth;
    // jsdom は offsetWidth / clientWidth が常に0で測れない。省略せず全部見せる
    if (limit === 0) {
      setVisibleCount(chips.length);
      return;
    }

    let used = 0;
    let fit = 0;
    for (const chip of chips) {
      const next = used + (fit === 0 ? 0 : CHIP_GAP) + chip.offsetWidth;
      if (next > limit) break;
      used = next;
      fit += 1;
    }
    if (fit >= chips.length) {
      setVisibleCount(chips.length);
      return;
    }
    // 「+n」を置く余白が無ければ、入るまで1つずつ削る
    while (fit > 1 && used + CHIP_GAP + MORE_CHIP_WIDTH > limit) {
      used -= chips[fit - 1].offsetWidth + CHIP_GAP;
      fit -= 1;
    }
    setVisibleCount(Math.max(1, fit));
  }, [visibleCount, tagKey]);

  const shown = visibleCount === null ? tags : tags.slice(0, visibleCount);
  const hidden = tags.length - shown.length;

  return (
    <div
      ref={ref}
      role="button"
      // フォーカスは検索バーに集約するため、カード自体はタブ移動の対象にしない
      tabIndex={-1}
      data-testid="task-card"
      data-task-id={task.id}
      data-selected={selected ? "true" : "false"}
      onClick={() => setSelectedTask(task.id)}
      onDoubleClick={() => {
        setSelectedTask(task.id);
        setView("detail");
      }}
      className={
        selected
          ? "st-card cursor-default rounded-xl px-3 py-2 text-[13px] leading-snug"
          : "st-card cursor-default rounded-xl px-3 py-2 text-[13px] leading-snug shadow-sm"
      }
      style={
        selected
          ? {
              backgroundColor: statusColor,
              color: "#fff",
              boxShadow: `0 4px 12px ${statusColor}59`,
            }
          : { color: "var(--st-text-primary)" }
      }
    >
      {task.title}
      {/* タグを持たないカードは行そのものを描画しない（可視カード数を減らさないため） */}
      {tags.length > 0 && (
        <div
          ref={rowRef}
          data-testid="task-card-tags"
          className="mt-1 flex gap-[3px] overflow-hidden whitespace-nowrap"
        >
          {shown.map((tag) => (
            <span
              key={tag.id}
              className="rounded-[5px] px-[5px] text-[9.5px] leading-[14px]"
              style={tagChipStyle(tag.color, selected, isDark)}
            >
              {tag.name}
            </span>
          ))}
          {hidden > 0 && (
            <span
              data-testid="task-card-tags-more"
              className="rounded-[5px] px-[5px] text-[9.5px] leading-[14px]"
              style={
                selected
                  ? { backgroundColor: "rgba(255,255,255,0.22)", color: "#fff" }
                  : { backgroundColor: "var(--st-tag-bg)", color: "var(--st-tag-fg)" }
              }
            >
              +{hidden}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
```

> `useEffect` の import が抜けないよう、1行目を `import { useEffect, useLayoutEffect, useRef, useState } from "react";` にすること。

- [ ] **Step 4: テストを実行して成功を確認**

Run: `npm run test -- --run src/components/TaskCard.test.tsx`
Expected: PASS（4件）

- [ ] **Step 5: 全テストとビルド**

Run: `npm run test -- --run && npm run build`
Expected: PASS

- [ ] **Step 6: コミット**

```bash
git add src/components/TaskCard.tsx src/components/TaskCard.test.tsx
git commit -m "feat: 看板カードにタグチップを表示する"
```

---

### Task 13: 詳細画面のタグ行

**Files:**
- Modify: `src/components/TaskDetail.tsx:180`（タイトル input の直後）
- Test: `src/components/TaskDetail.test.tsx`

- [ ] **Step 1: 失敗するテストを書く**

`src/components/TaskDetail.test.tsx` に追加する。既存ファイルのセットアップ（ストアの初期化方法）に合わせること。

```tsx
  it("タイトルの下にタグを省略なしで表示する", () => {
    useAppStore.setState({
      ...initialAppState,
      tasks: [makeTask("t-a", "st-todo", "タスク", 0, ["tag-bug", "tag-urgent", "tag-design"])],
      statuses: fixtures.statuses,
      tags: fixtures.tags,
      selectedTaskId: "t-a",
      view: "detail",
    });

    render(<TaskDetail />);

    const row = screen.getByTestId("task-detail-tags");
    expect(row).toHaveTextContent("バグ");
    expect(row).toHaveTextContent("緊急");
    expect(row).toHaveTextContent("設計");
  });

  it("タグが無いときは追加を促す文言を出す", () => {
    useAppStore.setState({
      ...initialAppState,
      tasks: [makeTask("t-a", "st-todo", "タスク", 0)],
      statuses: fixtures.statuses,
      tags: fixtures.tags,
      selectedTaskId: "t-a",
      view: "detail",
    });

    render(<TaskDetail />);

    expect(screen.getByText("⌘K でタグを追加")).toBeInTheDocument();
  });
```

- [ ] **Step 2: テストを実行して失敗を確認**

Run: `npm run test -- --run src/components/TaskDetail.test.tsx`
Expected: FAIL（`Unable to find an element by: [data-testid="task-detail-tags"]`）

- [ ] **Step 3: 最小の実装を書く**

`src/components/TaskDetail.tsx` の import に追加する。

```tsx
import { tagChipStyle } from "../lib/tagPalette";
import type { Tag } from "../types";
```

ストア購読を追加する（`moveSelectedTask` の下）。

```tsx
  const allTags = useAppStore((state) => state.tags);
```

`task` を求めている行の下に足す。

```tsx
  // 既に消えたタグidが残っていても落ちないよう、引けたものだけ使う
  const tags = (task?.tagIds ?? [])
    .map((id) => allTags.find((t) => t.id === id))
    .filter((t): t is Tag => t !== undefined);
```

タイトル `<input>` の閉じタグ（`/>`）の直後、本文エリアの `<div className="min-h-0 flex-1 ...">` の手前に足す。

```tsx
      <div data-testid="task-detail-tags" className="mx-8 mb-3 flex flex-wrap gap-1.5">
        {tags.length === 0 ? (
          <span className="text-[11px]" style={{ color: "var(--st-text-tertiary)" }}>
            ⌘K でタグを追加
          </span>
        ) : (
          tags.map((tag) => (
            <span
              key={tag.id}
              className="rounded-[5px] px-1.5 py-0.5 text-[11px]"
              // 詳細画面はステータス色のベタ塗りが無いので常に通常配色（第2引数はfalse）
              style={tagChipStyle(tag.color, false, isDark)}
            >
              {tag.name}
            </span>
          ))
        )}
      </div>
```

- [ ] **Step 4: テストを実行して成功を確認**

Run: `npm run test -- --run src/components/TaskDetail.test.tsx`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add src/components/TaskDetail.tsx src/components/TaskDetail.test.tsx
git commit -m "feat: 詳細画面のタイトル下にタグを表示する"
```

---

### Task 14: タグパレットの骨組み（絞り込み・移動・トグル）

**Files:**
- Create: `src/components/TagPalette.tsx`
- Test: `src/components/TagPalette.test.tsx`

- [ ] **Step 1: 失敗するテストを書く**

`src/components/TagPalette.test.tsx` を新規作成する。

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TagPalette } from "@/components/TagPalette";
import { initialAppState, useAppStore } from "@/store/appStore";
import { statuses, tags, tasks } from "@/test/fixtures";

function setup() {
  useAppStore.setState({
    ...initialAppState,
    currentBoardId: "board-1",
    statuses,
    tasks,
    tags,
    // t-b はタグなし
    selectedTaskId: "t-b",
    tagPaletteOpen: true,
  });
}

describe("TagPalette", () => {
  beforeEach(() => {
    setup();
    vi.restoreAllMocks();
  });

  it("ボードのタグを全部並べる", () => {
    render(<TagPalette />);

    expect(screen.getByRole("option", { name: /バグ/ })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /緊急/ })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /設計/ })).toBeInTheDocument();
  });

  it("入力で候補を絞り込む", async () => {
    const user = userEvent.setup();
    render(<TagPalette />);

    await user.type(screen.getByTestId("tag-palette-input"), "バグ");

    expect(screen.getByRole("option", { name: /バグ/ })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: /設計/ })).not.toBeInTheDocument();
  });

  it("付与済みのタグを先頭に並べる", () => {
    // t-c は バグ・緊急 が付いている
    useAppStore.setState({ selectedTaskId: "t-c" });
    render(<TagPalette />);

    const options = screen.getAllByRole("option");
    expect(options[0]).toHaveTextContent("バグ");
    expect(options[1]).toHaveTextContent("緊急");
  });

  it("Enter でハイライト中のタグをトグルする", async () => {
    const toggle = vi.fn();
    useAppStore.setState({ toggleTaskTag: toggle });
    const user = userEvent.setup();
    render(<TagPalette />);

    await user.keyboard("{Enter}");

    expect(toggle).toHaveBeenCalledWith("tag-bug");
  });

  it("↓ でハイライトが次の候補へ移る", async () => {
    const toggle = vi.fn();
    useAppStore.setState({ toggleTaskTag: toggle });
    const user = userEvent.setup();
    render(<TagPalette />);

    await user.keyboard("{ArrowDown}{Enter}");

    expect(toggle).toHaveBeenCalledWith("tag-urgent");
  });

  it("入力欄が空のときの Backspace は付与済みの末尾を外す", async () => {
    const toggle = vi.fn();
    // t-c は バグ・緊急 の順で付いている
    useAppStore.setState({ selectedTaskId: "t-c", toggleTaskTag: toggle });
    const user = userEvent.setup();
    render(<TagPalette />);

    await user.keyboard("{Backspace}");

    expect(toggle).toHaveBeenCalledWith("tag-urgent");
  });

  it("Esc で閉じる", async () => {
    const close = vi.fn();
    useAppStore.setState({ closeTagPalette: close });
    const user = userEvent.setup();
    render(<TagPalette />);

    await user.keyboard("{Escape}");

    expect(close).toHaveBeenCalled();
  });

  it("使用件数を出す", () => {
    render(<TagPalette />);

    // バグは t-a と t-c に付いている
    expect(screen.getByRole("option", { name: /バグ/ })).toHaveTextContent("2");
  });
});
```

- [ ] **Step 2: テストを実行して失敗を確認**

Run: `npm run test -- --run src/components/TagPalette.test.tsx`
Expected: FAIL（`Failed to resolve import "@/components/TagPalette"`）

- [ ] **Step 3: 最小の実装を書く**

`src/components/TagPalette.tsx` を新規作成する。

```tsx
import { Tag as TagIcon } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useAppStore } from "@/store/appStore";
import type { Tag } from "@/types";

/** 1行分の表示データ */
interface TagRow {
  tag: Tag;
  attached: boolean;
  count: number;
}

/**
 * ⌘Kで開くタグ付与・管理オーバーレイ。
 * viewは増やさず、board / detail の上に重ねる。付け外し・作成・改名・削除がこの1枚で完結する。
 */
export function TagPalette() {
  const tasks = useAppStore((s) => s.tasks);
  const allTags = useAppStore((s) => s.tags);
  const selectedTaskId = useAppStore((s) => s.selectedTaskId);
  const closeTagPalette = useAppStore((s) => s.closeTagPalette);
  const toggleTaskTag = useAppStore((s) => s.toggleTaskTag);

  const [query, setQuery] = useState("");
  // -1 は「着地点なし」。IME変換中はここへ落としてEnterを無害化する
  const [highlight, setHighlight] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const task = tasks.find((t) => t.id === selectedTaskId) ?? null;

  const rows = useMemo<TagRow[]>(() => {
    const q = query.trim().toLowerCase();
    const counts = new Map<string, number>();
    for (const t of tasks) {
      for (const id of t.tagIds) counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    const visible = allTags.filter((t) => q === "" || t.name.toLowerCase().includes(q));
    const decorate = (tag: Tag): TagRow => ({
      tag,
      attached: task?.tagIds.includes(tag.id) ?? false,
      count: counts.get(tag.id) ?? 0,
    });
    // 付与済みは task.tagIds の順（= tags.position 昇順）、未付与は使用件数の降順
    const attached = (task?.tagIds ?? [])
      .map((id) => visible.find((t) => t.id === id))
      .filter((t): t is Tag => t !== undefined)
      .map(decorate);
    const rest = visible
      .filter((t) => !(task?.tagIds.includes(t.id) ?? false))
      .map(decorate)
      .sort((a, b) => b.count - a.count || a.tag.position - b.tag.position);
    return [...attached, ...rest];
  }, [allTags, tasks, task, query]);

  // 候補が変わったら先頭に戻す（候補が消えたら着地点なしにする）
  useEffect(() => {
    setHighlight(rows.length > 0 ? 0 : -1);
  }, [rows.length, query]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    // window側のハンドラへ漏らさない（useKeyboard 側でも tagPaletteOpen で止めているが二重に守る）
    event.stopPropagation();

    if (event.key === "Escape") {
      event.preventDefault();
      closeTagPalette();
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setHighlight((current) => (rows.length === 0 ? -1 : Math.min(current + 1, rows.length - 1)));
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlight((current) => (rows.length === 0 ? -1 : Math.max(current - 1, 0)));
      return;
    }

    if (event.key === "Backspace" && query === "") {
      // トークン入力の慣習に合わせ、入力欄が空のときだけ末尾のタグを外す
      const lastId = task?.tagIds[task.tagIds.length - 1];
      if (lastId === undefined) return;
      event.preventDefault();
      void toggleTaskTag(lastId);
      return;
    }

    if (event.key === "Enter" && !event.metaKey) {
      event.preventDefault();
      const row = rows[highlight];
      if (row === undefined) return;
      // トグルは可逆なので、万一の誤爆でももう一度押せば戻る
      void toggleTaskTag(row.tag.id);
      setQuery("");
      return;
    }
  };

  return (
    <div
      data-testid="tag-palette-scrim"
      className="absolute inset-0 z-30 flex items-start justify-center bg-black/[0.18] pt-16 backdrop-blur-[1px]"
      onClick={closeTagPalette}
    >
      <div
        role="dialog"
        aria-label="タグ"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
        className="flex max-h-[260px] w-[300px] flex-col overflow-hidden rounded-xl shadow-xl"
        style={{
          backgroundColor: "var(--st-palette-bg)",
          border: "0.5px solid var(--st-palette-border)",
        }}
      >
        <header
          className="flex items-center gap-1.5 border-b px-3 py-2"
          style={{ borderColor: "var(--st-palette-border)" }}
        >
          <TagIcon size={13} style={{ color: "var(--st-text-tertiary)" }} />
          <span
            className="truncate text-[11px]"
            style={{ color: "var(--st-text-secondary)" }}
          >
            {task?.title ?? ""}
          </span>
        </header>

        <input
          ref={inputRef}
          data-testid="tag-palette-input"
          aria-label="タグを検索または作成"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoComplete="off"
          spellCheck={false}
          placeholder="タグ名を入力"
          className="st-input bg-transparent px-3 py-2 text-[13px] outline-none"
          style={{ color: "var(--st-text-primary)" }}
        />

        <div role="listbox" aria-label="タグ候補" className="min-h-0 flex-1 overflow-y-auto px-1.5 pb-1.5">
          {rows.map((row, index) => (
            <div
              key={row.tag.id}
              role="option"
              aria-selected={row.attached}
              data-testid="tag-palette-row"
              data-highlighted={index === highlight ? "true" : "false"}
              onClick={() => void toggleTaskTag(row.tag.id)}
              className={`flex cursor-default items-center gap-2 rounded-md px-2 py-1 text-[12px] ${
                index === highlight ? "st-row-selected" : ""
              }`}
              style={{ color: "var(--st-text-primary)" }}
            >
              <span
                className="h-1.5 w-1.5 shrink-0 rounded-full"
                style={{ backgroundColor: row.tag.color }}
              />
              <span className="w-3 shrink-0 text-center" style={{ color: "var(--st-text-secondary)" }}>
                {row.attached ? "✓" : ""}
              </span>
              <span className="min-w-0 flex-1 truncate">{row.tag.name}</span>
              <span className="shrink-0 tabular-nums text-[10px]" style={{ color: "var(--st-text-tertiary)" }}>
                {row.count}
              </span>
            </div>
          ))}
        </div>

        <footer
          className="flex flex-wrap gap-x-2.5 gap-y-1 border-t px-3 py-1.5 text-[9.5px]"
          style={{
            borderColor: "var(--st-palette-border)",
            color: "var(--st-text-tertiary)",
          }}
        >
          <span>⏎ 付け外し</span>
          <span>⌘⏎ 作成</span>
          <span>⌘R 改名</span>
          <span>⌘⌫ 削除</span>
          <span>Esc 閉じる</span>
        </footer>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: テストを実行して成功を確認**

Run: `npm run test -- --run src/components/TagPalette.test.tsx`
Expected: PASS（8件）

- [ ] **Step 5: コミット**

```bash
git add src/components/TagPalette.tsx src/components/TagPalette.test.tsx
git commit -m "feat: タグパレットの絞り込みと付け外しを実装"
```

---

### Task 15: タグパレットの作成・改名・削除

**Files:**
- Modify: `src/components/TagPalette.tsx`
- Test: `src/components/TagPalette.test.tsx`

- [ ] **Step 1: 失敗するテストを書く**

`src/components/TagPalette.test.tsx` に追加する。

```tsx
  it("未登録の名前を打つと作成行が出る", async () => {
    const user = userEvent.setup();
    render(<TagPalette />);

    await user.type(screen.getByTestId("tag-palette-input"), "新規タグ");

    expect(screen.getByTestId("tag-palette-create")).toHaveTextContent("新規タグ");
  });

  it("既にある名前と完全一致するなら作成行は出さない", async () => {
    const user = userEvent.setup();
    render(<TagPalette />);

    await user.type(screen.getByTestId("tag-palette-input"), "バグ");

    expect(screen.queryByTestId("tag-palette-create")).not.toBeInTheDocument();
  });

  it("⌘Enter で作成する（素のEnterでは作らない）", async () => {
    const create = vi.fn();
    useAppStore.setState({ createTagAndAttach: create });
    const user = userEvent.setup();
    render(<TagPalette />);
    await user.type(screen.getByTestId("tag-palette-input"), "新規タグ");

    // 素のEnterは作成しない（IMEの変換確定で誤爆させないため）
    await user.keyboard("{Enter}");
    expect(create).not.toHaveBeenCalled();

    await user.keyboard("{Meta>}{Enter}{/Meta}");
    expect(create).toHaveBeenCalledWith("新規タグ");
  });

  it("⌘R で改名の入力欄に変わり、⌘Enter で確定する", async () => {
    const rename = vi.fn();
    useAppStore.setState({ renameTag: rename });
    const user = userEvent.setup();
    render(<TagPalette />);

    await user.keyboard("{Meta>}r{/Meta}");
    const input = screen.getByTestId("tag-palette-rename-input");
    expect(input).toHaveValue("バグ");

    await user.clear(input);
    await user.type(input, "不具合");
    await user.keyboard("{Meta>}{Enter}{/Meta}");

    expect(rename).toHaveBeenCalledWith("tag-bug", "不具合");
  });

  it("改名は Esc で取り消せる", async () => {
    const rename = vi.fn();
    useAppStore.setState({ renameTag: rename });
    const user = userEvent.setup();
    render(<TagPalette />);

    await user.keyboard("{Meta>}r{/Meta}");
    await user.keyboard("{Escape}");

    expect(screen.queryByTestId("tag-palette-rename-input")).not.toBeInTheDocument();
    expect(rename).not.toHaveBeenCalled();
  });

  it("⌘Backspace で確認ダイアログを出し、件数を伝える", async () => {
    const user = userEvent.setup();
    render(<TagPalette />);

    await user.keyboard("{Meta>}{Backspace}{/Meta}");

    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    expect(screen.getByText(/2件のタスクからこのタグが外れます/)).toBeInTheDocument();
  });

  it("確認ダイアログで Enter を押すと削除する", async () => {
    const remove = vi.fn();
    useAppStore.setState({ deleteTag: remove });
    const user = userEvent.setup();
    render(<TagPalette />);
    await user.keyboard("{Meta>}{Backspace}{/Meta}");

    await user.keyboard("{Enter}");

    expect(remove).toHaveBeenCalledWith("tag-bug");
  });
```

- [ ] **Step 2: テストを実行して失敗を確認**

Run: `npm run test -- --run src/components/TagPalette.test.tsx`
Expected: FAIL（`tag-palette-create` が見つからない）

- [ ] **Step 3: 最小の実装を書く**

`src/components/TagPalette.tsx` の import に追加する。

```tsx
import { ConfirmDialog } from "@/components/ConfirmDialog";
```

ストア購読を追加する（`toggleTaskTag` の下）。

```tsx
  const createTagAndAttach = useAppStore((s) => s.createTagAndAttach);
  const renameTag = useAppStore((s) => s.renameTag);
  const deleteTag = useAppStore((s) => s.deleteTag);
```

state を追加する（`highlight` の下）。

```tsx
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);
```

`rows` の下に、作成できるかの判定を足す。

```tsx
  const trimmedQuery = query.trim();
  // 完全一致するタグが既にあるなら「作成」は出さない
  const canCreate =
    trimmedQuery !== "" &&
    !allTags.some((t) => t.name.trim().toLowerCase() === trimmedQuery.toLowerCase());
```

改名入力へフォーカスする効果を足す。

```tsx
  useEffect(() => {
    if (renamingId === null) return;
    renameInputRef.current?.focus();
    renameInputRef.current?.select();
  }, [renamingId]);
```

`handleKeyDown` の `Escape` 判定の**前**に、改名中の分岐を足す。

```tsx
    // 改名中は専用の入力欄側で処理する（下の分岐へ落とさない）
    if (renamingId !== null) return;
```

`handleKeyDown` の `Escape` 判定の**後ろ**に、⌘系の分岐を足す。

```tsx
    if (event.metaKey && event.key === "Enter") {
      // IMEは修飾キー付きEnterを生成しないので、変換確定で誤って作られることがない
      event.preventDefault();
      if (!canCreate) return;
      void createTagAndAttach(trimmedQuery);
      setQuery("");
      return;
    }

    if (event.metaKey && (event.key === "r" || event.key === "R")) {
      event.preventDefault();
      const row = rows[highlight];
      if (row === undefined) return;
      setRenamingId(row.tag.id);
      setRenameValue(row.tag.name);
      return;
    }

    if (event.metaKey && event.key === "Backspace") {
      event.preventDefault();
      const row = rows[highlight];
      if (row === undefined) return;
      setConfirmDeleteId(row.tag.id);
      return;
    }
```

行の描画を、改名中なら入力欄へ差し替える。`<span className="min-w-0 flex-1 truncate">{row.tag.name}</span>` を次に置き換える。

```tsx
              {renamingId === row.tag.id ? (
                <input
                  ref={renameInputRef}
                  data-testid="tag-palette-rename-input"
                  aria-label="タグ名を変更"
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  onKeyDown={(event) => {
                    event.stopPropagation();
                    // IMEが処理中のキーには触らない
                    if (event.nativeEvent.isComposing || event.keyCode === 229) return;
                    if (event.key === "Escape") {
                      event.preventDefault();
                      setRenamingId(null);
                      return;
                    }
                    if (event.key === "Enter") {
                      event.preventDefault();
                      // 素のEnterは変換確定と区別できないので確定させない
                      if (!event.metaKey) return;
                      void renameTag(row.tag.id, renameValue);
                      setRenamingId(null);
                    }
                  }}
                  className="st-input min-w-0 flex-1 bg-transparent outline-none"
                  style={{ color: "var(--st-text-primary)" }}
                />
              ) : (
                <span className="min-w-0 flex-1 truncate">{row.tag.name}</span>
              )}
```

候補リストの `</div>` の直後（footer の手前）に作成行を足す。

```tsx
        {canCreate && (
          <div
            data-testid="tag-palette-create"
            onClick={() => {
              void createTagAndAttach(trimmedQuery);
              setQuery("");
            }}
            className="flex cursor-default items-center gap-2 border-t px-3 py-1.5 text-[12px]"
            style={{
              borderColor: "var(--st-palette-border)",
              color: "var(--st-text-secondary)",
            }}
          >
            <span className="min-w-0 flex-1 truncate">＋「{trimmedQuery}」を作成</span>
            <span className="shrink-0 text-[10px]">⌘⏎</span>
          </div>
        )}
```

コンポーネントの最外周 `</div>` の直前（`role="dialog"` の div の中の末尾）に確認ダイアログを足す。

```tsx
        {confirmDeleteId !== null && (
          <ConfirmDialog
            title={`「${allTags.find((t) => t.id === confirmDeleteId)?.name ?? ""}」を削除しますか？`}
            description={`${
              tasks.filter((t) => t.tagIds.includes(confirmDeleteId)).length
            }件のタスクからこのタグが外れます。元に戻せません。`}
            confirmLabel="削除"
            onConfirm={() => {
              void deleteTag(confirmDeleteId);
              setConfirmDeleteId(null);
            }}
            onCancel={() => setConfirmDeleteId(null)}
          />
        )}
```

- [ ] **Step 4: テストを実行して成功を確認**

Run: `npm run test -- --run src/components/TagPalette.test.tsx`
Expected: PASS（15件）

- [ ] **Step 5: コミット**

```bash
git add src/components/TagPalette.tsx src/components/TagPalette.test.tsx
git commit -m "feat: タグパレットでタグの作成・改名・削除ができるようにする"
```

---

### Task 16: タグパレットの IME 防御

**Files:**
- Modify: `src/components/TagPalette.tsx`
- Test: `src/components/TagPalette.test.tsx`

設計書の原則: **IMEが原理的に生成できない入力でだけ、不可逆な操作をコミットする。**
Task 15 までで「作成・改名・削除は必ず⌘付き」は満たしている。ここでは残り2層
（変換中はハイライトを外す / 変換確定のEnterを1回だけ飲み込む）を実装する。

- [ ] **Step 1: 失敗するテストを書く**

```tsx
import { fireEvent } from "@testing-library/react";

  it("IME変換中はハイライトが外れ、Enterの着地点が無くなる", () => {
    const toggle = vi.fn();
    useAppStore.setState({ toggleTaskTag: toggle });
    render(<TagPalette />);
    const input = screen.getByTestId("tag-palette-input");

    fireEvent.compositionStart(input);
    fireEvent.keyDown(input, { key: "Enter" });

    expect(toggle).not.toHaveBeenCalled();
    expect(screen.queryByTestId("tag-palette-row")?.dataset.highlighted).toBe("false");
  });

  it("変換確定の直後に来るEnterは1回だけ飲み込む", () => {
    const toggle = vi.fn();
    useAppStore.setState({ toggleTaskTag: toggle });
    render(<TagPalette />);
    const input = screen.getByTestId("tag-palette-input");

    // WebKitは compositionend を keydown より先に出すため、isComposing だけでは防げない
    fireEvent.compositionStart(input);
    fireEvent.compositionEnd(input);
    fireEvent.keyDown(input, { key: "Enter" });

    expect(toggle).not.toHaveBeenCalled();
  });

  it("飲み込んだ次のEnterは通常どおりトグルする", () => {
    const toggle = vi.fn();
    useAppStore.setState({ toggleTaskTag: toggle });
    render(<TagPalette />);
    const input = screen.getByTestId("tag-palette-input");

    fireEvent.compositionStart(input);
    fireEvent.compositionEnd(input);
    fireEvent.keyDown(input, { key: "Enter" });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(toggle).toHaveBeenCalledTimes(1);
  });

  it("飲み込みの待機は Enter 以外のキーでも解除される", () => {
    const toggle = vi.fn();
    useAppStore.setState({ toggleTaskTag: toggle });
    render(<TagPalette />);
    const input = screen.getByTestId("tag-palette-input");

    fireEvent.compositionStart(input);
    fireEvent.compositionEnd(input);
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(toggle).toHaveBeenCalledTimes(1);
  });
```

- [ ] **Step 2: テストを実行して失敗を確認**

Run: `npm run test -- --run src/components/TagPalette.test.tsx`
Expected: FAIL（変換中でも Enter がトグルしてしまう）

- [ ] **Step 3: 最小の実装を書く**

`src/components/TagPalette.tsx` に ref を追加する（`renameInputRef` の下）。

```tsx
  /** IME変換中かどうか。変換中はハイライトを外してEnterの着地点を消す */
  const composingRef = useRef(false);
  /**
   * 「次のkeydownがEnterなら1回だけ無視する」フラグ。
   * WebKitは compositionend を keydown より先に発火するため、isComposing だけでは
   * 変換確定のEnterを取りこぼす。時間ではなく「次の1イベント」に依存させるので確実。
   */
  const swallowEnterRef = useRef(false);
```

候補が変わったときのハイライト復帰を、変換中は行わないようにする。

```tsx
  useEffect(() => {
    // 変換中は着地点を作らない
    if (composingRef.current) return;
    setHighlight(rows.length > 0 ? 0 : -1);
  }, [rows.length, query]);
```

`handleKeyDown` の先頭（`event.stopPropagation()` の直後）に2つのガードを足す。

```tsx
    // IMEが処理中のキーは一切拾わない。keyCode 229 は isComposing を立てない環境の合図
    if (event.nativeEvent.isComposing || event.keyCode === 229) return;

    // 変換確定の直後に届くEnterを1回だけ飲み込む。
    // 待機はどのキーでも解除するので、確定後に別のキーを打てば次のEnterは通常どおり効く。
    if (swallowEnterRef.current) {
      swallowEnterRef.current = false;
      if (event.key === "Enter") {
        event.preventDefault();
        return;
      }
    }
```

入力欄に composition ハンドラを足す。

```tsx
        <input
          ref={inputRef}
          data-testid="tag-palette-input"
          aria-label="タグを検索または作成"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onCompositionStart={() => {
            composingRef.current = true;
            setHighlight(-1);
          }}
          onCompositionEnd={() => {
            composingRef.current = false;
            swallowEnterRef.current = true;
            setHighlight(rows.length > 0 ? 0 : -1);
          }}
          autoComplete="off"
          spellCheck={false}
          placeholder="タグ名を入力"
          className="st-input bg-transparent px-3 py-2 text-[13px] outline-none"
          style={{ color: "var(--st-text-primary)" }}
        />
```

- [ ] **Step 4: テストを実行して成功を確認**

Run: `npm run test -- --run src/components/TagPalette.test.tsx`
Expected: PASS（19件）

- [ ] **Step 5: コミット**

```bash
git add src/components/TagPalette.tsx src/components/TagPalette.test.tsx
git commit -m "feat: タグパレットの日本語入力による誤爆を防ぐ"
```

---

### Task 17: ⌘K の割り当てとマウント

**Files:**
- Modify: `src/hooks/useKeyboard.ts:37-90`（`handleMetaKey`）, `:159-209`（`handleDetailKey`）, `:219-241`（`useKeyboard`）
- Modify: `src/components/Palette.tsx:61-65`
- Test: `src/hooks/useKeyboard.test.ts`

- [ ] **Step 1: 失敗するテストを書く**

`src/hooks/useKeyboard.test.ts` に追加する（既存ファイルの `renderHook(() => useKeyboard())` パターンに合わせること）。

```ts
  it("board で ⌘K はタグパレットを開く", () => {
    useAppStore.setState({ ...initialAppState, tasks, statuses, tags, selectedTaskId: "t-a" });
    renderHook(() => useKeyboard());

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true }));

    expect(useAppStore.getState().tagPaletteOpen).toBe(true);
  });

  it("board でカード未選択の ⌘K は何も起きない", () => {
    useAppStore.setState({ ...initialAppState, tasks, statuses, tags, selectedTaskId: null });
    renderHook(() => useKeyboard());

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true }));

    expect(useAppStore.getState().tagPaletteOpen).toBe(false);
  });

  it("BlockNoteが先に処理したキー(defaultPrevented)は横取りしない", () => {
    useAppStore.setState({ ...initialAppState, tasks, statuses, tags, selectedTaskId: "t-a" });
    renderHook(() => useKeyboard());
    const event = new KeyboardEvent("keydown", { key: "k", metaKey: true, cancelable: true });
    event.preventDefault();

    window.dispatchEvent(event);

    expect(useAppStore.getState().tagPaletteOpen).toBe(false);
  });

  it("タグパレット表示中は board のキーを処理しない", () => {
    useAppStore.setState({
      ...initialAppState,
      tasks,
      statuses,
      tags,
      selectedTaskId: "t-a",
      tagPaletteOpen: true,
    });
    renderHook(() => useKeyboard());

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown" }));

    // タグパレット側が処理するので、盤面のカーソルは動かない
    expect(useAppStore.getState().selectedTaskId).toBe("t-a");
  });
```

- [ ] **Step 2: テストを実行して失敗を確認**

Run: `npm run test -- --run src/hooks/useKeyboard.test.ts`
Expected: FAIL（`tagPaletteOpen` が false のまま）

- [ ] **Step 3: 最小の実装を書く**

`src/hooks/useKeyboard.ts` の `handleMetaKey` の `case "b":` の**手前**に足す。

```ts
    case "k":
    case "K":
      // タグパレットを開く。カード未選択なら openTagPalette 側で無反応になる
      s.openTagPalette();
      return true;
```

`handleDetailKey` の `⌘P` の分岐の**手前**に足す。

```ts
  if (event.metaKey && (event.key === "k" || event.key === "K")) {
    event.preventDefault();
    // 保留中の自動保存を確定してからタグパレットを開く
    flushDetail();
    store.openTagPalette();
    return;
  }
```

`useKeyboard` の `onKeyDown` の先頭を書き換える。

```ts
    function onKeyDown(e: KeyboardEvent) {
      // BlockNote が先に処理したキーは横取りしない。
      // 本文にテキスト選択がある状態の ⌘K は @blocknote/react の CreateLinkButton が
      // editorDOMElement 上で preventDefault するため、ここで弾いてリンク作成を優先させる。
      if (e.defaultPrevented) return;

      // IME変換中のキーは一切拾わない
      if (e.isComposing || e.key === "Process") return;

      const state = useAppStore.getState();

      // タグパレット表示中は TagPalette 自身が全キーを処理する（二重発火の防止）
      if (state.tagPaletteOpen) return;

      if (state.view === "board") {
        handleBoardKey(e, state);
        return;
      }
      if (state.view === "detail") {
        handleDetailKey(e);
        return;
      }
      // switcher / settings は各コンポーネント側のハンドラが全キーを処理する
    }
```

`src/components/Palette.tsx` にマウントする。import を足す。

```tsx
import { TagPalette } from "./TagPalette";
```

購読を足す（`selectedTaskId` の下）。

```tsx
  const tagPaletteOpen = useAppStore((s) => s.tagPaletteOpen);
```

`<FooterHints view={view} />` の直前に足す。

```tsx
      {tagPaletteOpen && <TagPalette />}
```

> `TagPalette` のスクリムは `absolute inset-0` なので、`.st-palette` の div に
> `relative` が付いていない場合は付けること（`className="st-palette relative flex h-screen ..."`）。

- [ ] **Step 4: テストを実行して成功を確認**

Run: `npm run test -- --run src/hooks/useKeyboard.test.ts && npm run test -- --run src/components/Palette.test.tsx`
Expected: PASS

- [ ] **Step 5: 全テストとビルド**

Run: `npm run test -- --run && npm run build`
Expected: PASS

- [ ] **Step 6: コミット**

```bash
git add src/hooks/useKeyboard.ts src/hooks/useKeyboard.test.ts src/components/Palette.tsx
git commit -m "feat: ⌘Kでタグパレットを開けるようにする"
```

---

### Task 18: 検索バーの # サジェストとハイライト

**Files:**
- Modify: `src/components/SearchBar.tsx`
- Test: `src/components/SearchBar.test.tsx`（無ければ新規作成）

- [ ] **Step 1: 失敗するテストを書く**

`src/components/SearchBar.test.tsx`。

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { SearchBar } from "@/components/SearchBar";
import { initialAppState, useAppStore } from "@/store/appStore";
import { tags, tasks } from "@/test/fixtures";

describe("SearchBar の # サジェスト", () => {
  beforeEach(() => {
    useAppStore.setState({ ...initialAppState, tasks, tags });
  });

  it("# を打つとタグ候補が出る", async () => {
    const user = userEvent.setup();
    render(<SearchBar />);

    await user.type(screen.getByTestId("search-input"), "#");

    expect(screen.getByTestId("tag-suggest")).toBeInTheDocument();
    expect(screen.getByText("バグ")).toBeInTheDocument();
  });

  it("全角の＃でも候補が出る", async () => {
    const user = userEvent.setup();
    render(<SearchBar />);

    await user.type(screen.getByTestId("search-input"), "＃");

    expect(screen.getByTestId("tag-suggest")).toBeInTheDocument();
  });

  it("前方一致で候補を絞る", async () => {
    const user = userEvent.setup();
    render(<SearchBar />);

    await user.type(screen.getByTestId("search-input"), "#設");

    expect(screen.getByText("設計")).toBeInTheDocument();
    expect(screen.queryByText("バグ")).not.toBeInTheDocument();
  });

  it("# が付いていないときは候補を出さない", async () => {
    const user = userEvent.setup();
    render(<SearchBar />);

    await user.type(screen.getByTestId("search-input"), "ログイン");

    expect(screen.queryByTestId("tag-suggest")).not.toBeInTheDocument();
  });

  it("Tab で候補を補完し、連打で次の候補へ送る", async () => {
    const user = userEvent.setup();
    render(<SearchBar />);
    const input = screen.getByTestId("search-input");
    await user.type(input, "#");

    await user.keyboard("{Tab}");
    expect(useAppStore.getState().searchQuery).toBe("#バグ");

    await user.keyboard("{Tab}");
    expect(useAppStore.getState().searchQuery).toBe("#緊急");
  });

  it("Enter は補完に使わない（board の Enter を壊さないため）", async () => {
    const user = userEvent.setup();
    render(<SearchBar />);
    await user.type(screen.getByTestId("search-input"), "#");

    await user.keyboard("{Enter}");

    expect(useAppStore.getState().searchQuery).toBe("#");
  });
});
```

- [ ] **Step 2: テストを実行して失敗を確認**

Run: `npm run test -- --run src/components/SearchBar.test.tsx`
Expected: FAIL（`tag-suggest` が見つからない）

- [ ] **Step 3: 最小の実装を書く**

`src/components/SearchBar.tsx` を丸ごと書き換える。

```tsx
import { Search } from "lucide-react";
import { useMemo, useRef } from "react";
import { SEARCH_INPUT_ID } from "@/hooks/useKeyboard";
import { useAppStore } from "@/store/appStore";

/** サジェストに出す最大件数 */
const MAX_SUGGESTIONS = 5;

export function SearchBar() {
  const searchQuery = useAppStore((s) => s.searchQuery);
  const setSearchQuery = useAppStore((s) => s.setSearchQuery);
  const tags = useAppStore((s) => s.tags);
  const tasks = useAppStore((s) => s.tasks);

  /**
   * Tab連打で候補を送るための状態。
   * base = ユーザーが実際に打った文字（補完で置き換わる前の値）、cycle = 何番目の候補を出しているか。
   * 補完自体が searchQuery を書き換えるので、打った文字を別に覚えておかないと候補が固定されてしまう。
   */
  const tabBaseRef = useRef<string | null>(null);
  const tabCycleRef = useRef(0);

  // 全角＃は日本語入力ONのShift+3で出る。boardNav.parseSearchQuery と同じく必ず正規化する
  const normalized = searchQuery.replace(/＃/g, "#");
  const lastToken = normalized.split(/\s+/).pop() ?? "";
  const isTagToken = lastToken.startsWith("#");

  const suggestions = useMemo(() => {
    if (!isTagToken) return [];
    const prefix = (tabBaseRef.current ?? lastToken).replace(/^#/, "").toLowerCase();
    const counts = new Map<string, number>();
    for (const task of tasks) {
      for (const id of task.tagIds) counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    return tags
      .filter((t) => t.name.toLowerCase().startsWith(prefix))
      .sort(
        (a, b) => (counts.get(b.id) ?? 0) - (counts.get(a.id) ?? 0) || a.position - b.position,
      )
      .slice(0, MAX_SUGGESTIONS);
  }, [isTagToken, lastToken, tags, tasks]);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    // IMEが処理中のキーには触らない
    if (event.nativeEvent.isComposing || event.keyCode === 229) return;

    if (event.key !== "Tab") {
      // Tab以外が来たら補完のサイクルはリセットする
      tabBaseRef.current = null;
      tabCycleRef.current = 0;
      return;
    }
    if (!isTagToken || suggestions.length === 0) return;

    // 補完は Tab だけで行う。Enter は board の「詳細を開く / 新規作成」なので絶対に奪わない
    event.preventDefault();
    if (tabBaseRef.current === null) {
      tabBaseRef.current = lastToken;
      tabCycleRef.current = 0;
    }
    const picked = suggestions[tabCycleRef.current % suggestions.length];
    tabCycleRef.current += 1;

    const head = normalized.slice(0, normalized.length - lastToken.length);
    setSearchQuery(`${head}#${picked.name}`);
  };

  return (
    <div
      className="relative flex h-14 shrink-0 items-center gap-2.5 border-b px-4"
      style={{ borderColor: "var(--st-palette-border)" }}
    >
      <Search size={18} className="shrink-0" style={{ color: "var(--st-text-tertiary)" }} />
      <input
        id={SEARCH_INPUT_ID}
        data-testid="search-input"
        type="text"
        // パレットを開いた瞬間から打ち始められるようにする
        autoFocus
        autoComplete="off"
        spellCheck={false}
        placeholder="タスクを検索、または入力して新規作成"
        value={searchQuery}
        onChange={(e) => {
          // 打ち直したら補完のサイクルもリセットする
          tabBaseRef.current = null;
          tabCycleRef.current = 0;
          setSearchQuery(e.target.value);
        }}
        onKeyDown={handleKeyDown}
        className="st-search-input w-full bg-transparent text-[17px] outline-none"
        style={{ color: "var(--st-text-primary)" }}
      />

      {isTagToken && suggestions.length > 0 && (
        <div
          data-testid="tag-suggest"
          className="absolute left-11 top-[52px] z-20 w-56 overflow-hidden rounded-lg py-1 shadow-lg"
          style={{
            backgroundColor: "var(--st-palette-bg)",
            border: "0.5px solid var(--st-palette-border)",
          }}
        >
          {suggestions.map((tag) => (
            <div
              key={tag.id}
              className="flex items-center gap-2 px-2.5 py-1 text-[12px]"
              style={{ color: "var(--st-text-primary)" }}
            >
              <span
                className="h-1.5 w-1.5 shrink-0 rounded-full"
                style={{ backgroundColor: tag.color }}
              />
              <span className="min-w-0 flex-1 truncate">{tag.name}</span>
              <span className="shrink-0 text-[10px]" style={{ color: "var(--st-text-tertiary)" }}>
                Tab
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

> **絞り込み中のハイライト（`#バグ` を青文字＋下線）について**: 設計書では検索バー内の
> `#タグ名` の部分だけを着色すると決めていたが、`<input>` のテキストの一部だけを着色するには
> 入力欄の背後に同じフォント・同じパディングのミラー要素を重ねる必要があり、
> 日本語入力＋横スクロールで破綻しやすい。**費用対効果が合わないため、この計画では実装しない**
> （設計書側にもこの決定を記録済み）。絞り込みが効いていることは、サジェスト各行の色スウォッチと
> レーンヘッダーの件数の変化で伝える。必要になったら別タスクとして切り出すこと。

- [ ] **Step 4: テストを実行して成功を確認**

Run: `npm run test -- --run src/components/SearchBar.test.tsx`
Expected: PASS（6件）

- [ ] **Step 5: コミット**

```bash
git add src/components/SearchBar.tsx src/components/SearchBar.test.tsx
git commit -m "feat: 検索バーに#タグのサジェストを追加"
```

---

### Task 19: フッターのキーボードヒント

**Files:**
- Modify: `src/components/FooterHints.tsx:10-29`
- Test: `src/components/FooterHints.test.tsx`

- [ ] **Step 1: 失敗するテストを書く**

```tsx
  it("board のヒントに ⌘K タグ が入る", () => {
    render(<FooterHints view="board" />);

    expect(screen.getByText("⌘K")).toBeInTheDocument();
    expect(screen.getByText("タグ")).toBeInTheDocument();
  });

  it("detail のヒントにも ⌘K タグ が入る", () => {
    render(<FooterHints view="detail" />);

    expect(screen.getByText("⌘K")).toBeInTheDocument();
    expect(screen.getByText("タグ")).toBeInTheDocument();
  });
```

- [ ] **Step 2: テストを実行して失敗を確認**

Run: `npm run test -- --run src/components/FooterHints.test.tsx`
Expected: FAIL（`Unable to find an element with the text: ⌘K`）

- [ ] **Step 3: 最小の実装を書く**

`src/components/FooterHints.tsx` の `HINTS` を書き換える。

```ts
  board: [
    ["↑↓←→", "移動"],
    ["Enter", "開く / 作成"],
    ["⌘←→", "ステータス"],
    ["⌘↑↓", "並び替え"],
    ["⌘⌫", "削除"],
    ["⌘Z", "元に戻す"],
    ["⌘N", "新規作成"],
    ["⌘P", "検索"],
    ["⌘K", "タグ"],
    ["⌘B", "ボード切替"],
    ["⌘,", "設定"],
    ["Esc", "閉じる"],
  ],
  detail: [
    ["⌘←→", "ステータス"],
    ["⌘T", "タイトル"],
    ["⌘K", "タグ"],
    ["⌘N", "新規作成"],
    ["⌘P", "検索"],
    ["Esc", "ボードに戻る"],
  ],
```

- [ ] **Step 4: テストを実行して成功を確認**

Run: `npm run test -- --run src/components/FooterHints.test.tsx`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add src/components/FooterHints.tsx src/components/FooterHints.test.tsx
git commit -m "feat: フッターのヒントに⌘Kタグを追加"
```

---

### Task 20: 全体確認とドキュメント更新

**Files:**
- Modify: `docs/superpowers/specs/2026-08-20-implementation-contract.md`

- [ ] **Step 1: 全テストを実行**

Run: `cd src-tauri && cargo test`
Expected: PASS（全件）

Run: `npm run test -- --run`
Expected: PASS（全件）

Run: `npm run build`
Expected: 成功（型エラー・未使用importなし）

- [ ] **Step 2: 実装コントラクトにタグ機能を追記**

`docs/superpowers/specs/2026-08-20-implementation-contract.md` の「Tauriコマンド API」の表の
`task_restore` の行の下に5行足す。

```markdown
| `tags_list` | `board_id` | `Vec<Tag>` | position昇順 |
| `tag_create` | `board_id, name` | `Tag` | 色は自動決定・末尾position。同名(大文字小文字無視)はErr |
| `tag_rename` | `id, name` | `Tag` | 同名衝突はErr |
| `tag_delete` | `id` | `()` | task_tagsはCASCADE |
| `task_tag_toggle` | `task_id, tag_id` | `Vec<String>` | トグル後のtagIdsを返す |
```

同ファイルの「キーマップ」セクションの board 行に `⌘Kタグパレット /` を、detail 行に
`⌘Kタグパレット /` を足す。

同ファイルの「TypeScript 型」の `Task` に `tagIds: string[];` を足し、`Tag` インターフェースを
追加する。「zustandストア」の `AppState` に `tags` / `tagPaletteOpen` と6つのアクションを足す。

詳細は `docs/superpowers/specs/2026-08-21-tag-feature-design.md` を参照し、
**設計書の記述をそのまま転記**すること（両者が食い違ってはいけない）。

- [ ] **Step 3: 手動スモークチェック**

`npm run tauri dev` で実アプリを起動し、設計書「手動スモークチェック」の5項目を確認する。

1. 日本語入力ONで「ばぐ」と打ち、変換確定の `Enter` でタグが誤って付かない／作られないこと
2. 日本語入力ONで `Shift+3` が `＃` になる環境でも検索の絞り込みが効くこと
3. 詳細画面で本文を選択した状態の `⌘K` がリンク作成になり、選択なしならタグパレットが開くこと
4. タグの多いカードで `+n` が正しく折り返し、カードの高さが揺れないこと
5. ライト／ダーク両方でチップが読めること（未選択・選択中の両方）

問題があれば該当タスクへ戻って直すこと。

- [ ] **Step 4: コミット**

```bash
git add docs/superpowers/specs/2026-08-20-implementation-contract.md
git commit -m "docs: 実装コントラクトにタグ機能を追記"
```
