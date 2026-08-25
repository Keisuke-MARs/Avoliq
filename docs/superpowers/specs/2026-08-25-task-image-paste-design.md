# Avoliq タスク本文への画像貼り付け 設計書

作成日: 2026-08-25
ステータス: ユーザー承認済み（ブレインストーミングセッションにて承認）
対象イシュー: [#4 タスクの概要に画像をコピー＆ペーストで貼れるようにする](https://github.com/Keisuke-MARs/Avoliq/issues/4)

既存の `2026-08-20-avoliq-palette-design.md`（設計書）と
`2026-08-20-implementation-contract.md`（実装コントラクト）を前提とする。
本書で追加・変更する名前と型は、実装コントラクトへの追記と同じ強さの拘束力を持つ。

## 決定事項サマリ

| 項目 | 決定 |
|---|---|
| 画像の保存先 | **`avoliq.db` の `images` テーブルに BLOB**。データディレクトリにファイルは作らない |
| 本文での参照 | `![alt](avoliq-img://<id>)` という独自スキームURL |
| Webviewへの配信 | Rust 側で `avoliq-img` スキームを登録し、DB から直接バイト列を返す |
| 貼り付け経路 | ペースト（⌘V）／スラッシュメニューのファイル選択／Finder からのドラッグ&ドロップ |
| 外部URL埋め込み | **UIから外す**（外部通信ゼロの原則に反し、CSPでも表示できないため） |
| 1枚の上限 | **10MB**。超えたら取り込まずトーストで知らせる |
| 圧縮・縮小 | **しない**。貼ったバイト列をそのまま保存する |
| 対応形式 | `image/png` / `image/jpeg` / `image/gif` / `image/webp` |
| 未参照画像の掃除 | **しない**（⌘Z の Undo を壊さないため） |
| README / LP の記述 | **変更なし**。「バックアップは `avoliq.db` を1つコピーするだけ」は保たれる |
| スコープ外 | 画像の縮小・圧縮、外部URLの埋め込み、画像の再利用（別タスクへの使い回しUI）、未参照画像のGC |

### 却下した代替案

- **本文に `data:` URI を直接埋める案**: Rust 側の変更がゼロで最も実装が小さい。
  しかし `content_md` が数MBの base64 で膨らみ、`tasks_list` は全タスクの `content_md` を
  返すため、パレットを開くたびの読み込みと検索が重くなる。Markdown としても実用に耐えない。
- **データディレクトリ配下に画像フォルダを作る案**: 素直だが、
  「バックアップはこのファイルをコピーするだけで済みます」（`README.md`）と
  「バックアップは複製」（`landing/src/sections/FeatureLocal.tsx`）という
  ユーザーへの約束が崩れる。約束を書き換えてまで得られる利点が無い。
- **保存のたびに未参照画像を消す案**: DBは常に最小に保てるが、本文から画像を消した直後の
  500ms デバウンス保存でバイト列が消え、そのあと ⌘Z で戻すと壊れた画像が残る。
  これは実際に踏む事故なので却下。
- **起動時に全タスクを走査してGCする案**: Undo は壊さないが起動が重くなり、
  論理削除済みタスク（`deleted_at`）の分まで数えないと復元が壊れる。今回のスコープでは作りすぎ。

### イシュー記載の前提のうち、実装上の訂正

イシュー本文の「3. Webview からの表示許可」は
`src-tauri/capabilities/default.json` の変更が要る、としている。
これは Tauri 組み込みの `asset://` プロトコルを使う場合の話であり、
本設計のように**独自スキームを `register_asynchronous_uri_scheme_protocol` で自前登録する場合、
capabilities の permission は不要**である。必要なのは
`tauri.conf.json` の CSP `img-src` にスキームを足すことだけ。
したがって `capabilities/default.json` は本件では変更しない。

## 往復の安全性（イシュー「2. Markdown 往復での壊れにくさ」の担保）

本設計の要は、**エディタが保持する URL と Markdown に保存する URL が同一文字列**である点にある。
`uploadFile` が返した `avoliq-img://<id>` がそのまま image ブロックの `props.url` に入り、
`blocksToMarkdownLossy` がそのまま書き出し、`tryParseMarkdownToBlocks` がそのまま読み戻す。
**保存時にも読込時にも文字列の書き換えが一切要らない**ため、往復で壊れる余地そのものが無い。

BlockNote 0.54 で実測した結果（`BlockNoteEditor.create()` による headless 検証）:

| ケース | 保存される Markdown | 読み戻し |
|---|---|---|
| キャプション無し | `![shot.png](avoliq-img://<id>)` | image ブロック（`url` / `name` 保持） |
| キャプション有り | `<figure><img alt="shot.png" src="avoliq-img://<id>"><figcaption>図1</figcaption></figure>` | image ブロック（`url` / `name` / `caption` 保持） |
| `name` 無し | `![](avoliq-img://<id>)` | image ブロック（`url` 保持） |

キャプションを付けた場合だけ Markdown ではなく生の HTML `<figure>` で書き出されるが、
**読み戻しても caption 込みで image ブロックに戻る**ことを確認済み。
また、見出し・テーブルと混在させても順序・型ともに保たれ、
読込前に通す `reflowStrayMarkdownTables` は画像の行を一切変えない（`|` を含まないため）。

これらは `src/lib/markdownRoundtrip.test.ts` にテストとして残す。

## DBスキーマ（migration v3）

`migrations.rs` の `MIGRATIONS` に `(3, V3)` を追記する。既存の v1 / v2 は変更しない。

```sql
CREATE TABLE images (
  id         TEXT PRIMARY KEY,                                  -- uuid v4
  task_id    TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  mime       TEXT NOT NULL,                                     -- 'image/png' 等
  bytes      BLOB NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_images_task ON images(task_id);
```

`tasks_list` をはじめ既存のクエリは `images` に一切触れない。
バイト列が一覧や検索の経路に乗ることは無く、**起動と検索の速さは変わらない**。

### 削除・復元との関係（イシュー「確認すること」の担保）

| 操作 | 実装 | 画像の行 | 結果 |
|---|---|---|---|
| タスク削除 `task_delete` | `deleted_at` を入れる論理削除 | **残る** | 復元で画像ごと戻る |
| タスク復元 `task_restore` | `deleted_at` を NULL に戻す | 残っている | そのまま表示される |
| ボード削除 `board_delete` | `DELETE FROM tasks WHERE board_id = ?`（物理削除） | **CASCADE で消える** | 取り残しが出ない |
| 本文から画像だけ消す | `content_md` から参照が消えるだけ | 残る | ⌘Z で戻せる |

## リポジトリ層（`src-tauri/src/db/repo.rs`）

```rust
/// 画像を1枚保存し、生成した id を返す。
pub fn image_create(conn: &mut Connection, task_id: &str, mime: &str, bytes: &[u8]) -> Result<String>

/// id から (mime, bytes) を引く。無ければ RepoError::NotFound。
pub fn image_read(conn: &mut Connection, id: &str) -> Result<(String, Vec<u8>)>
```

サイズと MIME の検査はコマンド層に一本化し、リポジトリ層では行わない
（既存の `task_create` などと同じく、リポジトリ層は永続化に徹する）。
ただし `image_create` は `task_id` が実在するかだけ先に確かめ、
無ければ `RepoError::NotFound` を返す
（外部キー違反を SQLite のエラー文字列のままフロントに見せないため）。

## コマンド層（`src-tauri/src/commands.rs`）

```rust
#[tauri::command]
pub fn image_create(
    state: State<'_, DbState>,
    task_id: String,
    mime: String,
    data_base64: String,
) -> Result<String, String>
```

- バイト列は **base64 文字列**で受け渡す。`Vec<u8>` をそのまま渡すと Tauri の IPC が
  JSON の数値配列に展開し、3MB の画像が 12MB 超の JSON になるため。base64 なら約 1.33 倍で済む。
- デコードには `base64 = "0.22"` を追加する。
- 検査の順序: MIME の allowlist → デコード → **デコード後のバイト長**が 10MB 以下か。
  フロントでも同じ検査をするが、**Rust 側の検査を正とする**（フロントの検査だけに頼らない）。
- エラーメッセージは日本語。`RepoError::Rule` を経由して既存の `to_string()` の流儀に合わせる。

`lib.rs` の `invoke_handler` に `commands::image_create` を追記する。

## 独自スキーム `avoliq-img`（`src-tauri/src/lib.rs`）

```rust
tauri::Builder::default()
    // …既存のプラグイン登録…
    .register_asynchronous_uri_scheme_protocol("avoliq-img", |ctx, request, responder| {
        // DB読み出しを別スレッドへ逃がし、Webviewの描画スレッドを塞がない
    })
```

- 同期版ではなく**非同期版**を使う。DB のロックを待つ間に Webview 側を止めないため。
- id の取り出し: macOS では URL が `avoliq-img://<id>` の形でハンドラに渡るため
  `uri().host()` から取る。将来ほかのプラットフォームで
  `avoliq-img://localhost/<id>` の形になった場合に備え、
  **host が `localhost` のときはパスの末尾セグメントを使う**フォールバックを置く。
- 応答: `200` + `Content-Type: <mime>` + バイト列。見つからなければ `404`、
  id が読めなければ `400`。DB ロックの取得に失敗したら `500`。
- `DbState` は `setup()` で `manage` されるが、このハンドラが走るのは必ず起動後なので
  `ctx.app_handle().try_state::<DbState>()` で取り、取れなければ `500` を返す。

## Tauri 設定（`src-tauri/tauri.conf.json`）

2箇所だけ変える。`capabilities/default.json` は変更しない。

```jsonc
// app.security.csp — img-src に avoliq-img: を足す
"csp": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: avoliq-img:; font-src 'self' data:; connect-src ipc: http://ipc.localhost ws://localhost:1420"

// app.windows[0] — Webview に drag-drop を通す
"dragDropEnabled": false
```

`dragDropEnabled` は Tauri の既定が `true` で、その場合ネイティブ側が drag-drop を
横取りして Webview の HTML5 drag-drop イベントが発火しない。
Finder からの D&D を効かせるには `false` にする必要がある。

## フロント

### 新規: `src/lib/taskImage.ts`

`TaskDetail.tsx` は既に 250 行あり、これ以上太らせない。
アップロードの中身は独立したモジュールに切り出し、単体でテストできるようにする。

```ts
/** 受け付ける画像のMIME。Rust側の allowlist と一致させる。 */
export const ALLOWED_IMAGE_MIME: readonly string[]

/** 1枚の上限（10MB）。Rust側の上限と一致させる。 */
export const MAX_IMAGE_BYTES: number

/**
 * BlockNoteのuploadFileに渡す関数を作る。
 * 検証に落ちたら Error を投げる（BlockNote側がアップロード失敗として扱う）。
 * 戻り値は本文にそのまま保存される avoliq-img://<id>。
 */
export function createImageUploader(getTaskId: () => string | null):
  (file: File) => Promise<string>
```

- 検証 → `FileReader` で data URI 化 → base64 部分だけ取り出す → `api.imageCreate` を呼ぶ
- 失敗時は日本語のメッセージを持つ `Error` を投げ、呼び出し側（`TaskDetail`）が
  `sonner` のトーストで見せる
- `getTaskId` を関数で受けるのは、エディタが1度しか生成されないため。
  `TaskDetail` は `Palette` 側でタスクidごとに `key` を振り直されるので実際には固定だが、
  クロージャに値を焼き付けない形にしておく

### 追記: `src/lib/api.ts`

```ts
/** 画像を1枚保存し、本文から参照するためのidを返す。 */
export function imageCreate(taskId: string, mime: string, dataBase64: string): Promise<string>
```

### 変更: `src/components/TaskDetail.tsx`

1. `useCreateBlockNote({ dictionary: ja, uploadFile })` に `uploadFile` を渡す
2. `BlockNoteView` に `filePanel={false}` を渡し、子として
   アップロードタブだけの `FilePanelController` を置く

外部URL埋め込みタブの除去は、`@blocknote/react` の公開エクスポートだけで組める：

```tsx
// 外部URLの埋め込みタブを持たないファイルパネル。
// Avoliqは外部通信を行わないため、URLを貼れても画像はCSPに阻まれて表示されない。
// 「貼れるのに映らない」タブをUIに残さないよう、アップロードタブだけを出す。
function UploadOnlyFilePanel(props: FilePanelProps) { /* Components.FilePanel.Root を直接組む */ }
```

使う公開API: `useComponentsContext` / `useDictionary` / `UploadTab` / `FilePanelController` /
`FilePanelProps`（いずれも `@blocknote/react` の index から export 済みであることを確認済み）。

## エラー処理

| 状況 | 挙動 |
|---|---|
| 10MB 超 | 取り込まず「画像が大きすぎます（10MBまで）」をトースト表示。本文は変わらない |
| 非対応の形式 | 「この形式の画像は貼り付けられません」をトースト表示 |
| DB 書き込み失敗 | Rust 側のメッセージをそのままトースト表示 |
| 表示時に画像が見つからない | プロトコルが 404 を返し、Webview が壊れた画像として描く。本文の他の部分は無事 |

## テスト

| ファイル | 担保する内容 |
|---|---|
| `src/lib/markdownRoundtrip.test.ts`（追記） | `![](avoliq-img://id)` が image ブロックへ変換され、書き戻しても URL が保たれる。キャプション付き（`<figure>`）も往復する。`reflowStrayMarkdownTables` を通しても画像の行が変わらない |
| `src/lib/taskImage.test.ts`（新規） | サイズ超過・非対応MIMEで投げる。正常系で `avoliq-img://<id>` を返す。`api.imageCreate` に渡る引数が正しい |
| `src-tauri/src/db/repo.rs` の `#[cfg(test)]`（追記） | `image_create` → `image_read` で往復する。存在しない `task_id` は `NotFound`。`board_delete` で CASCADE 削除される。`task_delete` → `task_restore` を挟んでも画像が残る |
| `src-tauri/src/db/migrations.rs` の `#[cfg(test)]`（追記） | v3 適用後に `images` テーブルが在る。マイグレーションが冪等である |

`src/components/TaskDetail.test.tsx` は BlockNote をモックしているため、
`uploadFile` を渡しても既存のテストは影響を受けない。

## 手動での確認手順（イシュー「確認すること」）

1. `npm run tauri dev` でパレットを出し、タスク詳細を開く
2. スクリーンショットを ⌘V で貼り、その場で表示されること
3. Esc でパレットを閉じ、再度開いて同じタスクを見る → **画像が表示されること**
4. そのタスクを削除し、復元する → **画像が壊れていないこと**
5. Finder から画像ファイルを本文へドラッグ&ドロップできること
6. 画像ブロックのパネルに「埋め込み」タブが無いこと
7. 10MB を超える画像を貼ると、本文が変わらずトーストが出ること
