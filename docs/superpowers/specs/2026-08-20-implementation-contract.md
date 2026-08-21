# Avoliq 実装コントラクト

設計書 `2026-08-20-avoliq-palette-design.md` を実装に落とすための共通契約。
**計画書・実装は必ずこのファイルの名前・型・シグネチャに従うこと。**（勝手に改名しない）

## 技術スタック（バージョン方針）

- Tauri v2（`create-tauri-app` で React + TypeScript + Vite テンプレート）
- React 18+ / TypeScript / Vite
- Tailwind CSS v4 + shadcn/ui + lucide-react
- 状態管理: zustand
- エディタ: BlockNote（`@blocknote/core` + `@blocknote/react` + shadcn連携パッケージ）
- Rust: rusqlite（bundled）, uuid, serde
- Tauriプラグイン: `global-shortcut` / `single-instance` / `autostart` / `tauri-nspanel`（GitHub配布crate）

### shadcn/ui 導入の実態（実装時判明・Task P1-T2で確定）

- 現行shadcn CLIはプリセット方式に変わり `init` は非決定的なため、**手動インストール**で導入済み
  （components.json 手書き / style は `base-nova` / baseColor neutral / iconLibrary lucide）
- 現行styleのコンポーネントは **Radixではなく Base UI（`@base-ui/react`）ベース**
- **レジストリは依存を宣言しない**：`npx shadcn@latest add <component> --yes` の後は
  必ず `npm run build` を実行し、未解決importがあれば必要パッケージを手動で追加すること
- 禁止依存（設計と衝突）: `@fontsource-*` / `geist` / `radix-ui`（一括パッケージ）

## ディレクトリ / ファイル構成

```
src/                          # React
  main.tsx / App.tsx / index.css
  types.ts                    # 共有型定義（下記）
  lib/api.ts                  # Tauri invoke ラッパー（コマンド1つにつき関数1つ）
  store/appStore.ts           # zustand ストア
  hooks/useKeyboard.ts        # キーボードディスパッチ（view別）
  components/
    Palette.tsx               # ルート。view切替（board/detail/switcher/settings）
    SearchBar.tsx
    Board.tsx / Lane.tsx / TaskCard.tsx
    TaskDetail.tsx            # BlockNote
    BoardSwitcher.tsx
    BoardSettings.tsx
src-tauri/
  src/main.rs / lib.rs
  src/db/mod.rs               # 接続・初期化
  src/db/migrations.rs        # schema_migrations 方式
  src/db/repo.rs              # リポジトリ層（テストはここに #[cfg(test)]）
  src/commands.rs             # #[tauri::command] 群（repoの薄いラッパー）
  src/panel.rs                # NSPanel化・ホットキー・トレイ
```

## DBスキーマ（migration v1）

```sql
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
  color      TEXT NOT NULL,            -- '#RRGGBB'
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
  deleted_at TEXT                       -- NULL = 生存（ソフトデリート）
);
CREATE TABLE settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
CREATE TABLE schema_migrations (
  version    INTEGER PRIMARY KEY,
  applied_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

- 外部キー有効化: 接続ごとに `PRAGMA foreign_keys = ON;`
- DBパス: `~/Library/Application Support/Avoliq/avoliq.db`
  （テストはインメモリ `Connection::open_in_memory()`）
- 初回起動時: ボード「メイン」を1枚 + デフォルトステータス4つを自動作成

## デフォルトステータス（新規ボード作成時に自動投入）

| position | name | color |
|---|---|---|
| 0 | 未着手 | #8E8E93 |
| 1 | 進行中 | #007AFF |
| 2 | 確認中 | #FF9500 |
| 3 | 完了   | #34C759 |

## Tauriコマンド API（Rust側関数名 = invoke名）

戻り値はすべて `Result<T, String>`。serdeは `#[serde(rename_all = "camelCase")]`。

| コマンド | 引数 | 戻り値 | 備考 |
|---|---|---|---|
| `boards_list` | – | `Vec<Board>` | position昇順 |
| `board_create` | `name: String` | `Board` | デフォルトステータス4つも作成 |
| `board_rename` | `id, name` | `Board` | |
| `board_delete` | `id` | `()` | 物理削除。FK違反を避けるためtasks→statuses→boardsの順で明示削除。UI側で確認必須 |
| `statuses_list` | `board_id` | `Vec<Status>` | position昇順 |
| `status_create` | `board_id, name, color` | `Status` | 末尾に追加 |
| `status_update` | `id, name: Option, color: Option` | `Status` | |
| `status_delete` | `id` | `()` | 所属タスクはボード先頭ステータスへ移動。最後の1つは削除不可(Err) |
| `status_reorder` | `id, new_index: i64` | `Vec<Status>` | ボード内全件を再採番して返す |
| `tasks_list` | `board_id` | `Vec<Task>` | deleted_at IS NULL のみ、position昇順 |
| `task_create` | `board_id, status_id, title` | `Task` | レーン先頭(position=0)に挿入・他を再採番 |
| `task_update` | `id, title: Option, content_md: Option` | `Task` | updated_at更新 |
| `task_move` | `id, status_id, new_index: i64` | `Task` | 移動元・移動先レーンを再採番 |
| `task_delete` | `id` | `Task` | ソフトデリート(deleted_at設定)。削除行のpositionは保持し、生存タスクのみ0..n-1に再採番 |
| `task_restore` | `id` | `Task` | deleted_atをNULLに戻し、削除時のpositionの位置に復元(⌘Zで元の場所に戻る) |
| `setting_get` | `key` | `Option<String>` | |
| `setting_set` | `key, value` | `()` | ホットキーは key=`hotkey`, 既定値 `Alt+Space`。key=`hotkey` 時は再登録も行う |
| `palette_hide` | – | `()` | パレット非表示（フロントのEscから呼ぶ） |

## Rust側の固定名（計画間の整合用）

- DB接続のTauri managed state型: `DbState`
- パネル表示/非表示トグル関数: `panel.rs` の `toggle_panel(app: &AppHandle)`
  （グローバルショートカットと再登録処理の両方がこれを呼ぶ）
- ホットキー登録失敗イベント名: `hotkey-error`（payloadは失敗メッセージ文字列）。
  起動直後のemit取りこぼし対策として settings の `hotkeyError` キーにも書き込む
- メインウィンドウのラベル: `main`

## 非同期競合の防御規約（レビューサイクルで確立・変更禁止）

- `appStore.ts` はモジュールスコープの **boardEpoch**（`getBoardEpoch()` でexport）を持ち、
  `selectBoard` は**要求時点で同期的に**インクリメントする。await後の状態反映（set・トースト含む）は
  すべて「開始時に捕捉したepoch === 現在のepoch」のときだけ行う
- `selectBoard` 読込中は `boardLoading` フラグが立ち、ミューテーション系アクションは冒頭で即return
- `selectBoard` 要求時に `lastDeletedTaskId` を同期クリア（⌘Z undoはボードローカルな操作）
- UIのcommit系関数（BoardSwitcher / StatusSettings）は `submittingRef` で二重実行を防ぐ
- `appStore.ts` のタスク作成系（`createNewTask` / `createTaskFromSearch`）はモジュールスコープの
  `taskCreating` フラグ（両関数で共有）で二重実行を防ぐ。加えて、応答反映は手元での楽観的
  position計算（残存タスクのposition+1）ではなく、`task_create` 成功後に
  `api.tasksList(boardId)` でDBの実状態を正引きして反映する（採番はRust側の再採番結果に委ねる）。
  epoch一致チェックは `task_create` 応答時・`tasksList` 応答時の両方で行い、いずれかの時点で
  追い越されていたら黙って破棄する
- 切替後に届いた古い応答のトースト・反映は黙って破棄する（意図した仕様）

## フロント側の追加固定名

- `src/lib/boardNav.ts`: カーソル移動・レーン跨ぎの純関数置き場（ストアを太らせない）
- `src/store/appStore.ts` は `initialAppState` もexport（テストのリセット用。AppStateの形は不変）
- 検索バーのDOM id: `SEARCH_INPUT_ID = "smarttask-search"`
- `src/store/appStore.ts` は `NEW_TASK_TITLE = "新しいタスク"` もexport（⌘Nの既定タイトル文字列。
  タイトル入力欄の初期値・作成時の引数として使うのみで、「新規作成直後か」の判定には使わない。
  既存タスクがたまたま同名だった場合の誤爆を避けるため、判定はAppStateの`pendingNewTaskId`
  （createNewTask成功時にセットし、TaskDetailが`selectedTaskId === pendingNewTaskId`で判定した後
  クリアする）で行う）

並び順は**整数positionの全件再採番方式**（レーン内タスク数は少ない前提。分数position等は使わない）。

## TypeScript 型（`src/types.ts`）

```ts
export interface Board {
  id: string;
  name: string;
  position: number;
}

export interface Status {
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
}

export type View = "board" | "detail" | "switcher" | "settings";
```

## zustandストア（`src/store/appStore.ts`）の公開形

```ts
interface AppState {
  boards: Board[];
  currentBoardId: string | null;
  statuses: Status[];        // currentBoardの分
  tasks: Task[];             // currentBoardの分（生存のみ）
  selectedTaskId: string | null;
  view: View;
  searchQuery: string;
  lastDeletedTaskId: string | null;   // ⌘Z undo 用（直近1件）
  pendingNewTaskId: string | null;    // createNewTask成功時にセット。TaskDetailが
                                       // 「⌘N直後か」をidで判定し、判定後にクリアする

  loadBoards(): Promise<void>;
  selectBoard(boardId: string): Promise<boolean>; // statuses/tasksも再読込。反映=true/失敗・追い越し=false
  setView(view: View): void;
  setSearchQuery(q: string): void;
  setSelectedTask(id: string | null): void;
  createTaskFromSearch(): Promise<void>;  // searchQueryをタイトルに作成→detailへ
  createNewTask(): Promise<void>;         // 既定タイトル("新しいタスク")で先頭ステータスに作成→detailへ(⌘N)
  moveSelectedTask(dir: "left" | "right"): Promise<void>;
  reorderSelectedTask(dir: "up" | "down"): Promise<void>;
  deleteSelectedTask(): Promise<void>;
  undoDelete(): Promise<void>;
  updateTaskContent(id: string, contentMd: string): Promise<void>; // 500msデバウンスは呼び出し側(TaskDetail)
  updateTaskTitle(id: string, title: string): Promise<void>;
}
```

## キーマップ（設計書と同一。実装はuseKeyboard.tsに集約）

- グローバル: `⌥Space` トグル（Rust側 global-shortcut, settingsのhotkeyキーで変更可能）
- Esc: detail→board / board→パレット非表示（Rust側 hide）
- board: 文字→SearchBar / Enter→作成 or 詳細 / ↓→ボードへ / ←→↑↓移動 /
  ⌘←→ステータス移動 / ⌘↑↓並び替え / ⌘⌫削除 / ⌘Z復元 /
  ⌘N新規タスク作成(先頭ステータスへ既定タイトルで作成→detailへ) /
  ⌘P検索バーへフォーカス /
  ⌘1..9ボード切替 / ⌘Bスイッチャー / ⌘,設定
- detail: ⌘←→ステータス変更 / ⌘Tタイトルへフォーカス /
  ⌘N新規タスク作成(flushDetail→createNewTask、新タスクの詳細に差し替わる) /
  ⌘P検索(flushDetail→board遷移→検索バーへフォーカス、1フレーム遅延させて確実にフォーカスする) /
  Esc戻る（自動保存済み）
- detail画面を開いた瞬間: `selectedTaskId === pendingNewTaskId`(⌘Nで作った直後)ならタイトルへ
  全選択フォーカス、それ以外(カードから開いた・検索から作成した等)は本文エディタ(BlockNote)へ
  自動フォーカス。タイトル入力中にEnter/Tabを押すと本文エディタへフォーカスが移る
  （⌘Tで再度タイトルへ戻れる）

## UI原則

- フォント: `-apple-system, BlinkMacSystemFont, "SF Pro Text", "Hiragino Sans", sans-serif`
- アイコンは絵文字禁止、lucide-reactのみ
- パレット: 角丸16px・半透明白 `rgba(250,250,252,0.6)` ＋ 背後のぼかし・大きめシャドウ
  - 背後のぼかしは `tauri.conf.json` の `windowEffects`（NSVisualEffectView / material=popover,
    radius=16）が担う。CSSの `backdrop-filter` はWKWebViewではページ内しかぼかせず、
    透過ウィンドウの向こう側には効かないので使わない
  - `state` は `active` 固定。非アクティブ化パネルはkeyWindowにならないため、既定の
    `followsWindowActiveState` だと常に非アクティブ表示（くすんだ色）になる
- アクセントカラーはステータス色（上表）
- フッターに常時キーボードヒント表示
- 保存ボタンは存在しない（全操作即時保存）

## 開発規約（抜粋）

- コード内コメントは日本語（共通語）
- コミットメッセージ: `<type>: <日本語の説明>`（feat/fix/chore/refactor/docs/style/test/perf）
- コミットにAI署名・Co-Authored-Byを**付けない**
- TDD: リポジトリ層はRustユニットテスト、フロントはVitest + Testing Library
