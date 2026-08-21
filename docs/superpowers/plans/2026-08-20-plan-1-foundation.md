# smartTask 基盤 実装計画（計画書1: 基盤）

> **注記(2026-08-21)**: 本計画の実行後、製品名は smartTask から **Avoliq** に正式改名された。
> 本文中の `smartTask` / `smart-task` は実行当時の記録。現行の正しい名前は実装コントラクトを参照。

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ⌥Space でプレースホルダーのフローティングパレットが開閉する macOS アプリと、cargo テストで完全に検証された SQLite リポジトリ層を作る。

**Architecture:** Tauri v2（Rust）を土台にし、フロントは React + TypeScript + Vite。DB アクセスは Rust 側の `db::repo` に一元化し、`commands.rs` の `#[tauri::command]` は repo への薄い委譲に徹する。ウィンドウは `tauri-nspanel` で NSPanel（非アクティブ化パネル）へ変換し、`global-shortcut` プラグインで登録したホットキーから表示/非表示をトグルする。

**Tech Stack:** Tauri v2.11 / React 19 / TypeScript / Vite 8 / Tailwind CSS v4 / shadcn/ui / lucide-react / rusqlite 0.40（bundled）/ uuid / serde / tauri-plugin-global-shortcut 2 / tauri-plugin-single-instance 2 / tauri-nspanel（GitHub `branch = "v2.1"`）

---

## 事前に把握しておくこと（Web調査で確認済みの事実）

この計画のコード例は以下を実際のソース/公式ドキュメントで確認して書いている。憶測で API を変えないこと。

| 項目 | 確認結果 |
|---|---|
| `create-tauri-app` 非対話フラグ | `[PROJECTNAME] -t/--template <react-ts> -m/--manager <npm> --identifier <id> -y/--yes -f/--force` |
| プロジェクト名に `.` を使う | **禁止**。`productName` が `"."`、パッケージ名が `tauri-app` になる。必ず `smart-task` という名前で別ディレクトリに生成してからコピーする |
| react-ts テンプレート | `src/index.css` は**存在しない**（`src/App.css` のみ）。Tailwind を入れるには `src/index.css` を新規作成し `main.tsx` から import する必要がある |
| tauri-nspanel | `branch = "v2.1"`。`tauri_panel!` マクロで NSPanel サブクラスを定義し、`WebviewWindowExt::to_panel::<T>()` で既存ウィンドウを変換。`ManagerExt::get_webview_panel(label)` で取得 |
| nspanel の値変換 | `PanelLevel::Floating.value()` → `i64`、`StyleMask::…​.value()` → `NSWindowStyleMask`、`CollectionBehavior::…​.value()` → `NSWindowCollectionBehavior`。**`.into()` ではなく `.value()`** |
| nspanel と tauri feature | tauri-nspanel は `tauri` の `macos-private-api` feature を要求する。透過ウィンドウにも必要なので `tauri.conf.json` の `app.macOSPrivateApi: true` とセットで有効化する |
| global-shortcut | `app.global_shortcut().on_shortcut("Alt+Space", handler)`。handler は `Fn(&AppHandle<R>, &Shortcut, ShortcutEvent)`。`event.state()` が `ShortcutState::Pressed / Released` |
| ホットキー文字列のパース | `global-hotkey` の `parse_hotkey` は大文字小文字を無視し `ALT`/`OPTION`、`SPACE` を解釈する。よって `"Alt+Space"` はそのまま通る |
| single-instance | **一番最初に登録**する。コールバックは `|app, args, cwd|` |
| Dock アイコン非表示 | `setup(|app| { app.set_activation_policy(tauri::ActivationPolicy::Accessory); … })`。`&mut App` 側のメソッドは戻り値なし |
| DBパス | `app.path().data_dir()` が `~/Library/Application Support` を返す（`app_data_dir()` だと識別子ディレクトリになってしまうので使わない） |
| capabilities | アプリ自身が定義した `#[tauri::command]` に ACL は不要。ホットキーは Rust 側でのみ登録するので `global-shortcut:*` の permission も不要。フロントの `listen()` は `core:default` に含まれる `core:event:default` でカバーされる。**スキャフォールドの `default.json` を変更しない** |
| rusqlite | 最新安定は 0.40 系。`bundled` feature あり。`params!` / `OptionalExtension` / `query_map` / `Connection::transaction(&mut self)` は従来どおり |
| `cargo test` と `dist/` | `tauri::generate_context!` はコンパイル時に設定を読む。事故を避けるため**最初に一度 `npm run build` を実行して `dist/` を作ってから** cargo を回す |

---

## 計画書2・3と共有する固定名（改名禁止）

実装コントラクトで固定された名前。後続の計画書がこの名前で grep・参照するので、勝手に変えないこと。

| 対象 | 名前 | 定義場所 |
|---|---|---|
| DB接続の managed state 型 | `DbState` | `src-tauri/src/commands.rs` |
| メインウィンドウのラベル | `"main"`（`panel::MAIN_WINDOW_LABEL`） | `src-tauri/src/panel.rs` |
| パネル表示/非表示トグル関数 | `toggle_panel(app: &AppHandle)` | `src-tauri/src/panel.rs` |
| パネル表示 / 非表示 | `show_panel(app: &AppHandle)` / `hide_panel(app: &AppHandle)` | `src-tauri/src/panel.rs` |
| Escで呼ぶコマンド | `palette_hide()` → `Result<(), String>` | `src-tauri/src/commands.rs` |
| ホットキー登録失敗イベント名 | `"hotkey-error"`（payload = 失敗メッセージ文字列） | `src-tauri/src/panel.rs` |
| ホットキー設定キー | `"hotkey"`（`repo::HOTKEY_SETTING_KEY`、既定 `"Alt+Space"`） | `src-tauri/src/db/repo.rs` |
| ホットキー失敗メッセージの settings キー | `"hotkeyError"`（`repo::HOTKEY_ERROR_SETTING_KEY`） | `src-tauri/src/db/repo.rs` |

イベント `hotkey-error` は起動直後だとフロントの `listen` が間に合わず取りこぼす可能性がある。
そのため同じメッセージを settings の `hotkeyError` キーにも書き込み、フロントは起動時に
`setting_get("hotkeyError")` で拾えるようにする（登録に成功したときは空文字で上書きしてクリアする）。

---

## ファイル構成

```
（リポジトリルート）/Users/kei06/dev/smartTaskManagement
├─ index.html                     # タイトルとfaviconの整理のみ
├─ package.json                   # npm スクリプト・依存
├─ vite.config.ts                 # tailwindcss プラグイン + "@" エイリアス
├─ tsconfig.json                  # baseUrl/paths（shadcn のエイリアス解決用）
├─ components.json                # shadcn/ui 設定（init が生成）
├─ src/
│  ├─ main.tsx                    # index.css を import するよう変更
│  ├─ index.css                   # Tailwind v4 + shadcn テーマ + パレットの器スタイル
│  ├─ App.tsx                     # パレットの器。Esc で palette_hide を invoke
│  └─ lib/utils.ts                # shadcn の cn()（init が生成）
└─ src-tauri/
   ├─ Cargo.toml                  # Rust依存
   ├─ tauri.conf.json             # ウィンドウ（装飾なし・透過・最前面）・productName
   ├─ capabilities/default.json   # スキャフォールドのまま（変更なし）
   └─ src/
      ├─ main.rs                  # smart_task_lib::run() を呼ぶだけ（変更なし）
      ├─ lib.rs                   # プラグイン登録・DB初期化・コマンド登録・setup
      ├─ db/mod.rs                # 接続生成・初期化・モデル型・エラー型
      ├─ db/migrations.rs         # schema_migrations 方式のマイグレーション
      ├─ db/repo.rs               # リポジトリ層（#[cfg(test)] のユニットテストもここ）
      ├─ commands.rs              # #[tauri::command] 群（repo への薄い委譲）+ DbState
      └─ panel.rs                 # NSPanel化・グローバルショートカット・トレイ
```

責務の切り分け:

- `db/mod.rs` は「接続をどう作るか」と「どんなデータか」だけを持つ。SQL は書かない。
- `db/migrations.rs` は DDL だけを持つ。将来の v2 マイグレーションは配列に足すだけで済む。
- `db/repo.rs` が唯一 SQL を書く場所。Tauri に一切依存しない（＝インメモリ SQLite だけでテストできる）。
- `commands.rs` は Tauri とリポジトリの変換層。ロック取得と `Result<T, String>` への変換だけ。
- `panel.rs` は macOS ウィンドウまわりの副作用を全部引き受ける。DB は設定値の読み出しにしか触らない。

---

## Task 1: プロジェクト雛形を生成してリポジトリに取り込む

**Files:**
- Create: `/Users/kei06/dev/smartTaskManagement/package.json` ほかスキャフォールド一式
- Modify: `/Users/kei06/dev/smartTaskManagement/.gitignore`

- [ ] **Step 1: 一時ディレクトリに雛形を生成する**

```bash
mkdir -p /tmp/smarttask-scaffold
cd /tmp/smarttask-scaffold
npm create tauri-app@latest smart-task -- --template react-ts --manager npm --identifier com.kei06.smarttask --yes
```

期待する出力（末尾）:

```
Template created! To get started run:
  cd smart-task
  npm install
  npm run tauri dev
```

対話プロンプトは1つも出ない（名前・テンプレート・パッケージマネージャ・識別子をすべてフラグで渡しているため）。
リポジトリ直下で `.` を指定して生成してはいけない。`productName` が `"."` になり、Cargo のパッケージ名が `tauri-app` に化ける。

- [ ] **Step 2: 生成物をリポジトリへコピーする**

`.gitignore` はリポジトリ側の既存ファイルを守るため、ルート直下のものだけ除外する（`src-tauri/.gitignore` はコピーしたい）。

```bash
cd /Users/kei06/dev/smartTaskManagement
rsync -a --exclude='/.gitignore' /tmp/smarttask-scaffold/smart-task/ ./
ls src-tauri/src
```

期待する出力:

```
lib.rs	main.rs
```

- [ ] **Step 3: .gitignore を統合する**

`/Users/kei06/dev/smartTaskManagement/.gitignore` を次の内容にする。

```gitignore
# ブレインストーミング用モックアップ（ローカル作業ファイル）
.superpowers/

# Logs
logs
*.log
npm-debug.log*
yarn-debug.log*
yarn-error.log*
pnpm-debug.log*
lerna-debug.log*

node_modules
dist
dist-ssr
*.local

# Editor directories and files
.vscode/*
!.vscode/extensions.json
.idea
.DS_Store
*.suo
*.ntvs*
*.njsproj
*.sln
*.sw?
```

- [ ] **Step 4: 依存をインストールしてフロントがビルドできることを確かめる**

```bash
cd /Users/kei06/dev/smartTaskManagement
npm install
npm run build
```

期待する出力（末尾）:

```
✓ built in ...
```

`dist/` ディレクトリが生成される。これは以降の `cargo` コマンドが `tauri::generate_context!` を解決するために必要。

- [ ] **Step 5: 識別子が正しいことを確認する**

```bash
grep -n '"identifier"' /Users/kei06/dev/smartTaskManagement/src-tauri/tauri.conf.json
```

期待する出力:

```
5:  "identifier": "com.kei06.smarttask",
```

- [ ] **Step 6: コミット**

```bash
cd /Users/kei06/dev/smartTaskManagement
git add -A
git commit -m "chore: Tauri v2 + React + TypeScript の雛形を追加"
```

---

## Task 2: Tailwind CSS v4 + shadcn/ui + lucide-react を導入する

**Files:**
- Create: `/Users/kei06/dev/smartTaskManagement/src/index.css`
- Modify: `/Users/kei06/dev/smartTaskManagement/src/main.tsx`
- Modify: `/Users/kei06/dev/smartTaskManagement/vite.config.ts`
- Modify: `/Users/kei06/dev/smartTaskManagement/tsconfig.json`
- Create: `/Users/kei06/dev/smartTaskManagement/components.json`（shadcn init が生成）
- Create: `/Users/kei06/dev/smartTaskManagement/src/lib/utils.ts`（shadcn init が生成）

- [ ] **Step 1: Tailwind CSS v4 と @types/node を入れる**

```bash
cd /Users/kei06/dev/smartTaskManagement
npm install tailwindcss @tailwindcss/vite
npm install -D @types/node
```

- [ ] **Step 2: src/index.css を新規作成する**

react-ts テンプレートには `src/index.css` が無いので作る。

`/Users/kei06/dev/smartTaskManagement/src/index.css`:

```css
@import "tailwindcss";
```

- [ ] **Step 3: main.tsx から index.css を読み込む**

`/Users/kei06/dev/smartTaskManagement/src/main.tsx` を次の内容にする。

```tsx
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
```

- [ ] **Step 4: vite.config.ts に tailwindcss プラグインと "@" エイリアスを足す**

`/Users/kei06/dev/smartTaskManagement/vite.config.ts` を次の内容にする。

```ts
import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
// @ts-expect-error type error without @types/node package
import process from "node:process";
const host = process.env.TAURI_DEV_HOST;

// https://vite.dev/config/
export default defineConfig(() => ({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },
}));
```

- [ ] **Step 5: tsconfig.json にパスエイリアスを足す**

`/Users/kei06/dev/smartTaskManagement/tsconfig.json` を次の内容にする（`baseUrl` と `paths` を追加しただけ）。

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM"],
    "module": "ESNext",
    "skipLibCheck": true,

    /* Bundler mode */
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",

    /* Linting */
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,

    /* Path alias for shadcn/ui */
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["src"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
```

- [ ] **Step 6: shadcn/ui を初期化する**

```bash
cd /Users/kei06/dev/smartTaskManagement
npx shadcn@latest init --base radix
```

`--base radix` を渡しているのでコンポーネントライブラリの選択は聞かれない。ベースカラーだけ聞かれるので `Neutral` を選ぶ。

```
? Which color would you like to use as the base color? › Neutral
```

期待する出力（末尾）:

```
✔ Writing components.json.
✔ Checking registry.
✔ Updating src/index.css
✔ Installing dependencies.
✔ Created 1 file:
  - src/lib/utils.ts
```

CLI が `src/index.css` に shadcn のテーマ変数（`@theme inline` / `:root` / `.dark`）を追記する。追記された内容は消さないこと。

- [ ] **Step 7: 初期化結果を検証する**

```bash
cd /Users/kei06/dev/smartTaskManagement
test -f components.json && test -f src/lib/utils.ts && grep -c "@theme inline" src/index.css
```

期待する出力:

```
1
```

- [ ] **Step 8: lucide-react を入れる**

```bash
cd /Users/kei06/dev/smartTaskManagement
npm install lucide-react
```

- [ ] **Step 9: shadcn のコンポーネント追加が通ることを確かめる**

```bash
cd /Users/kei06/dev/smartTaskManagement
npx shadcn@latest add button --yes
ls src/components/ui
```

期待する出力:

```
button.tsx
```

- [ ] **Step 10: ビルドが通ることを確かめる**

```bash
cd /Users/kei06/dev/smartTaskManagement
npm run build
```

期待する出力（末尾）:

```
✓ built in ...
```

- [ ] **Step 11: コミット**

```bash
cd /Users/kei06/dev/smartTaskManagement
git add -A
git commit -m "chore: Tailwind CSS v4 と shadcn/ui と lucide-react を導入"
```

---

## Task 3: パレットの器（フロント最小実装）

**Files:**
- Modify: `/Users/kei06/dev/smartTaskManagement/src/App.tsx`
- Modify: `/Users/kei06/dev/smartTaskManagement/src/index.css`
- Modify: `/Users/kei06/dev/smartTaskManagement/index.html`
- Delete: `/Users/kei06/dev/smartTaskManagement/src/App.css`

- [ ] **Step 1: App.tsx をパレットの器に差し替える**

`/Users/kei06/dev/smartTaskManagement/src/App.tsx` を次の内容にする（Esc のハンドリングは Task 17 で足す）。

```tsx
function App() {
  return (
    <div className="palette-shell">
      <span className="palette-title">smartTask</span>
    </div>
  );
}

export default App;
```

- [ ] **Step 2: 不要になった App.css を消す**

```bash
cd /Users/kei06/dev/smartTaskManagement
rm src/App.css
```

- [ ] **Step 3: index.css の末尾にパレットのスタイルを足す**

`/Users/kei06/dev/smartTaskManagement/src/index.css` の**末尾に**次を追記する（shadcn が書いた内容の後ろ）。

```css
/* ここから smartTask 固有のスタイル */

/* ウィンドウ自体が透過なので、器の外側は完全に透明にする */
html,
body,
#root {
  height: 100%;
  margin: 0;
  background: transparent;
}

body {
  font-family:
    -apple-system, BlinkMacSystemFont, "SF Pro Text", "Hiragino Sans", sans-serif;
  -webkit-font-smoothing: antialiased;
  /* パレットは文書ではないのでテキスト選択させない */
  user-select: none;
  overflow: hidden;
}

/* パレットの器: 角丸16px・半透明白・backdrop blur・大きめシャドウ */
.palette-shell {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 16px;
  background: rgba(250, 250, 252, 0.92);
  backdrop-filter: saturate(180%) blur(24px);
  -webkit-backdrop-filter: saturate(180%) blur(24px);
  box-shadow: 0 24px 64px rgba(0, 0, 0, 0.28);
}

.palette-title {
  font-size: 22px;
  font-weight: 600;
  letter-spacing: 0.01em;
  color: #1c1c1e;
}
```

- [ ] **Step 4: index.html を整える**

`/Users/kei06/dev/smartTaskManagement/index.html` を次の内容にする（存在しない `/vite.svg` の参照を消し、タイトルを変える）。

```html
<!doctype html>
<html lang="ja">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>smartTask</title>
  </head>

  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 5: ビルドが通ることを確かめる**

```bash
cd /Users/kei06/dev/smartTaskManagement
npm run build
```

期待する出力（末尾）:

```
✓ built in ...
```

型エラー（`App.css` の import 残りなど）が出たら App.tsx を見直す。

- [ ] **Step 6: コミット**

```bash
cd /Users/kei06/dev/smartTaskManagement
git add -A
git commit -m "feat: パレットの器を最小実装で追加"
```

---

## Task 4: Rust の依存とウィンドウ設定を整える

**Files:**
- Modify: `/Users/kei06/dev/smartTaskManagement/src-tauri/Cargo.toml`
- Modify: `/Users/kei06/dev/smartTaskManagement/src-tauri/tauri.conf.json`

- [ ] **Step 1: Cargo.toml を書き換える**

`/Users/kei06/dev/smartTaskManagement/src-tauri/Cargo.toml` を次の内容にする。

```toml
[package]
name = "smart-task"
version = "0.1.0"
description = "smartTask - Spotlight風タスク管理パレット"
authors = ["you"]
edition = "2021"

# See more keys and their definitions at https://doc.rust-lang.org/cargo/reference/manifest.html

[lib]
# The `_lib` suffix may seem redundant but it is necessary
# to make the lib name unique and wouldn't conflict with the bin name.
# This seems to be only an issue on Windows, see https://github.com/rust-lang/cargo/issues/8519
name = "smart_task_lib"
crate-type = ["staticlib", "cdylib", "rlib"]

[build-dependencies]
tauri-build = { version = "2", features = [] }

[dependencies]
# macos-private-api: 透過ウィンドウと tauri-nspanel が要求する
# tray-icon: メニューバー常駐アイコン
tauri = { version = "2", features = ["macos-private-api", "tray-icon"] }
tauri-plugin-opener = "2"
serde = { version = "1", features = ["derive"] }
serde_json = "1"
# bundled: SQLite 本体を同梱してビルドする（システムのSQLiteに依存しない）
rusqlite = { version = "0.40", features = ["bundled"] }
uuid = { version = "1", features = ["v4"] }
# 本アプリは macOS 専用のため NSPanel プラグインは無条件に入れる
tauri-nspanel = { git = "https://github.com/ahkohd/tauri-nspanel", branch = "v2.1" }

[target."cfg(not(any(target_os = \"android\", target_os = \"ios\")))".dependencies]
tauri-plugin-global-shortcut = "2"
tauri-plugin-single-instance = "2"

# Read the optimization guideline for more details: https://tauri.app/concept/size/#cargo-configuration
[profile.release]
codegen-units = 1
lto = true
opt-level = 3
panic = "abort"
strip = true
```

- [ ] **Step 2: tauri.conf.json を書き換える**

`/Users/kei06/dev/smartTaskManagement/src-tauri/tauri.conf.json` を次の内容にする。`visible` はまだ触らない（Task 14 で `false` にする）。

```json
{
  "$schema": "https://schema.tauri.app/config/2",
  "productName": "smartTask",
  "version": "0.1.0",
  "identifier": "com.kei06.smarttask",
  "build": {
    "beforeDevCommand": "npm run dev",
    "devUrl": "http://localhost:1420",
    "beforeBuildCommand": "npm run build",
    "frontendDist": "../dist"
  },
  "app": {
    "macOSPrivateApi": true,
    "windows": [
      {
        "label": "main",
        "title": "smartTask",
        "width": 720,
        "height": 480,
        "center": true,
        "resizable": false,
        "decorations": false,
        "transparent": true,
        "alwaysOnTop": true,
        "shadow": true,
        "skipTaskbar": true
      }
    ],
    "security": {
      "csp": null
    }
  },
  "bundle": {
    "active": true,
    "targets": "all",
    "icon": [
      "icons/32x32.png",
      "icons/128x128.png",
      "icons/128x128@2x.png",
      "icons/icon.icns",
      "icons/icon.ico"
    ]
  }
}
```

- [ ] **Step 3: capabilities は変更しないことを確認する**

```bash
cat /Users/kei06/dev/smartTaskManagement/src-tauri/capabilities/default.json
```

期待する出力:

```json
{
  "$schema": "../gen/schemas/desktop-schema.json",
  "identifier": "default",
  "description": "Capability for the main window",
  "windows": ["main"],
  "permissions": [
    "core:default",
    "opener:default"
  ]
}
```

このままでよい。理由は3つ。(1) 自作の `#[tauri::command]` は ACL の対象外。(2) グローバルショートカットは Rust 側だけで登録するのでプラグインの JS permission が不要。(3) フロントの `listen()` は `core:default` に含まれる `core:event:default` で許可されている。

- [ ] **Step 4: 依存が解決してビルドが通ることを確かめる**

初回は tauri とバンドル SQLite のコンパイルで5〜10分かかる。CPU を長時間使うので、実行前にユーザーへ一声かけること。

```bash
cd /Users/kei06/dev/smartTaskManagement/src-tauri
cargo build
```

期待する出力（末尾）:

```
    Finished `dev` profile [unoptimized + debuginfo] target(s) in ...
```

- [ ] **Step 5: コミット**

```bash
cd /Users/kei06/dev/smartTaskManagement
git add -A
git commit -m "chore: Rust依存とパレット向けウィンドウ設定を追加"
```

---

## Task 5: マイグレーション基盤（TDD）

**Files:**
- Create: `/Users/kei06/dev/smartTaskManagement/src-tauri/src/db/mod.rs`
- Create: `/Users/kei06/dev/smartTaskManagement/src-tauri/src/db/migrations.rs`
- Modify: `/Users/kei06/dev/smartTaskManagement/src-tauri/src/lib.rs`

- [ ] **Step 1: db モジュールの骨格を先に置く**

テストが「コンパイルできて落ちる」状態にするため、型とエラーだけ先に作る。

`/Users/kei06/dev/smartTaskManagement/src-tauri/src/db/mod.rs`:

```rust
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
```

- [ ] **Step 2: lib.rs から db モジュールを見えるようにする**

`/Users/kei06/dev/smartTaskManagement/src-tauri/src/lib.rs` の先頭に次の1行を足す（既存の `greet` と `run` はそのまま残す）。

```rust
mod db;
```

- [ ] **Step 3: 失敗するテストを書く**

`/Users/kei06/dev/smartTaskManagement/src-tauri/src/db/migrations.rs` を次の内容で作る（テストだけ。実装はまだ空）。

```rust
//! schema_migrations 方式のマイグレーション。

use rusqlite::Connection;

use super::Result;

/// 未適用のマイグレーションを順に適用する。何度呼んでも安全（冪等）。
pub fn migrate(_conn: &mut Connection) -> Result<()> {
    todo!("Step 5 で実装する")
}

/// 適用済みの最大バージョンを返す。1件も無ければ 0。
pub fn current_version(_conn: &Connection) -> Result<i64> {
    todo!("Step 5 で実装する")
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
```

- [ ] **Step 4: テストが落ちることを確認する**

```bash
cd /Users/kei06/dev/smartTaskManagement/src-tauri
cargo test --lib db::migrations
```

期待する出力: 5件とも `FAILED`、パニックメッセージは `not yet implemented: Step 5 で実装する`。

- [ ] **Step 5: マイグレーションを実装する**

`/Users/kei06/dev/smartTaskManagement/src-tauri/src/db/migrations.rs` の `#[cfg(test)] mod tests` より上を次の内容に差し替える。

```rust
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
pub fn current_version(conn: &Connection) -> Result<i64> {
    let version: Option<i64> = conn.query_row(
        "SELECT MAX(version) FROM schema_migrations",
        [],
        |row| row.get(0),
    )?;
    Ok(version.unwrap_or(0))
}
```

- [ ] **Step 6: テストが通ることを確認する**

```bash
cd /Users/kei06/dev/smartTaskManagement/src-tauri
cargo test --lib db::migrations
```

期待する出力:

```
test result: ok. 5 passed; 0 failed; 0 ignored
```

- [ ] **Step 7: コミット**

```bash
cd /Users/kei06/dev/smartTaskManagement
git add -A
git commit -m "feat: スキーマv1のマイグレーション基盤を追加"
```

---

## Task 6: boards の CRUD（TDD）

**Files:**
- Create: `/Users/kei06/dev/smartTaskManagement/src-tauri/src/db/repo.rs`
- Modify: `/Users/kei06/dev/smartTaskManagement/src-tauri/src/db/mod.rs`

- [ ] **Step 1: 失敗するテストを書く**

`/Users/kei06/dev/smartTaskManagement/src-tauri/src/db/repo.rs` を次の内容で作る。

```rust
//! リポジトリ層。SQLを書くのはこのファイルだけ。Tauriには依存しない。

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
```

- [ ] **Step 2: repo モジュールを公開する**

`/Users/kei06/dev/smartTaskManagement/src-tauri/src/db/mod.rs` の `pub mod migrations;` の下に次を足す。

```rust
pub mod repo;
```

- [ ] **Step 3: テストが落ちることを確認する**

```bash
cd /Users/kei06/dev/smartTaskManagement/src-tauri
cargo test --lib db::repo
```

期待する出力: コンパイルエラー `error[E0425]: cannot find function 'board_create' in this scope`（同種のエラーが `boards_list` / `board_rename` / `board_delete` / `statuses_list` / `task_create` / `tasks_list` でも出る）。

- [ ] **Step 4: boards まわりを実装する**

`/Users/kei06/dev/smartTaskManagement/src-tauri/src/db/repo.rs` の `#[cfg(test)] mod tests` より**上に**次を挿入する。

```rust
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
```

- [ ] **Step 5: statuses_list / task_create / tasks_list の最小版を足す**

Task 6 のテストがこれらを呼ぶので、ここで最小の実装を入れる（本格的なテストは Task 7 以降）。上で追加したコードの末尾に続けて書く。

```rust
/// 生存タスクの position を 0..n-1 に振り直す（レーン単位）
fn renumber_lane(tx: &Transaction<'_>, status_id: &str) -> Result<()> {
    let ids: Vec<String> = {
        let mut stmt = tx.prepare(
            "SELECT id FROM tasks
             WHERE status_id = ?1 AND deleted_at IS NULL
             ORDER BY position, rowid",
        )?;
        stmt.query_map(params![status_id], |row| row.get::<_, String>(0))?
            .collect::<rusqlite::Result<Vec<String>>>()?
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
```

- [ ] **Step 6: テストが通ることを確認する**

```bash
cd /Users/kei06/dev/smartTaskManagement/src-tauri
cargo test --lib db::repo
```

期待する出力:

```
test result: ok. 6 passed; 0 failed; 0 ignored
```

- [ ] **Step 7: コミット**

```bash
cd /Users/kei06/dev/smartTaskManagement
git add -A
git commit -m "feat: ボードのCRUDとデフォルトステータス自動投入を追加"
```

---

## Task 7: statuses の作成・更新・並び替え（TDD）

**Files:**
- Modify: `/Users/kei06/dev/smartTaskManagement/src-tauri/src/db/repo.rs`

- [ ] **Step 1: 失敗するテストを書く**

`repo.rs` の `mod tests` の中（既存テストの下）に次を追記する。

```rust
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
```

- [ ] **Step 2: テストが落ちることを確認する**

```bash
cd /Users/kei06/dev/smartTaskManagement/src-tauri
cargo test --lib db::repo
```

期待する出力: コンパイルエラー `error[E0425]: cannot find function 'status_create' in this scope`（`status_update` / `status_reorder` も同様）。

- [ ] **Step 3: 実装する**

`repo.rs` の `#[cfg(test)] mod tests` より上に次を追記する。

```rust
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
```

- [ ] **Step 4: テストが通ることを確認する**

```bash
cd /Users/kei06/dev/smartTaskManagement/src-tauri
cargo test --lib db::repo
```

期待する出力:

```
test result: ok. 11 passed; 0 failed; 0 ignored
```

- [ ] **Step 5: コミット**

```bash
cd /Users/kei06/dev/smartTaskManagement
git add -A
git commit -m "feat: ステータスの作成・更新・並び替えを追加"
```

---

## Task 8: status_delete（タスク退避と最後の1つ削除不可）（TDD）

**Files:**
- Modify: `/Users/kei06/dev/smartTaskManagement/src-tauri/src/db/repo.rs`

- [ ] **Step 1: 失敗するテストを書く**

`repo.rs` の `mod tests` の中に次を追記する。

```rust
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
```

- [ ] **Step 2: テストが落ちることを確認する**

```bash
cd /Users/kei06/dev/smartTaskManagement/src-tauri
cargo test --lib db::repo
```

期待する出力: コンパイルエラー `error[E0425]: cannot find function 'status_delete' in this scope`。

- [ ] **Step 3: 実装する**

`repo.rs` の `#[cfg(test)] mod tests` より上に次を追記する。

```rust
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
```

- [ ] **Step 4: テストが通ることを確認する**

```bash
cd /Users/kei06/dev/smartTaskManagement/src-tauri
cargo test --lib db::repo
```

期待する出力:

```
test result: ok. 15 passed; 0 failed; 0 ignored
```

- [ ] **Step 5: コミット**

```bash
cd /Users/kei06/dev/smartTaskManagement
git add -A
git commit -m "feat: ステータス削除時のタスク退避と最後の1つの保護を追加"
```

---

## Task 9: tasks の作成・一覧・更新（TDD）

**Files:**
- Modify: `/Users/kei06/dev/smartTaskManagement/src-tauri/src/db/repo.rs`

- [ ] **Step 1: 失敗するテストを書く**

`repo.rs` の `mod tests` の中に次を追記する。

```rust
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
```

- [ ] **Step 2: テストが落ちることを確認する**

```bash
cd /Users/kei06/dev/smartTaskManagement/src-tauri
cargo test --lib db::repo
```

期待する出力: コンパイルエラー `error[E0425]: cannot find function 'task_update' in this scope`。

- [ ] **Step 3: task_update を実装する**

`repo.rs` の `#[cfg(test)] mod tests` より上に次を追記する。

```rust
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
```

- [ ] **Step 4: テストが通ることを確認する**

```bash
cd /Users/kei06/dev/smartTaskManagement/src-tauri
cargo test --lib db::repo
```

期待する出力:

```
test result: ok. 21 passed; 0 failed; 0 ignored
```

- [ ] **Step 5: コミット**

```bash
cd /Users/kei06/dev/smartTaskManagement
git add -A
git commit -m "feat: タスクの作成・一覧・更新を追加"
```

---

## Task 10: task_move（TDD）

**Files:**
- Modify: `/Users/kei06/dev/smartTaskManagement/src-tauri/src/db/repo.rs`

- [ ] **Step 1: 失敗するテストを書く**

`repo.rs` の `mod tests` の中に次を追記する。

```rust
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
```

- [ ] **Step 2: テストが落ちることを確認する**

```bash
cd /Users/kei06/dev/smartTaskManagement/src-tauri
cargo test --lib db::repo
```

期待する出力: コンパイルエラー `error[E0425]: cannot find function 'task_move' in this scope`。

- [ ] **Step 3: 実装する**

`repo.rs` の `#[cfg(test)] mod tests` より上に次を追記する。

```rust
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
```

- [ ] **Step 4: テストが通ることを確認する**

```bash
cd /Users/kei06/dev/smartTaskManagement/src-tauri
cargo test --lib db::repo
```

期待する出力:

```
test result: ok. 25 passed; 0 failed; 0 ignored
```

- [ ] **Step 5: コミット**

```bash
cd /Users/kei06/dev/smartTaskManagement
git add -A
git commit -m "feat: タスクのステータス移動と並び替えを追加"
```

---

## Task 11: ソフトデリートと復元（TDD）

**Files:**
- Modify: `/Users/kei06/dev/smartTaskManagement/src-tauri/src/db/repo.rs`

- [ ] **Step 1: 失敗するテストを書く**

`repo.rs` の `mod tests` の中に次を追記する。

```rust
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
```

- [ ] **Step 2: テストが落ちることを確認する**

```bash
cd /Users/kei06/dev/smartTaskManagement/src-tauri
cargo test --lib db::repo
```

期待する出力: コンパイルエラー `error[E0425]: cannot find function 'task_delete' in this scope`（`task_restore` も同様）。

- [ ] **Step 3: 実装する**

`repo.rs` の `#[cfg(test)] mod tests` より上に次を追記する。

```rust
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
```

- [ ] **Step 4: テストが通ることを確認する**

```bash
cd /Users/kei06/dev/smartTaskManagement/src-tauri
cargo test --lib db::repo
```

期待する出力:

```
test result: ok. 30 passed; 0 failed; 0 ignored
```

- [ ] **Step 5: コミット**

```bash
cd /Users/kei06/dev/smartTaskManagement
git add -A
git commit -m "feat: タスクのソフトデリートと元位置への復元を追加"
```

---

## Task 12: settings と初回起動シード（TDD）

**Files:**
- Modify: `/Users/kei06/dev/smartTaskManagement/src-tauri/src/db/repo.rs`

- [ ] **Step 1: 失敗するテストを書く**

`repo.rs` の `mod tests` の中に次を追記する。

```rust
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
```

- [ ] **Step 2: テストが落ちることを確認する**

```bash
cd /Users/kei06/dev/smartTaskManagement/src-tauri
cargo test --lib db::repo
```

期待する出力: コンパイルエラー `error[E0425]: cannot find function 'setting_get' in this scope`（`setting_set` / `seed_if_empty` / `HOTKEY_SETTING_KEY` / `HOTKEY_ERROR_SETTING_KEY` / `DEFAULT_HOTKEY` も同様）。

- [ ] **Step 3: 実装する**

`repo.rs` の `#[cfg(test)] mod tests` より上に次を追記する。

```rust
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
```

- [ ] **Step 4: テストが通ることを確認する**

```bash
cd /Users/kei06/dev/smartTaskManagement/src-tauri
cargo test --lib
```

期待する出力:

```
test result: ok. 41 passed; 0 failed; 0 ignored
```

（`db::migrations` の5件 + `db::repo` の36件）

- [ ] **Step 5: コミット**

```bash
cd /Users/kei06/dev/smartTaskManagement
git add -A
git commit -m "feat: 設定の読み書きと初回起動シードを追加"
```

---

## Task 13: Tauriコマンド層と DB 状態管理

**Files:**
- Create: `/Users/kei06/dev/smartTaskManagement/src-tauri/src/commands.rs`
- Modify: `/Users/kei06/dev/smartTaskManagement/src-tauri/src/lib.rs`

- [ ] **Step 1: commands.rs を作る**

`/Users/kei06/dev/smartTaskManagement/src-tauri/src/commands.rs`:

```rust
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
```

`repo::*` は `&mut Connection` を取るが、`state.0.lock()` が返すのは `MutexGuard<Connection>`。`&mut conn` は DerefMut 強制変換で `&mut Connection` になる。

- [ ] **Step 2: lib.rs を書き換えて DB を開き、コマンドを登録する**

`/Users/kei06/dev/smartTaskManagement/src-tauri/src/lib.rs` を次の内容にする（テンプレートの `greet` は削除する）。

```rust
mod commands;
mod db;

use std::sync::Mutex;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            commands::boards_list,
            commands::board_create,
            commands::board_rename,
            commands::board_delete,
            commands::statuses_list,
            commands::status_create,
            commands::status_update,
            commands::status_delete,
            commands::status_reorder,
            commands::tasks_list,
            commands::task_create,
            commands::task_update,
            commands::task_move,
            commands::task_delete,
            commands::task_restore,
            commands::setting_get,
            commands::setting_set,
        ])
        .setup(|app| {
            // ~/Library/Application Support/smartTask/smart-task.db
            // app_data_dir() だとバンドル識別子のディレクトリになるので data_dir() を使う
            let db_path = app
                .path()
                .data_dir()?
                .join("smartTask")
                .join("smart-task.db");
            let mut conn = db::open_at(&db_path).map_err(|e| e.to_string())?;
            db::repo::seed_if_empty(&mut conn).map_err(|e| e.to_string())?;
            app.manage(commands::DbState(Mutex::new(conn)));

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

- [ ] **Step 3: ビルドとテストが通ることを確認する**

```bash
cd /Users/kei06/dev/smartTaskManagement/src-tauri
cargo build && cargo test --lib
```

期待する出力（末尾）:

```
    Finished `dev` profile [unoptimized + debuginfo] target(s) in ...
test result: ok. 41 passed; 0 failed; 0 ignored
```

- [ ] **Step 4: 実際に起動して DB ファイルが作られることを確認する**

```bash
cd /Users/kei06/dev/smartTaskManagement
npm run tauri dev
```

ウィンドウ（装飾なし・透過・"smartTask" 表示）が出たら、別のターミナルで確認する。

```bash
ls -l ~/Library/Application\ Support/smartTask/
```

期待する出力:

```
-rw-r--r--  ...  smart-task.db
```

確認できたら `npm run tauri dev` を Ctrl+C で止める。

- [ ] **Step 5: コミット**

```bash
cd /Users/kei06/dev/smartTaskManagement
git add -A
git commit -m "feat: Tauriコマンド層とDB接続の状態管理を追加"
```

---

## Task 14: ウィンドウを NSPanel 化する

**Files:**
- Create: `/Users/kei06/dev/smartTaskManagement/src-tauri/src/panel.rs`
- Modify: `/Users/kei06/dev/smartTaskManagement/src-tauri/src/commands.rs`
- Modify: `/Users/kei06/dev/smartTaskManagement/src-tauri/src/lib.rs`
- Modify: `/Users/kei06/dev/smartTaskManagement/src-tauri/tauri.conf.json`

- [ ] **Step 1: panel.rs を作る**

関数名 `toggle_panel` / `show_panel` / `hide_panel` と定数 `MAIN_WINDOW_LABEL` は
実装コントラクトで固定された名前。計画書2・3がこの名前で参照するので改名しないこと。

`/Users/kei06/dev/smartTaskManagement/src-tauri/src/panel.rs`:

```rust
//! macOSウィンドウまわりの副作用をまとめる。
//! NSPanel化・グローバルショートカット・メニューバートレイをここで扱う。

use tauri::{App, AppHandle, Manager, WebviewWindow};
use tauri_nspanel::{
    tauri_panel, CollectionBehavior, ManagerExt, Panel, PanelLevel, StyleMask, WebviewWindowExt,
};

/// メインウィンドウのラベル（tauri.conf.json の windows[].label と一致させる）
pub const MAIN_WINDOW_LABEL: &str = "main";

// NSPanelのサブクラスを定義する。
// can_become_key_window: 装飾なしウィンドウでもキーボード入力を受け取れるようにする
// is_floating_panel: 他アプリのウィンドウより手前に浮かせる
// hides_on_deactivate: 勝手に消えると操作しづらいので false（明示的なEsc/ホットキーで閉じる）
tauri_panel! {
    panel!(SmartTaskPanel {
        config: {
            can_become_key_window: true,
            can_become_main_window: false,
            is_floating_panel: true,
            hides_on_deactivate: false
        }
    })
}

/// メインウィンドウをNSPanel化し、Spotlight風の見た目・挙動を設定する。
pub fn init_panel(app: &App) -> Result<(), Box<dyn std::error::Error>> {
    let window: WebviewWindow = app
        .get_webview_window(MAIN_WINDOW_LABEL)
        .ok_or("メインウィンドウが見つかりません")?;

    let panel = window.to_panel::<SmartTaskPanel>()?;

    // 非アクティブ化パネル: アプリをアクティブにせずキー入力だけ受け取る（＝フォーカスを奪わない）
    // borderless: タイトルバーなし
    panel.set_style_mask(StyleMask::empty().nonactivating_panel().borderless().value());

    // 通常ウィンドウより手前のフローティングレベル
    panel.set_level(PanelLevel::Floating.value());

    // 全スペースで表示し、スペース移動に追従せず、フルスクリーンアプリの上にも出す。
    // Cmd+Tab のウィンドウ循環には出さない。
    panel.set_collection_behavior(
        CollectionBehavior::new()
            .can_join_all_spaces()
            .stationary()
            .full_screen_auxiliary()
            .ignores_cycle()
            .value(),
    );

    // 角丸はネイティブ側にも伝える（透過ウィンドウの影を角丸に合わせるため）
    panel.set_corner_radius(16.0);
    panel.set_transparent(true);
    panel.set_has_shadow(true);

    Ok(())
}

/// パレットを表示してキーウィンドウにする
pub fn show_panel(app: &AppHandle) {
    if let Ok(panel) = app.get_webview_panel(MAIN_WINDOW_LABEL) {
        panel.show_and_make_key();
    }
}

/// パレットを隠す
pub fn hide_panel(app: &AppHandle) {
    if let Ok(panel) = app.get_webview_panel(MAIN_WINDOW_LABEL) {
        panel.hide();
    }
}

/// パレットの表示/非表示を切り替える。
/// グローバルショートカットのハンドラとホットキー再登録処理の両方がここを呼ぶ。
pub fn toggle_panel(app: &AppHandle) {
    if let Ok(panel) = app.get_webview_panel(MAIN_WINDOW_LABEL) {
        if panel.is_visible() {
            panel.hide();
        } else {
            panel.show_and_make_key();
        }
    }
}
```

- [ ] **Step 2: commands.rs に palette_hide を足す**

`#[tauri::command]` はコントラクトどおり `commands.rs` に集約する。
`/Users/kei06/dev/smartTaskManagement/src-tauri/src/commands.rs` の import に次を足す。

```rust
use tauri::AppHandle;

use crate::panel;
```

そしてファイル末尾に次を追記する。

```rust
/// パレットを隠す。フロントの Esc から呼ぶ。
/// NSPanel なので JS 側の window.hide() ではなく Rust 側で orderOut する必要がある。
#[tauri::command]
pub fn palette_hide(app: AppHandle) -> Result<(), String> {
    panel::hide_panel(&app);
    Ok(())
}
```

`app: AppHandle` は Tauri が注入する引数なので、フロントからは `invoke("palette_hide")` と
引数なしで呼べる。

- [ ] **Step 3: lib.rs で nspanel プラグインを登録し、panel を初期化する**

`/Users/kei06/dev/smartTaskManagement/src-tauri/src/lib.rs` を次の内容にする。

```rust
mod commands;
mod db;
mod panel;

use std::sync::Mutex;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_nspanel::init())
        .invoke_handler(tauri::generate_handler![
            commands::boards_list,
            commands::board_create,
            commands::board_rename,
            commands::board_delete,
            commands::statuses_list,
            commands::status_create,
            commands::status_update,
            commands::status_delete,
            commands::status_reorder,
            commands::tasks_list,
            commands::task_create,
            commands::task_update,
            commands::task_move,
            commands::task_delete,
            commands::task_restore,
            commands::setting_get,
            commands::setting_set,
            commands::palette_hide,
        ])
        .setup(|app| {
            // ~/Library/Application Support/smartTask/smart-task.db
            // app_data_dir() だとバンドル識別子のディレクトリになるので data_dir() を使う
            let db_path = app
                .path()
                .data_dir()?
                .join("smartTask")
                .join("smart-task.db");
            let mut conn = db::open_at(&db_path).map_err(|e| e.to_string())?;
            db::repo::seed_if_empty(&mut conn).map_err(|e| e.to_string())?;
            app.manage(commands::DbState(Mutex::new(conn)));

            // ウィンドウをNSPanel化する
            panel::init_panel(app)?;

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

- [ ] **Step 4: 起動時は非表示にする**

`/Users/kei06/dev/smartTaskManagement/src-tauri/tauri.conf.json` の `app.windows[0]` に `"visible": false,` を足す。`"title"` の直後に入れる。

```json
      {
        "label": "main",
        "title": "smartTask",
        "visible": false,
        "width": 720,
        "height": 480,
        "center": true,
        "resizable": false,
        "decorations": false,
        "transparent": true,
        "alwaysOnTop": true,
        "shadow": true,
        "skipTaskbar": true
      }
```

- [ ] **Step 5: ビルドが通ることを確認する**

```bash
cd /Users/kei06/dev/smartTaskManagement/src-tauri
cargo build
```

期待する出力（末尾）:

```
    Finished `dev` profile [unoptimized + debuginfo] target(s) in ...
```

tauri-nspanel は git から取得するので初回は数分かかる。

- [ ] **Step 6: コミット**

```bash
cd /Users/kei06/dev/smartTaskManagement
git add -A
git commit -m "feat: パレットウィンドウをNSPanel化してEscで閉じるコマンドを追加"
```

---

## Task 15: グローバルショートカットで表示/非表示をトグルする

**Files:**
- Modify: `/Users/kei06/dev/smartTaskManagement/src-tauri/src/panel.rs`
- Modify: `/Users/kei06/dev/smartTaskManagement/src-tauri/src/commands.rs`
- Modify: `/Users/kei06/dev/smartTaskManagement/src-tauri/src/lib.rs`

- [ ] **Step 1: panel.rs にホットキー登録を足す**

イベント名 `hotkey-error` と settings キー `hotkeyError` は実装コントラクトで固定。改名しないこと。

`/Users/kei06/dev/smartTaskManagement/src-tauri/src/panel.rs` の import に次を足す。

```rust
use tauri::Emitter;
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};

use crate::commands::DbState;
use crate::db::repo;
```

さらにファイル末尾に次を追記する。

```rust
/// ホットキー登録に失敗したときにフロントへ通知するイベント名（payloadは失敗メッセージ文字列）
pub const HOTKEY_ERROR_EVENT: &str = "hotkey-error";

/// settingsテーブルの hotkey キー（既定 Alt+Space）を読んでグローバルショートカットを登録する。
///
/// 登録に失敗したらフロントへ `hotkey-error` を emit する。ただし起動直後はフロントの
/// listen が間に合わないことがあるので、同じメッセージを settings の `hotkeyError` にも書く。
/// 成功したときは空文字で上書きして過去のエラーをクリアする。
pub fn register_hotkey(app: &AppHandle) -> Result<(), String> {
    let hotkey = {
        let state = app.state::<DbState>();
        let mut conn = state
            .0
            .lock()
            .map_err(|_| "DB接続のロックに失敗しました".to_string())?;
        repo::setting_get(&mut conn, repo::HOTKEY_SETTING_KEY)
            .map_err(|e| e.to_string())?
            .unwrap_or_else(|| repo::DEFAULT_HOTKEY.to_string())
    };

    let result = app
        .global_shortcut()
        .on_shortcut(hotkey.as_str(), |app, _shortcut, event| {
            // 押した瞬間だけ反応させる（離したときにも来るので無視する）
            if event.state() == ShortcutState::Pressed {
                toggle_panel(app);
            }
        });

    let message = match result {
        Ok(()) => String::new(),
        Err(error) => format!("ホットキー {hotkey} を登録できませんでした: {error}"),
    };

    if !message.is_empty() {
        let _ = app.emit(HOTKEY_ERROR_EVENT, message.clone());
    }

    let state = app.state::<DbState>();
    let mut conn = state
        .0
        .lock()
        .map_err(|_| "DB接続のロックに失敗しました".to_string())?;
    repo::setting_set(&mut conn, repo::HOTKEY_ERROR_SETTING_KEY, &message)
        .map_err(|e| e.to_string())?;

    Ok(())
}

/// 登録済みのショートカットを全部外してから、settingsのhotkeyで登録し直す。
/// ホットキー設定を変更したときに呼ぶ。
pub fn reregister_hotkey(app: &AppHandle) -> Result<(), String> {
    app.global_shortcut()
        .unregister_all()
        .map_err(|e| e.to_string())?;
    register_hotkey(app)
}
```

- [ ] **Step 2: setting_set がホットキー変更で再登録するようにする**

`/Users/kei06/dev/smartTaskManagement/src-tauri/src/commands.rs` の `setting_set` を次の内容に差し替える。
DBのロックを先に解放してから再登録を呼ぶ（`register_hotkey` が同じロックを取るため、
ロックを持ったまま呼ぶとデッドロックする）。

```rust
#[tauri::command]
pub fn setting_set(
    app: AppHandle,
    state: State<'_, DbState>,
    key: String,
    value: String,
) -> Result<(), String> {
    {
        // ここでロックを解放してから再登録に進む（register_hotkey が同じロックを取る）
        let mut conn = state.0.lock().map_err(|_| LOCK_ERROR.to_string())?;
        repo::setting_set(&mut conn, &key, &value).map_err(|e| e.to_string())?;
    }

    // ホットキーを変えたら即座に登録し直す
    if key == repo::HOTKEY_SETTING_KEY {
        panel::reregister_hotkey(&app)?;
    }

    Ok(())
}
```

- [ ] **Step 3: lib.rs でプラグインを登録し、setup から呼ぶ**

`/Users/kei06/dev/smartTaskManagement/src-tauri/src/lib.rs` の `.plugin(tauri_nspanel::init())` の直後に次を足す。

```rust
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
```

そして `setup` の中、`panel::init_panel(app)?;` の直後に次を足す。

```rust
            // settingsのhotkeyキー（既定 Alt+Space）でグローバルショートカットを登録する
            panel::register_hotkey(app.handle())?;
```

- [ ] **Step 4: ビルドが通ることを確認する**

```bash
cd /Users/kei06/dev/smartTaskManagement/src-tauri
cargo build
```

期待する出力（末尾）:

```
    Finished `dev` profile [unoptimized + debuginfo] target(s) in ...
```

- [ ] **Step 5: 実際にトグルできることを確認する**

```bash
cd /Users/kei06/dev/smartTaskManagement
npm run tauri dev
```

起動直後はウィンドウが見えない。⌥Space を押すと画面中央に角丸のパレットが出て、もう一度押すと消える。
他アプリ（例: Finder）を前面にしたまま ⌥Space を押しても、Finder のメニューバーが変わらないまま
パレットだけが出ることを確認する（＝フォーカスを奪っていない）。確認できたら Ctrl+C で止める。

- [ ] **Step 6: 登録に成功したら hotkeyError が空になっていることを確認する**

```bash
sqlite3 ~/Library/Application\ Support/smartTask/smart-task.db "SELECT key, quote(value) FROM settings ORDER BY key;"
```

期待する出力:

```
hotkey|'Alt+Space'
hotkeyError|''
```

- [ ] **Step 7: コミット**

```bash
cd /Users/kei06/dev/smartTaskManagement
git add -A
git commit -m "feat: グローバルショートカットでのパレット切替とホットキー再登録を追加"
```

---

## Task 16: トレイ・Dock非表示・二重起動防止

**Files:**
- Modify: `/Users/kei06/dev/smartTaskManagement/src-tauri/src/panel.rs`
- Modify: `/Users/kei06/dev/smartTaskManagement/src-tauri/src/lib.rs`

- [ ] **Step 1: panel.rs にトレイ生成を足す**

`/Users/kei06/dev/smartTaskManagement/src-tauri/src/panel.rs` の import 行を次に差し替える。

```rust
use tauri::{
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
    App, AppHandle, Emitter, Manager, WebviewWindow,
};
```

ファイル末尾に次を追記する。

```rust
/// メニューバー常駐アイコン（開く / 終了）を作る。
pub fn init_tray(app: &App) -> Result<(), Box<dyn std::error::Error>> {
    let open_item = MenuItem::with_id(app, "open", "開く", true, None::<&str>)?;
    let quit_item = MenuItem::with_id(app, "quit", "終了", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&open_item, &quit_item])?;

    TrayIconBuilder::new()
        .icon(
            app.default_window_icon()
                .ok_or("既定のウィンドウアイコンが見つかりません")?
                .clone(),
        )
        .menu(&menu)
        .show_menu_on_left_click(true)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "open" => show_panel(app),
            "quit" => app.exit(0),
            _ => {}
        })
        .build(app)?;

    Ok(())
}
```

- [ ] **Step 2: lib.rs に single-instance・ActivationPolicy・トレイを足す**

`/Users/kei06/dev/smartTaskManagement/src-tauri/src/lib.rs` を次の内容にする。

```rust
mod commands;
mod db;
mod panel;

use std::sync::Mutex;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // single-instance は最初に登録しないと正しく動かない
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            // 2つ目のインスタンスが起動されたら、既存のパレットを出すだけにする
            panel::show_panel(app);
        }))
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_nspanel::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            commands::boards_list,
            commands::board_create,
            commands::board_rename,
            commands::board_delete,
            commands::statuses_list,
            commands::status_create,
            commands::status_update,
            commands::status_delete,
            commands::status_reorder,
            commands::tasks_list,
            commands::task_create,
            commands::task_update,
            commands::task_move,
            commands::task_delete,
            commands::task_restore,
            commands::setting_get,
            commands::setting_set,
            commands::palette_hide,
        ])
        .setup(|app| {
            // Dockアイコンを出さずメニューバー常駐アプリとして振る舞う
            #[cfg(target_os = "macos")]
            app.set_activation_policy(tauri::ActivationPolicy::Accessory);

            // ~/Library/Application Support/smartTask/smart-task.db
            // app_data_dir() だとバンドル識別子のディレクトリになるので data_dir() を使う
            let db_path = app
                .path()
                .data_dir()?
                .join("smartTask")
                .join("smart-task.db");
            let mut conn = db::open_at(&db_path).map_err(|e| e.to_string())?;
            db::repo::seed_if_empty(&mut conn).map_err(|e| e.to_string())?;
            app.manage(commands::DbState(Mutex::new(conn)));

            // ウィンドウをNSPanel化する
            panel::init_panel(app)?;
            // settingsのhotkeyキー（既定 Alt+Space）でグローバルショートカットを登録する
            panel::register_hotkey(app.handle())?;
            // メニューバー常駐アイコン
            panel::init_tray(app)?;

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

- [ ] **Step 3: ビルドとテストが通ることを確認する**

```bash
cd /Users/kei06/dev/smartTaskManagement/src-tauri
cargo build && cargo test --lib
```

期待する出力（末尾）:

```
    Finished `dev` profile [unoptimized + debuginfo] target(s) in ...
test result: ok. 41 passed; 0 failed; 0 ignored
```

- [ ] **Step 4: トレイと Dock 非表示を確認する**

```bash
cd /Users/kei06/dev/smartTaskManagement
npm run tauri dev
```

- メニューバー右側に smartTask のアイコンが出る
- Dock に smartTask のアイコンが**出ない**
- トレイをクリック → 「開く」でパレットが出る
- トレイ →「終了」でアプリが終わる（`npm run tauri dev` のプロセスも終了する）

- [ ] **Step 5: コミット**

```bash
cd /Users/kei06/dev/smartTaskManagement
git add -A
git commit -m "feat: メニューバートレイとDockアイコン非表示と二重起動防止を追加"
```

---

## Task 17: フロントから Esc で閉じる / ホットキー失敗を受け取る

**Files:**
- Modify: `/Users/kei06/dev/smartTaskManagement/src/App.tsx`
- Modify: `/Users/kei06/dev/smartTaskManagement/src/index.css`

- [ ] **Step 1: App.tsx に Esc ハンドラとイベント購読を足す**

`/Users/kei06/dev/smartTaskManagement/src/App.tsx` を次の内容にする。

```tsx
import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

// Rust側 panel.rs の HOTKEY_ERROR_EVENT と同じ文字列
const HOTKEY_ERROR_EVENT = "hotkey-error";
// Rust側 repo.rs の HOTKEY_ERROR_SETTING_KEY と同じ文字列
const HOTKEY_ERROR_SETTING_KEY = "hotkeyError";

function App() {
  const [hotkeyError, setHotkeyError] = useState("");

  useEffect(() => {
    // Escでパレットを閉じる。NSPanelなのでRust側のhideを呼ぶ必要がある
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        void invoke("palette_hide");
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    // ホットキー登録に失敗したらメッセージを出す（別キーへの変更は設定画面で行う）
    const unlisten = listen<string>(HOTKEY_ERROR_EVENT, (event) => {
      setHotkeyError(event.payload);
    });
    return () => {
      void unlisten.then((dispose) => dispose());
    };
  }, []);

  useEffect(() => {
    // 起動直後のイベントは listen が間に合わず取りこぼすので、settings からも読む
    void invoke<string | null>("setting_get", {
      key: HOTKEY_ERROR_SETTING_KEY,
    }).then((stored) => {
      if (stored !== null && stored !== "") {
        setHotkeyError(stored);
      }
    });
  }, []);

  return (
    <div className="palette-shell">
      <span className="palette-title">smartTask</span>
      {hotkeyError !== "" && <p className="palette-error">{hotkeyError}</p>}
    </div>
  );
}

export default App;
```

- [ ] **Step 2: エラー表示のスタイルを足す**

`/Users/kei06/dev/smartTaskManagement/src/index.css` の末尾に次を追記する。

```css
/* 器を縦並びにしてエラーメッセージをタイトルの下に置く */
.palette-shell {
  flex-direction: column;
  gap: 8px;
}

.palette-error {
  margin: 0;
  font-size: 12px;
  color: #ff3b30;
}
```

- [ ] **Step 3: フロントのビルドが通ることを確認する**

```bash
cd /Users/kei06/dev/smartTaskManagement
npm run build
```

期待する出力（末尾）:

```
✓ built in ...
```

- [ ] **Step 4: Esc で閉じることを確認する**

```bash
cd /Users/kei06/dev/smartTaskManagement
npm run tauri dev
```

⌥Space でパレットを出し、Esc を押すと消えることを確認する。確認したら Ctrl+C で止める。

- [ ] **Step 5: コミット**

```bash
cd /Users/kei06/dev/smartTaskManagement
git add -A
git commit -m "feat: Escでのパレット非表示とホットキー登録失敗の表示を追加"
```

---

## Task 18: 最終検証（自動テスト + 手動スモークチェック）

**Files:**
- 変更なし（検証のみ）

- [ ] **Step 1: Rust のテストを全部回す**

```bash
cd /Users/kei06/dev/smartTaskManagement/src-tauri
cargo test --lib
```

期待する出力:

```
test result: ok. 41 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out
```

- [ ] **Step 2: 警告が出ていないか確認する**

```bash
cd /Users/kei06/dev/smartTaskManagement/src-tauri
cargo build 2>&1 | grep -c "^warning"
```

期待する出力:

```
0
```

0 でない場合は未使用の import などが残っている。消してからコミットする。

- [ ] **Step 3: フロントの型チェックとビルド**

```bash
cd /Users/kei06/dev/smartTaskManagement
npm run build
```

期待する出力（末尾）:

```
✓ built in ...
```

- [ ] **Step 4: 手動スモークチェックを実施する**

```bash
cd /Users/kei06/dev/smartTaskManagement
npm run tauri dev
```

以下を上から順に確認する。すべて OK なら計画書1は完了。

| # | 確認項目 | 期待 |
|---|---|---|
| 1 | 起動直後 | ウィンドウは見えない。メニューバーに smartTask アイコンが出る |
| 2 | Dock | smartTask のアイコンが出ない |
| 3 | 別アプリ（Finder等）を前面にして ⌥Space | パレットが画面中央に出る。**Finder のメニューバー表示が変わらない**（フォーカスを奪っていない） |
| 4 | パレットの見た目 | 角丸16px・半透明白・後ろがぼやける・影が付く。中央に「smartTask」 |
| 5 | もう一度 ⌥Space | パレットが消える |
| 6 | パレット表示中に Esc | パレットが消える |
| 7 | 別のスペース（Mission Control）へ移動して ⌥Space | そのスペース上にパレットが出る |
| 8 | Cmd+Tab | smartTask がアプリ切替に出てこない |
| 9 | トレイ →「開く」 | パレットが出る |
| 10 | DBファイル | `ls ~/Library/Application\ Support/smartTask/smart-task.db` が存在する |
| 11 | 初回シード | `sqlite3 ~/Library/Application\ Support/smartTask/smart-task.db "SELECT name FROM boards;"` が `メイン` を返す |
| 12 | デフォルトステータス | `sqlite3 ~/Library/Application\ Support/smartTask/smart-task.db "SELECT name FROM statuses ORDER BY position;"` が `未着手 / 進行中 / 確認中 / 完了` を返す |
| 13 | ホットキー既定値 | `sqlite3 ~/Library/Application\ Support/smartTask/smart-task.db "SELECT value FROM settings WHERE key='hotkey';"` が `Alt+Space` を返す |
| 14 | ホットキーエラー欄 | `sqlite3 ~/Library/Application\ Support/smartTask/smart-task.db "SELECT quote(value) FROM settings WHERE key='hotkeyError';"` が `''`（空文字）を返す |
| 15 | ホットキー変更の即時反映 | パレット表示中に DevTools で `await __TAURI__.core.invoke("setting_set", { key: "hotkey", value: "Ctrl+Shift+T" })` を実行 → ⌥Space が効かなくなり ⌃⇧T でトグルできる。確認後 `Alt+Space` に戻す |
| 16 | 二重起動 | `npm run tauri dev` を動かしたまま、別ターミナルでビルド済みバイナリを起動しても2つ目のウィンドウが増えない |
| 17 | トレイ →「終了」 | アプリが終了する |

15番の DevTools は、パレットを右クリック → 「要素の詳細を表示」で開く（`tauri dev` では既定で有効）。
`__TAURI__` が未定義の場合は `tauri.conf.json` の `app.withGlobalTauri` を一時的に `true` にして
`npm run tauri dev` をやり直し、確認後に元へ戻すこと。

- [ ] **Step 5: チェック結果を確認してから完了を宣言する**

上の表で1つでも NG があれば、該当する Task に戻って直す。全部 OK になってから次の計画書へ進む。

---

## この計画書のスコープ外（後続の計画書で扱う）

- zustand ストア、`src/types.ts`、`src/lib/api.ts`、`hooks/useKeyboard.ts`
- カンバン盤面（Board / Lane / TaskCard）、検索バー、ドリルイン詳細、BlockNote
- ボードスイッチャー、ボード設定画面（ホットキー変更の**UI**。Rust側の再登録処理は
  `setting_set` + `panel::reregister_hotkey` として本計画書で実装済みなので、UI から
  `setting_set({ key: "hotkey", value })` を呼ぶだけでよい）
- `tauri-plugin-autostart`（ログイン時自動起動）
- Vitest + Testing Library のセットアップ
- トースト（DB書き込み失敗の通知）
