# タスク本文への画像貼り付け 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** タスク詳細の本文に、クリップボードの画像を ⌘V でそのまま貼り付けられるようにする（[Issue #4](https://github.com/Keisuke-MARs/Avoliq/issues/4)）。

**Architecture:** 画像は `avoliq.db` の新テーブル `images` に BLOB として持ち、本文には `![alt](avoliq-img://<id>)` と書く。Rust 側で `avoliq-img` スキームを登録して DB から直接 Webview へ配信するため、**エディタが保持する URL と Markdown に保存する URL が同一文字列**になり、往復での書き換えが一切要らない。データディレクトリにファイルを作らないので「バックアップは `avoliq.db` を1つコピーするだけ」という約束も保たれる。

**Tech Stack:** Rust / Tauri 2 / rusqlite（bundled SQLite）/ base64 crate / React 19 / BlockNote 0.54 / Vitest

**設計書:** `docs/superpowers/specs/2026-08-25-task-image-paste-design.md`

---

## 事前に知っておくこと

このリポジトリの流儀。**守らないと既存コードから浮く。**

- **コメントは日本語**。「なぜそうしたか」を書く。「何をしているか」だけのコメントは書かない
- **Rust のテスト関数名は日本語**（例: `fn ボードを作ると一覧に出る()`）。`expect()` のメッセージも日本語
- **リポジトリ層（`repo.rs`）だけが SQL を書く**。コマンド層は薄い委譲に徹する
- **フロントの API ラッパは `src/lib/api.ts` に集約**。`invoke` を直接呼ぶのはこのファイルだけ
- コミットメッセージは `<type>: <日本語の説明>`。**AI/エージェントの署名は付けない**

### 重い操作についての注意

このワークツリーでは **`cargo` のビルドがまだ1度も走っていない**。
最初の `cargo test` は Tauri の依存ツリー全体をコンパイルするため、
**数分〜十数分かかり CPU を強く使う**。実行する前にユーザーへ一声かけること。

フロントのテスト（`npx vitest run`）は数秒で終わるので断りは要らない。

---

## ファイル構成

| ファイル | 役割 | 変更 |
|---|---|---|
| `src-tauri/src/db/migrations.rs` | `images` テーブルの DDL（v3） | 修正 |
| `src-tauri/src/db/repo.rs` | `image_create` / `image_read` の SQL | 修正 |
| `src-tauri/src/commands.rs` | base64 デコードと検証、`image_create` コマンド | 修正 |
| `src-tauri/src/lib.rs` | `avoliq-img` スキームの登録、コマンド登録 | 修正 |
| `src-tauri/Cargo.toml` | `base64` 依存の追加 | 修正 |
| `src-tauri/tauri.conf.json` | CSP の `img-src`、`dragDropEnabled` | 修正 |
| `src/lib/api.ts` | `imageCreate` ラッパ | 修正 |
| `src/lib/taskImage.ts` | 検証・base64 化・URL 生成 | **新規** |
| `src/lib/taskImage.test.ts` | 上記のテスト | **新規** |
| `src/lib/markdownRoundtrip.test.ts` | 画像 Markdown の往復テスト | 修正 |
| `src/components/TaskDetail.tsx` | `uploadFile` の配線、URL 埋め込みタブの除去 | 修正 |
| `src/components/TaskDetail.test.tsx` | BlockNote モックの拡張 | 修正 |

`src-tauri/capabilities/default.json` は **変更しない**（独自スキームは permission の対象外）。
`README.md` と `landing/` も **変更しない**（バックアップの約束が保たれるため）。

---

## Task 1: migration v3 で `images` テーブルを足す

**Files:**
- Modify: `src-tauri/src/db/migrations.rs`

既存テストが「スキーマバージョンは2」を前提にしているため、v3 を足すと**必ず2件落ちる**。
これは想定どおりなので、同じタスクの中で更新する。

- [ ] **Step 1: 失敗するテストを書く**

`src-tauri/src/db/migrations.rs` の `mod tests` の末尾（`同じボードに同名のタグは入れられない` の後）に追加する。

```rust
    #[test]
    fn v3で画像のテーブルが作られる() {
        let conn = db::open_in_memory().expect("インメモリDBを開けること");

        assert!(table_exists(&conn, "images"));
    }

    #[test]
    fn タスクを物理削除すると画像も一緒に消える() {
        let conn = db::open_in_memory().expect("インメモリDBを開けること");
        conn.execute(
            "INSERT INTO boards (id, name, position) VALUES ('b1', 'メイン', 0)",
            [],
        )
        .expect("ボードを作れること");
        conn.execute(
            "INSERT INTO statuses (id, board_id, name, color, position) VALUES ('s1', 'b1', '未着手', '#8E8E93', 0)",
            [],
        )
        .expect("ステータスを作れること");
        conn.execute(
            "INSERT INTO tasks (id, board_id, status_id, title, position) VALUES ('t1', 'b1', 's1', 'タスク', 0)",
            [],
        )
        .expect("タスクを作れること");
        conn.execute(
            "INSERT INTO images (id, task_id, mime, bytes) VALUES ('i1', 't1', 'image/png', X'89504E47')",
            [],
        )
        .expect("画像を作れること");

        conn.execute("DELETE FROM tasks WHERE id = 't1'", [])
            .expect("タスクを物理削除できること");

        let remaining: i64 = conn
            .query_row("SELECT COUNT(*) FROM images", [], |row| row.get(0))
            .expect("件数を数えられること");
        assert_eq!(remaining, 0, "ボード削除時に画像が取り残されてはいけない");
    }
```

- [ ] **Step 2: テストが落ちることを確かめる**

Run: `cd src-tauri && cargo test v3で画像のテーブルが作られる`
Expected: FAIL（`images` テーブルが無い）

※ このワークツリー初回のビルドは数分〜十数分かかる。実行前にユーザーへ確認すること。

- [ ] **Step 3: V3 を足す**

`src-tauri/src/db/migrations.rs` の `V2` 定数の直後に追加する。

```rust
/// マイグレーション v3: 画像（images）
///
/// 画像をデータディレクトリのファイルではなくDBのBLOBで持つのは、
/// 「バックアップは avoliq.db を1つコピーするだけ」という約束を崩さないため。
/// task_id への ON DELETE CASCADE により、ボード削除（tasksの物理削除）で
/// 画像が取り残されることがない。
const V3: &str = r#"
CREATE TABLE images (
  id         TEXT PRIMARY KEY,
  task_id    TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  mime       TEXT NOT NULL,
  bytes      BLOB NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_images_task ON images(task_id);
"#;
```

同ファイルの `MIGRATIONS` を差し替える。

```rust
/// (バージョン, SQL) の一覧。将来のマイグレーションは末尾に足すだけでよい。
pub const MIGRATIONS: &[(i64, &str)] = &[(1, V1), (2, V2), (3, V3)];
```

- [ ] **Step 4: バージョンを前提にした既存テストを更新する**

`mod tests` 内の2つを書き換える。

```rust
    #[test]
    fn migrateを二度呼んでもエラーにならない() {
        let mut conn = db::open_in_memory().expect("インメモリDBを開けること");

        super::migrate(&mut conn).expect("2回目のmigrateも成功すること");

        let applied: i64 = conn
            .query_row("SELECT COUNT(*) FROM schema_migrations", [], |row| row.get(0))
            .expect("件数を数えられること");
        assert_eq!(applied, 3, "同じバージョンが二重に記録されてはいけない");
    }
```

```rust
    #[test]
    fn 適用後のスキーマバージョンは3になる() {
        let conn = db::open_in_memory().expect("インメモリDBを開けること");

        let version = super::current_version(&conn).expect("バージョンを取得できること");

        assert_eq!(version, 3);
    }
```

（元の `適用後のスキーマバージョンは2になる` は関数名ごと置き換える）

- [ ] **Step 5: テストが通ることを確かめる**

Run: `cd src-tauri && cargo test --lib db::migrations`
Expected: PASS（`v3で画像のテーブルが作られる` と `タスクを物理削除すると画像も一緒に消える` を含めて全件）

- [ ] **Step 6: コミット**

```bash
git add src-tauri/src/db/migrations.rs
git commit -m "feat: 画像を保存するimagesテーブルをmigration v3で追加"
```

---

## Task 2: リポジトリ層に `image_create` / `image_read` を足す

**Files:**
- Modify: `src-tauri/src/db/repo.rs`

- [ ] **Step 1: 失敗するテストを書く**

`src-tauri/src/db/repo.rs` の `mod tests` の末尾に追加する。
ヘルパは既存テストの流儀（`board_create` → `statuses_list` → `task_create`）に合わせる。

```rust
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
```

- [ ] **Step 2: テストが落ちることを確かめる**

Run: `cd src-tauri && cargo test --lib db::repo::tests::保存した画像をidで引き戻せる`
Expected: FAIL（`image_create` が未定義でコンパイルエラー）

- [ ] **Step 3: 最小の実装を書く**

`src-tauri/src/db/repo.rs` の `task_restore` 関数の直後に追加する。

```rust
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
```

- [ ] **Step 4: テストが通ることを確かめる**

Run: `cd src-tauri && cargo test --lib db::repo`
Expected: PASS（既存のテストも含めて全件）

- [ ] **Step 5: コミット**

```bash
git add src-tauri/src/db/repo.rs
git commit -m "feat: 画像の保存と読み出しをリポジトリ層に追加"
```

---

## Task 3: コマンド層に `image_create` を足す（検証と base64 デコード）

**Files:**
- Modify: `src-tauri/Cargo.toml`
- Modify: `src-tauri/src/commands.rs`
- Modify: `src-tauri/src/lib.rs`

バイト列を `Vec<u8>` のまま IPC に流すと Tauri が JSON の数値配列に展開し、
3MB の画像が 12MB 超の JSON になる。base64 なら約 1.33 倍で済むため base64 で受ける。

- [ ] **Step 1: `base64` 依存を足す**

`src-tauri/Cargo.toml` の `[dependencies]` に追加する（`uuid` の行の下）。

```toml
# 画像をIPCで受け渡すときのデコード用。
# Vec<u8> をそのまま渡すとTauriがJSONの数値配列に展開して数倍に膨らむため
base64 = "0.22"
```

- [ ] **Step 2: 失敗するテストを書く**

`src-tauri/src/commands.rs` の**末尾**に新しいテストモジュールを追加する。

```rust
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
```

- [ ] **Step 3: テストが落ちることを確かめる**

Run: `cd src-tauri && cargo test --lib commands`
Expected: FAIL（`decode_image` が未定義でコンパイルエラー）

- [ ] **Step 4: 最小の実装を書く**

`src-tauri/src/commands.rs` の先頭の `use` に足す。

```rust
use base64::prelude::{Engine as _, BASE64_STANDARD};
```

`LOCK_ERROR` 定数の直後に追加する。

```rust
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
```

`palette_hide` の直前（`setting_set` の後）にコマンドを追加する。

```rust
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
```

`src-tauri/src/lib.rs` の `invoke_handler` に1行足す（`commands::task_tag_toggle` の下）。

```rust
            commands::image_create,
```

- [ ] **Step 5: テストが通ることを確かめる**

Run: `cd src-tauri && cargo test --lib commands`
Expected: PASS（7件）

- [ ] **Step 6: コミット**

```bash
git add src-tauri/Cargo.toml src-tauri/Cargo.lock src-tauri/src/commands.rs src-tauri/src/lib.rs
git commit -m "feat: 画像を保存するコマンドと入力検証を追加"
```

---

## Task 4: `avoliq-img` スキームを登録して画像を配信する

**Files:**
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: 失敗するテストを書く**

`src-tauri/src/lib.rs` の `mod tests` に追加する（`database_path_is_scoped_to_avoliq` の後）。

```rust
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
```

- [ ] **Step 2: テストが落ちることを確かめる**

Run: `cd src-tauri && cargo test --lib tests::ホスト部から画像idを取り出す`
Expected: FAIL（`image_id_from_uri` が未定義でコンパイルエラー）

- [ ] **Step 3: id 取り出しとハンドラを書く**

`src-tauri/src/lib.rs` の `avoliq_database_path` 関数の直後に追加する。

```rust
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
```

- [ ] **Step 4: ビルダーにスキームを登録する**

`src-tauri/src/lib.rs` の `.invoke_handler(...)` の**直後**（`.setup(...)` の前）に挿す。

```rust
        // 本文の画像をDBから直接Webviewへ返す。
        // 同期版ではなく非同期版を使うのは、DBのロック待ちでWebviewの描画を止めないため
        .register_asynchronous_uri_scheme_protocol(IMAGE_URL_SCHEME, |ctx, request, responder| {
            let app = ctx.app_handle().clone();
            std::thread::spawn(move || {
                responder.respond(serve_image(&app, request.uri()));
            });
        })
```

- [ ] **Step 5: テストが通ることを確かめる**

Run: `cd src-tauri && cargo test --lib`
Expected: PASS（`lib.rs` / `commands.rs` / `db` の全テスト）

- [ ] **Step 6: コミット**

```bash
git add src-tauri/src/lib.rs
git commit -m "feat: 本文の画像をDBから配信する独自スキームを追加"
```

---

## Task 5: Tauri の設定を更新する（CSP と drag-drop）

**Files:**
- Modify: `src-tauri/tauri.conf.json`

`capabilities/default.json` は**変更しない**。あれは Tauri 組み込みの `asset://` 用で、
自前登録した独自スキームは permission の対象外のため。

- [ ] **Step 1: CSP の `img-src` にスキームを足す**

`src-tauri/tauri.conf.json` の `app.security.csp` を差し替える。
`img-src` に `avoliq-img:` を足すだけで、他のディレクティブは変えない。

```json
      "csp": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: avoliq-img:; font-src 'self' data:; connect-src ipc: http://ipc.localhost ws://localhost:1420"
```

- [ ] **Step 2: Webview に drag-drop を通す**

`app.windows[0]` に1行足す（`"skipTaskbar": true,` の下）。

```json
        "skipTaskbar": true,
        "dragDropEnabled": false,
```

Tauri の既定は `true` で、その場合ネイティブ側が drag-drop を横取りして
Webview の HTML5 drag-drop イベントが発火しない。Finder からの D&D を効かせるには `false` にする。

- [ ] **Step 3: JSON が壊れていないことを確かめる**

Run: `node -e "const c=require('./src-tauri/tauri.conf.json'); console.log(c.app.security.csp.includes('avoliq-img:'), c.app.windows[0].dragDropEnabled)"`
Expected: `true false`

- [ ] **Step 4: コミット**

```bash
git add src-tauri/tauri.conf.json
git commit -m "feat: 画像スキームをCSPに許可しWebviewにドラッグ&ドロップを通す"
```

---

## Task 6: Markdown 往復のテストを足す

**Files:**
- Modify: `src/lib/markdownRoundtrip.test.ts`

イシューの「2. Markdown 往復での壊れにくさ」を担保するテスト。
実装コードは要らない（`avoliq-img://` は BlockNote から見れば普通の URL のため）。
**このテストは書いた時点で通る**ので、ここでは「壊れていないこと」を固定するのが目的。

- [ ] **Step 1: テストを書く**

`src/lib/markdownRoundtrip.test.ts` の `describe` の末尾（最後の `it` の後）に追加する。

```ts
  it("画像のカスタムスキームURLは往復しても変わらない", async () => {
    const editor = BlockNoteEditor.create();
    const md = "![shot.png](avoliq-img://0f9ce1a2-1111-2222-3333-444455556666)";

    const blocks = await editor.tryParseMarkdownToBlocks(md);

    expect(blocks).toHaveLength(1);
    expect(blocks[0].type).toBe("image");

    editor.replaceBlocks(editor.document, blocks);
    const back = await editor.blocksToMarkdownLossy(editor.document);

    // URLが1文字でも書き換わると、保存済みの本文から画像が引けなくなる
    expect(back.trim()).toBe(md);
  });

  it("キャプション付きの画像はfigureで書き出され、読み戻してもcaptionが残る", async () => {
    const editor = BlockNoteEditor.create();
    // BlockNoteはcaptionが付くとMarkdownではなく生のHTMLで書き出す。
    // その形でも読み戻せることを確かめる（往復の片道だけ通っても意味がない）
    const withCaption = [
      {
        type: "image",
        props: { url: "avoliq-img://abc-123", name: "shot.png", caption: "図1" },
      },
    ];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    editor.replaceBlocks(editor.document, withCaption as any);

    const saved = await editor.blocksToMarkdownLossy(editor.document);
    expect(saved).toContain('src="avoliq-img://abc-123"');

    const reloaded = await editor.tryParseMarkdownToBlocks(
      reflowStrayMarkdownTables(saved),
    );

    expect(reloaded).toHaveLength(1);
    expect(reloaded[0].type).toBe("image");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const props = reloaded[0].props as any;
    expect(props.url).toBe("avoliq-img://abc-123");
    expect(props.caption).toBe("図1");
  });

  it("reflowStrayMarkdownTablesは画像の行を変えない", () => {
    // 読込前に必ず通す関数なので、画像の行を触らないことを固定しておく
    const md = "本文\n\n![shot.png](avoliq-img://abc-123)\n\n続き\n";

    expect(reflowStrayMarkdownTables(md)).toBe(md);
  });

  it("画像はテーブルや見出しと混在しても順序と型が保たれる", async () => {
    const editor = BlockNoteEditor.create();
    const md = [
      "# 見出し",
      "",
      "![shot.png](avoliq-img://abc-123)",
      "",
      "| a | b |",
      "| --- | --- |",
      "| 1 | 2 |",
      "",
      "本文",
      "",
    ].join("\n");

    const blocks = await editor.tryParseMarkdownToBlocks(md);

    expect(blocks.map((block) => block.type)).toEqual([
      "heading",
      "image",
      "table",
      "paragraph",
    ]);

    editor.replaceBlocks(editor.document, blocks);
    const back = await editor.blocksToMarkdownLossy(editor.document);

    expect(back).toContain("![shot.png](avoliq-img://abc-123)");
  });
```

- [ ] **Step 2: テストが通ることを確かめる**

Run: `npx vitest run src/lib/markdownRoundtrip.test.ts`
Expected: PASS（既存3件 + 新規4件 = 7件）

- [ ] **Step 3: コミット**

```bash
git add src/lib/markdownRoundtrip.test.ts
git commit -m "test: 画像を含むMarkdownの往復変換を担保するテストを追加"
```

---

## Task 7: `src/lib/api.ts` に `imageCreate` を足す

**Files:**
- Modify: `src/lib/api.ts`
- Test: `src/lib/api.test.ts`

- [ ] **Step 1: 失敗するテストを書く**

`src/lib/api.test.ts` の「設定」に関するテストの直前（タグのテスト群の後）に追加する。

```ts
  it("image_create は taskId / mime / dataBase64 を camelCase で渡す", async () => {
    await api.imageCreate("task-1", "image/png", "iVBORw0KGgo=");
    expect(invokeMock).toHaveBeenCalledWith("image_create", {
      taskId: "task-1",
      mime: "image/png",
      dataBase64: "iVBORw0KGgo=",
    });
  });
```

- [ ] **Step 2: テストが落ちることを確かめる**

Run: `npx vitest run src/lib/api.test.ts`
Expected: FAIL（`api.imageCreate is not a function`）

- [ ] **Step 3: ラッパを書く**

`src/lib/api.ts` の「---- 設定 ----」セクションの**直前**に追加する。

```ts
// ---- 画像 ----

/**
 * タスク本文に貼り付けた画像を1枚保存し、本文から参照するためのidを返す。
 * バイト列をそのまま渡すとIPCがJSONの数値配列に展開して数倍に膨らむため、base64で渡す。
 */
export function imageCreate(
  taskId: string,
  mime: string,
  dataBase64: string,
): Promise<string> {
  return invoke<string>("image_create", { taskId, mime, dataBase64 });
}
```

- [ ] **Step 4: テストが通ることを確かめる**

Run: `npx vitest run src/lib/api.test.ts`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add src/lib/api.ts src/lib/api.test.ts
git commit -m "feat: 画像保存コマンドのAPIラッパを追加"
```

---

## Task 8: `src/lib/taskImage.ts` を作る

**Files:**
- Create: `src/lib/taskImage.ts`
- Create: `src/lib/taskImage.test.ts`

`TaskDetail.tsx` は既に250行あり、これ以上太らせない。
アップロードの中身を独立させて単体でテストできるようにする。

- [ ] **Step 1: 失敗するテストを書く**

`src/lib/taskImage.test.ts` を新規作成する。

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "./api";
import { createImageUploader, MAX_IMAGE_BYTES } from "./taskImage";

vi.mock("./api", () => ({ imageCreate: vi.fn() }));

const imageCreateMock = vi.mocked(api.imageCreate);

/** 指定の形式・サイズのFileを作る。中身は問わないので0埋めでよい。 */
function makeFile(type: string, size: number): File {
  return new File([new Uint8Array(size)], "shot.png", { type });
}

describe("createImageUploader", () => {
  beforeEach(() => {
    imageCreateMock.mockResolvedValue("img-1");
  });

  it("保存したidをavoliq-imgのURLにして返す", async () => {
    const upload = createImageUploader(() => "task-1");

    await expect(upload(makeFile("image/png", 4))).resolves.toBe(
      "avoliq-img://img-1",
    );
  });

  it("taskIdとMIMEとbase64をAPIへ渡す", async () => {
    const upload = createImageUploader(() => "task-1");

    // 0が3バイト = base64で "AAAA"
    await upload(makeFile("image/png", 3));

    expect(imageCreateMock).toHaveBeenCalledWith("task-1", "image/png", "AAAA");
  });

  it("対応していない形式は投げる", async () => {
    const upload = createImageUploader(() => "task-1");

    await expect(upload(makeFile("image/svg+xml", 4))).rejects.toThrow(
      "この形式の画像は貼り付けられません",
    );
    expect(imageCreateMock).not.toHaveBeenCalled();
  });

  it("上限を超えるサイズは投げる", async () => {
    const upload = createImageUploader(() => "task-1");

    await expect(
      upload(makeFile("image/png", MAX_IMAGE_BYTES + 1)),
    ).rejects.toThrow("画像が大きすぎます（10MBまで）");
    expect(imageCreateMock).not.toHaveBeenCalled();
  });

  it("タスクが選ばれていなければ投げる", async () => {
    const upload = createImageUploader(() => null);

    await expect(upload(makeFile("image/png", 4))).rejects.toThrow(
      "タスクが選択されていません",
    );
    expect(imageCreateMock).not.toHaveBeenCalled();
  });

  it("生成時ではなく呼ばれた時点のタスクidを使う", async () => {
    // エディタはマウント中1度しか作られないので、値を焼き付けていないことを確かめる
    let current = "task-1";
    const upload = createImageUploader(() => current);
    current = "task-2";

    await upload(makeFile("image/png", 3));

    expect(imageCreateMock).toHaveBeenCalledWith("task-2", "image/png", "AAAA");
  });
});
```

- [ ] **Step 2: テストが落ちることを確かめる**

Run: `npx vitest run src/lib/taskImage.test.ts`
Expected: FAIL（`Failed to resolve import "./taskImage"`）

- [ ] **Step 3: 実装を書く**

`src/lib/taskImage.ts` を新規作成する。

```ts
import * as api from "./api";

/** 本文から画像を参照するURLスキーム。Rust側の IMAGE_URL_SCHEME と一致させる。 */
const IMAGE_URL_SCHEME = "avoliq-img";

/** 受け付ける画像の形式。Rust側の ALLOWED_IMAGE_MIME と一致させる。 */
export const ALLOWED_IMAGE_MIME: readonly string[] = [
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
];

/** 画像1枚の上限(10MB)。Rust側の MAX_IMAGE_BYTES と一致させる。 */
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

/**
 * FileReaderでdata URI化し、base64の本体部分だけを取り出す。
 * "data:image/png;base64,XXXX" の XXXX だけがRust側に要る。
 */
function readAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("画像を読み取れませんでした"));
    reader.onload = () => {
      const result = reader.result;
      const comma = typeof result === "string" ? result.indexOf(",") : -1;
      if (typeof result !== "string" || comma < 0) {
        reject(new Error("画像を読み取れませんでした"));
        return;
      }
      resolve(result.slice(comma + 1));
    };
    reader.readAsDataURL(file);
  });
}

/**
 * BlockNoteの uploadFile に渡す関数を作る。
 * 検証に落ちたらErrorを投げる(BlockNote側がアップロード失敗として扱う)。
 * 戻り値の avoliq-img://<id> が、そのまま本文のMarkdownに保存される。
 *
 * タスクidを関数で受けるのは、エディタがマウント中に1度しか作られないため。
 * 生成時の値をクロージャに焼き付けず、呼ばれた時点の値を読む。
 */
export function createImageUploader(
  getTaskId: () => string | null,
): (file: File) => Promise<string> {
  return async (file: File) => {
    // 同じ検査をRust側でも行う。あちらが正で、ここは無駄なIPCを省くための前段
    if (!ALLOWED_IMAGE_MIME.includes(file.type)) {
      throw new Error("この形式の画像は貼り付けられません");
    }
    if (file.size > MAX_IMAGE_BYTES) {
      throw new Error("画像が大きすぎます（10MBまで）");
    }

    const taskId = getTaskId();
    if (taskId === null) {
      throw new Error("タスクが選択されていません");
    }

    const dataBase64 = await readAsBase64(file);
    const id = await api.imageCreate(taskId, file.type, dataBase64);
    return `${IMAGE_URL_SCHEME}://${id}`;
  };
}
```

- [ ] **Step 4: テストが通ることを確かめる**

Run: `npx vitest run src/lib/taskImage.test.ts`
Expected: PASS（6件）

- [ ] **Step 5: コミット**

```bash
git add src/lib/taskImage.ts src/lib/taskImage.test.ts
git commit -m "feat: 貼り付け画像の検証とbase64変換を行うモジュールを追加"
```

---

## Task 9: `TaskDetail.tsx` に配線し、URL埋め込みタブを外す

**Files:**
- Modify: `src/components/TaskDetail.tsx`
- Modify: `src/components/TaskDetail.test.tsx`

`TaskDetail.test.tsx` は `vi.mock("@blocknote/react", () => ({...}))` の**ファクトリ形式**で
モジュール全体を置き換えている。新しく import する名前をモックに足さないと
`No "FilePanelController" export is defined on the mock` で既存テストが落ちる。

- [ ] **Step 1: BlockNote のモックを拡張する**

`src/components/TaskDetail.test.tsx` の `vi.mock("@blocknote/react", ...)` を差し替える。

```tsx
vi.mock("@blocknote/react", () => ({
  useCreateBlockNote: () => ({
    document: [],
    tryParseMarkdownToBlocks: (md: string) => [
      { id: "b1", type: "paragraph", content: md },
    ],
    blocksToMarkdownLossy: () => "本文",
    replaceBlocks: () => undefined,
    focus: editorFocus,
  }),
  // 画像パネル一式。描画までは見ないのでnullを返す最小のスタブでよい
  FilePanel: () => null,
  FilePanelController: () => null,
  UploadTab: () => null,
  useDictionary: () => ({ file_panel: { upload: { title: "アップロード" } } }),
}));
```

- [ ] **Step 2: モック拡張だけで既存テストが通ることを確かめる**

Run: `npx vitest run src/components/TaskDetail.test.tsx`
Expected: PASS（変更前と同じ件数。ここはまだ実装を変えていないので緑のまま）

- [ ] **Step 3: `TaskDetail.tsx` の import を差し替える**

`src/components/TaskDetail.tsx` の先頭部分を書き換える。

```tsx
import { ja } from "@blocknote/core/locales";
import {
  FilePanel,
  FilePanelController,
  UploadTab,
  useCreateBlockNote,
  useDictionary,
} from "@blocknote/react";
import type { FilePanelProps } from "@blocknote/react";
import { BlockNoteView } from "@blocknote/shadcn";
import { ArrowLeft, ChevronLeft, ChevronRight } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { toast } from "sonner";
import { useDebouncedSave } from "../hooks/useDebouncedSave";
import { registerDetailBridge } from "../lib/detailBridge";
import { reflowStrayMarkdownTables } from "../lib/markdownTableFix";
import { tagChipStyle } from "../lib/tagPalette";
import { createImageUploader } from "../lib/taskImage";
import { useAppStore } from "../store/appStore";
import type { Tag } from "../types";
```

- [ ] **Step 4: URL埋め込みタブを持たないファイルパネルを定義する**

`interface TaskDetailProps` の**直前**に追加する。

```tsx
/**
 * 外部URLの埋め込みタブを持たないファイルパネル。
 *
 * Avoliqは外部通信を行わず、CSPのimg-srcもhttpsを許していないため、
 * 埋め込みタブでURLを貼れても画像は表示されない。
 * 「貼れるのに映らない」タブをUIに残さないよう、アップロードタブだけを出す。
 *
 * 読み込み中のスピナーはFilePanelの内部stateで制御されており外から渡せないため、
 * setLoadingは何もしない関数にしている。ローカルのDB書き込みは一瞬で終わるので実害はない。
 */
function UploadOnlyFilePanel(props: FilePanelProps) {
  const dictionary = useDictionary();

  return (
    <FilePanel
      {...props}
      tabs={[
        {
          name: dictionary.file_panel.upload.title,
          tabPanel: (
            <UploadTab blockId={props.blockId} setLoading={() => undefined} />
          ),
        },
      ]}
    />
  );
}
```

- [ ] **Step 5: `uploadFile` を配線する**

`src/components/TaskDetail.tsx` の
`const editor = useCreateBlockNote({ dictionary: ja });` の行を、
以下の3ブロックに差し替える（`const [title, setTitle] = ...` より後、`loadingRef` の前に置く）。

```tsx
  /**
   * 画像を貼り付けたときの保存先タスク。
   * エディタはマウント中に1度しか作られないので、生成時の値を焼き付けずrefから読む。
   */
  const taskIdRef = useRef<string | null>(null);
  taskIdRef.current = task?.id ?? null;

  /**
   * 画像の貼り付け処理。エディタ生成時に1度だけ渡るのでuseMemoで固定する。
   * 失敗時のBlockNote側の表示は小さいので、トーストでも知らせてから投げ直す
   * (投げ直さないとBlockNoteが成功扱いで空のURLを本文に入れてしまう)。
   */
  const uploadImage = useMemo(() => {
    const upload = createImageUploader(() => taskIdRef.current);
    return async (file: File) => {
      try {
        return await upload(file);
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "画像を貼り付けられませんでした",
        );
        throw error;
      }
    };
  }, []);

  // エディタのUI文言(スラッシュメニュー・プレースホルダ等)を日本語にする
  const editor = useCreateBlockNote({ dictionary: ja, uploadFile: uploadImage });
```

（元の `// エディタのUI文言...` のコメント行と `useCreateBlockNote` の行は上に含まれているので消す）

- [ ] **Step 6: `BlockNoteView` にパネルを差し替える**

ファイル末尾の `BlockNoteView` を差し替える。

```tsx
        <BlockNoteView
          editor={editor}
          theme={isDark ? "dark" : "light"}
          onChange={handleEditorChange}
          filePanel={false}
        >
          <FilePanelController filePanel={UploadOnlyFilePanel} />
        </BlockNoteView>
```

- [ ] **Step 7: テストと型チェックが通ることを確かめる**

Run: `npx vitest run src/components/TaskDetail.test.tsx`
Expected: PASS

Run: `npx tsc --noEmit`
Expected: エラーなし（何も出力されない）

- [ ] **Step 8: コミット**

```bash
git add src/components/TaskDetail.tsx src/components/TaskDetail.test.tsx
git commit -m "feat: タスク本文に画像を貼り付けられるようにする"
```

---

## Task 10: 全体の検証

**Files:** なし（確認のみ）

- [ ] **Step 1: フロントのテストを全件流す**

Run: `npm test`
Expected: PASS（全ファイル）

- [ ] **Step 2: 型チェックとビルド**

Run: `npm run build`
Expected: 成功（`tsc && vite build`）

- [ ] **Step 3: Rust のテストを全件流す**

Run: `cd src-tauri && cargo test`
Expected: PASS（全件）

- [ ] **Step 4: 実機で確認する（ユーザーに依頼する）**

`npm run tauri dev` を起動し、以下を確かめてもらう。
**このアプリは `~/Library/Application Support/Avoliq/avoliq.db` の実データを使うため、
エージェントが勝手に起動せず、ユーザーに実行を依頼すること。**

1. パレットを出してタスク詳細を開く
2. スクリーンショットを ⌘V で貼り、その場で表示されること
3. Esc でパレットを閉じ、再度開いて同じタスクを見る → **画像が表示されること**
4. そのタスクを削除し、復元する → **画像が壊れていないこと**
5. Finder から画像ファイルを本文へドラッグ&ドロップできること
6. 画像ブロックのパネルに「埋め込み」タブが**無い**こと
7. 10MB を超える画像を貼ると、本文が変わらずトーストが出ること

- [ ] **Step 5: 手動確認で問題がなければ最終コミット**

コード変更が無ければコミット不要。修正が出た場合のみ、内容に応じた
`fix: <日本語の説明>` でコミットする。

---

## 完了の定義

- [ ] `npm test` が全件通る
- [ ] `npm run build` が通る
- [ ] `cd src-tauri && cargo test` が全件通る
- [ ] 上記「実機で確認する」の7項目をユーザーが確認済み
- [ ] `README.md` と `landing/` に変更が無い（バックアップの約束が保たれている）
- [ ] `src-tauri/capabilities/default.json` に変更が無い
