# smartTask 詳細画面・ボード管理・仕上げ 実装計画（計画書3）

> **注記(2026-08-21)**: 本計画の実行後、製品名は smartTask から **Avoliq** に正式改名された。
> 本文中の `smartTask` / `smart-task` は実行当時の記録。現行の正しい名前は実装コントラクトを参照。

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** タスク詳細（BlockNoteによるNotion風Markdown編集）・ボードスイッチャー・ボード設定・自動起動/ホットキー変更を実装し、UIUXを磨き込んで設計書の全機能を完成させる。

**Architecture:** 計画書1（Rust全コマンド）・計画書2（boardビュー＋キーボード操作）の完成状態を前提に、`view` が `"detail" | "switcher" | "settings"` のときのUIを追加する。詳細画面はBlockNoteエディタを持ち、`content_md`（Markdown文字列）とBlockNoteブロックを相互変換して500msデバウンスで自動保存する。画面外（`useKeyboard` のEscハンドラ、ウィンドウのフォーカス喪失）から保留中の保存を確定させるため、`src/lib/detailBridge.ts` という薄い橋渡しモジュールを置く。ボードCRUD・ステータスCRUDは zustandストアの公開形（実装コントラクト）を一切変えず、コンポーネントから `src/lib/api.ts` を直接呼び、成功後に `loadBoards()` / `selectBoard()` で再読込する方針を取る。

**Tech Stack:** Tauri v2 / React 18 / TypeScript / Vite / Tailwind CSS v4 / shadcn/ui / lucide-react / zustand / sonner / BlockNote 0.54.0（`@blocknote/core` + `@blocknote/react` + `@blocknote/shadcn`）/ `@tauri-apps/plugin-autostart` 2.x / `tauri-plugin-global-shortcut` 2.x / Vitest + Testing Library

---

## 前提（計画書1・2の完了状態）

この計画は以下がすでに動いている状態から始まる。

- Rust側: 実装コントラクトのTauriコマンドがすべて実装済み（`boards_list` 〜 `setting_set`）。`src-tauri/src/panel.rs` にNSPanel化・グローバルホットキー登録・トレイがある。
- フロント: `src/types.ts` / `src/lib/api.ts` / `src/store/appStore.ts` / `src/hooks/useKeyboard.ts` / `src/components/Palette.tsx` / `SearchBar.tsx` / `Board.tsx` / `Lane.tsx` / `TaskCard.tsx` が存在し、boardビューのキーボード操作が一式動く。
- shadcn/ui と sonner（`<Toaster />`）が導入済み。
- `npm test`（Vitest）と `cargo test` がグリーン。

---

## ファイル構成

**新規作成（フロント）**

| ファイル | 責務 |
|---|---|
| `src/lib/detailBridge.ts` | 詳細画面の「保留中保存の強制フラッシュ」「タイトルへフォーカス」を画面外から叩くための登録口 |
| `src/lib/statusPalette.ts` | ステータス色のプリセットパレット定義 |
| `src/lib/accelerator.ts` | KeyboardEvent ⇄ Tauriアクセラレータ文字列の変換 |
| `src/hooks/useDebouncedSave.ts` | 500msデバウンス保存＋flush |
| `src/hooks/usePrefersDark.ts` | `prefers-color-scheme: dark` の購読 |
| `src/hooks/useFlushOnHide.ts` | ウィンドウのフォーカス喪失・非表示で強制フラッシュ |
| `src/hooks/useHotkeyErrorToast.ts` | ホットキー登録失敗の通知購読＋起動時チェック |
| `src/components/TaskDetail.tsx` | 詳細画面（BlockNote・ステータスチップ・タイトル編集） |
| `src/components/BoardSwitcher.tsx` | ボード一覧・切替・作成・改名・削除 |
| `src/components/BoardSettings.tsx` | 設定画面のルート（ボードタブ／アプリタブ） |
| `src/components/StatusSettings.tsx` | ステータスの追加/削除/改名/色/並び順 |
| `src/components/AppSettings.tsx` | 自動起動トグル・ホットキー変更 |
| `src/components/ConfirmDialog.tsx` | キーボード操作の確認ダイアログ |
| `src/components/FooterHints.tsx` | viewごとのキーボードヒント |

**修正**

| ファイル | 内容 |
|---|---|
| `src/main.tsx` | BlockNoteのCSSを `index.css` より前に読み込む |
| `src/index.css` | BlockNoteのフォント/テーマ上書き、パレットのアニメーション、ダークモード |
| `src/components/Palette.tsx` | view routing に detail/switcher/settings を追加、フッターを `FooterHints` に差し替え、`useFlushOnHide` / `useHotkeyErrorToast` を装着 |
| `src/hooks/useKeyboard.ts` | detailビューのキーマップ追加、switcher/settingsビューでは早期return |
| `src-tauri/Cargo.toml` / `src-tauri/src/lib.rs` / `src-tauri/capabilities/default.json` | autostartプラグイン導入 |
| `src/App.tsx` | 計画書1が置いた暫定のホットキーエラー表示を削除（トーストに一本化） |

**触らないファイル:** `src-tauri/src/panel.rs` / `src-tauri/src/commands.rs`。
`toggle_panel` / `reregister_hotkey` / `HOTKEY_ERROR_EVENT` / `HOTKEY_ERROR_SETTING_KEY` /
`setting_set` のホットキー分岐はすべて計画書1が実装済みで、この計画書は呼ぶだけ。

**新規作成（ドキュメント）**

| ファイル | 責務 |
|---|---|
| `docs/superpowers/checklists/2026-08-20-manual-smoke.md` | 手動スモークチェックリスト |

---

## 実装上の重要な既知事実（Web確認済み）

実装前に必ず読むこと。憶測でAPIを書き換えないこと。

- **BlockNote 0.54.0 では Markdown変換は同期関数**。型定義（`@blocknote/core@0.54.0/types/src/editor/BlockNoteEditor.d.ts`）は
  `blocksToMarkdownLossy(blocks?: PartialBlock[]): string` と
  `tryParseMarkdownToBlocks(markdown: string): Block[]`。
  古い記事にある `await` 付きの書き方でも動くが、本計画では同期として書く。**バージョンは `0.54.0` で固定インストールする。**
- **`BlockNoteView` の `theme` プロパティは `"light" | "dark"` のみ**（Themeオブジェクト指定はMantine版専用）。shadcn版の色調整はCSS変数で行う。
- **BlockNoteのCSS変数**は `.bn-root` に対して指定する。フォントは `--bn-font-family`。ダークは `.bn-root[data-color-scheme="dark"]`。
- **`@blocknote/core/fonts/inter.css` は読み込まない**。設計書のUI原則でフォントは `-apple-system` 固定のため。
- `@blocknote/shadcn@0.54.0` は `tailwindcss ^4.1.12` をpeerDependencyに持つ（本プロジェクトはTailwind v4なので適合）。
- Tauri v2 JS: `getCurrentWindow().onFocusChanged(({ payload: focused }) => ...)` が `Promise<UnlistenFn>` を返す（`@tauri-apps/api/window`）。
- `tauri-plugin-global-shortcut` 2.x の `GlobalShortcut` は `register` / `on_shortcut` / `unregister_all` / `is_registered` を持つ。`app.global_shortcut()` は `GlobalShortcutExt` トレイト経由。**ただしこの計画書ではRustのホットキー処理を書かない**（下表のとおり計画書1が実装済み）。

**計画書1が実装済みで、この計画書は呼ぶだけの固定名（実装コントラクトで確定）**

| 名前 | 場所 | 備考 |
|---|---|---|
| `MAIN_WINDOW_LABEL = "main"` | `src-tauri/src/panel.rs` | メインウィンドウのラベル |
| `toggle_panel(app: &AppHandle)` | `src-tauri/src/panel.rs` | パレットの表示/非表示トグル |
| `reregister_hotkey(app: &AppHandle) -> Result<(), String>` | `src-tauri/src/panel.rs` | **アクセラレータは引数で渡さず settings の `hotkey` キーから読む** |
| `HOTKEY_ERROR_EVENT = "hotkey-error"` | `src-tauri/src/panel.rs` | 登録失敗時にemitされる。ペイロードはメッセージ文字列 |
| `HOTKEY_ERROR_SETTING_KEY = "hotkeyError"` | `src-tauri/src/db/repo.rs` | 失敗時にメッセージを書き、成功時は空文字でクリア |
| `setting_set` の `key == "hotkey"` 分岐 | `src-tauri/src/commands.rs` | **保存してから** `panel::reregister_hotkey(&app)?` を呼ぶ。invoke側のシグネチャは不変 |
| `palette_hide` コマンド | `src-tauri/src/commands.rs` | Escでのパレット非表示 |

---

### Task 1: 事前確認とBlockNote導入

**Files:**
- Modify: `package.json`
- Modify: `src/main.tsx`

- [ ] **Step 1: 既存のAPIラッパー関数名を確認する**

Run:
```bash
rg -n "export (async )?(const|function) \w+" /Users/kei06/dev/smartTaskManagement/src/lib/api.ts
```

Expected: `boardsList` / `boardCreate` / `boardRename` / `boardDelete` / `statusesList` / `statusCreate` / `statusUpdate` / `statusDelete` / `statusReorder` / `tasksList` / `taskCreate` / `taskUpdate` / `taskMove` / `taskDelete` / `taskRestore` / `settingGet` / `settingSet` の17個が並ぶ。

本計画のコード例はこの名前を使っている。もし計画書1の実装が別名（例: `listBoards`）を採用していた場合は、**api.ts側の実際の名前が正**なので、本計画のコード例のインポート名だけを合わせること（api.ts をリネームしない）。

- [ ] **Step 2: ストアの公開形を確認する**

Run:
```bash
rg -n "loadBoards|selectBoard|setView|setSelectedTask|moveSelectedTask|updateTaskContent|updateTaskTitle" /Users/kei06/dev/smartTaskManagement/src/store/appStore.ts
```

Expected: 実装コントラクトの `AppState` と同じシグネチャで定義が見つかる。
**本計画ではストアの公開形を一切変更しない。** ボード/ステータスのCRUDは `src/lib/api.ts` を直接呼び、その後 `loadBoards()` / `selectBoard()` で再読込する。

- [ ] **Step 3: Palette.tsx のview分岐とフッターの実装箇所を確認する**

Run:
```bash
rg -n "view|footer|Footer" /Users/kei06/dev/smartTaskManagement/src/components/Palette.tsx
```

Expected: `view === "board"` の分岐と、フッターのキーボードヒントがどこにあるかが分かる。Task 6でここを書き換える。

- [ ] **Step 4: BlockNoteを固定バージョンで導入する**

Run:
```bash
cd /Users/kei06/dev/smartTaskManagement && npm install --save-exact @blocknote/core@0.54.0 @blocknote/react@0.54.0 @blocknote/shadcn@0.54.0
```

Expected: `package.json` の `dependencies` に `"@blocknote/core": "0.54.0"` など3件がキャレット無しで追加される。

- [ ] **Step 5: BlockNoteのCSSを読み込む**

`src/main.tsx` の冒頭のimportを次の順序にする。`index.css` を後に読み込むことで、こちらの上書きが必ず勝つようにする。

```tsx
import React from "react";
import ReactDOM from "react-dom/client";
// BlockNoteのスタイルはアプリ側のCSSより先に読み込む(index.cssの上書きを効かせるため)
// フォントはアプリ全体で-apple-systemに揃えるため、@blocknote/core/fonts/inter.css は読み込まない
import "@blocknote/shadcn/style.css";
import App from "./App";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
```

- [ ] **Step 6: BlockNoteのフォント上書きCSSを追加する**

`src/index.css` の末尾に追記する。

```css
/* BlockNoteのフォントをアプリ全体と揃える(設計書のUI原則: -apple-system固定) */
.bn-root {
  --bn-font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Hiragino Sans",
    sans-serif;
  --bn-border-radius: 8px;
}

.bn-root .bn-editor {
  /* パレット内なので左右パディングを詰める(BlockNote既定の54pxは広すぎる) */
  padding-inline: 0;
}
```

- [ ] **Step 7: ビルドが通ることを確認する**

Run:
```bash
cd /Users/kei06/dev/smartTaskManagement && npm run build
```

Expected: エラーなく終了し `dist/` が生成される。

- [ ] **Step 8: コミット**

```bash
cd /Users/kei06/dev/smartTaskManagement
git add package.json package-lock.json src/main.tsx src/index.css
git commit -m "chore: BlockNoteを導入しフォントをアプリ全体に揃える"
```

---

### Task 2: 詳細画面の橋渡しモジュールとデバウンス保存フック

**Files:**
- Create: `src/lib/detailBridge.ts`
- Create: `src/lib/detailBridge.test.ts`
- Create: `src/hooks/useDebouncedSave.ts`
- Create: `src/hooks/useDebouncedSave.test.ts`

- [ ] **Step 1: detailBridge の失敗するテストを書く**

`src/lib/detailBridge.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  flushDetail,
  focusDetailTitle,
  registerDetailBridge,
} from "./detailBridge";

describe("detailBridge", () => {
  beforeEach(() => {
    registerDetailBridge(null);
  });

  it("登録されていないときに呼んでも例外にならない", () => {
    expect(() => flushDetail()).not.toThrow();
    expect(() => focusDetailTitle()).not.toThrow();
  });

  it("登録した関数が呼ばれる", () => {
    const flush = vi.fn();
    const focusTitle = vi.fn();
    registerDetailBridge({ flush, focusTitle });

    flushDetail();
    focusDetailTitle();

    expect(flush).toHaveBeenCalledTimes(1);
    expect(focusTitle).toHaveBeenCalledTimes(1);
  });

  it("nullで登録解除すると呼ばれなくなる", () => {
    const flush = vi.fn();
    registerDetailBridge({ flush, focusTitle: vi.fn() });
    registerDetailBridge(null);

    flushDetail();

    expect(flush).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: テストが失敗することを確認する**

Run:
```bash
cd /Users/kei06/dev/smartTaskManagement && npx vitest run src/lib/detailBridge.test.ts
```

Expected: FAIL。`Failed to resolve import "./detailBridge"` が出る。

- [ ] **Step 3: detailBridge を実装する**

`src/lib/detailBridge.ts`:

```ts
/**
 * 詳細画面(TaskDetail)の内部処理を、画面外(キーボードディスパッチャやウィンドウイベント)から
 * 叩くための橋渡し。TaskDetailがマウント時に登録し、アンマウント時にnullで解除する。
 */
export interface DetailBridge {
  /** 保留中の自動保存を即座に実行する */
  flush: () => void;
  /** タイトル入力へフォーカスする */
  focusTitle: () => void;
}

let bridge: DetailBridge | null = null;

/** 詳細画面の橋渡しを登録する。nullを渡すと解除する。 */
export function registerDetailBridge(next: DetailBridge | null): void {
  bridge = next;
}

/** 保留中の自動保存を即座に実行する。詳細画面が開いていない場合は何もしない。 */
export function flushDetail(): void {
  bridge?.flush();
}

/** 詳細画面のタイトル入力へフォーカスする。開いていない場合は何もしない。 */
export function focusDetailTitle(): void {
  bridge?.focusTitle();
}
```

- [ ] **Step 4: テストが通ることを確認する**

Run:
```bash
cd /Users/kei06/dev/smartTaskManagement && npx vitest run src/lib/detailBridge.test.ts
```

Expected: PASS（3 tests）。

- [ ] **Step 5: useDebouncedSave の失敗するテストを書く**

`src/hooks/useDebouncedSave.test.ts`:

```ts
import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useDebouncedSave } from "./useDebouncedSave";

describe("useDebouncedSave", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("500ms経過するまで保存は呼ばれない", () => {
    const save = vi.fn();
    const { result } = renderHook(() => useDebouncedSave<string>(save, 500));

    result.current.schedule("あ");
    vi.advanceTimersByTime(499);
    expect(save).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(save).toHaveBeenCalledExactlyOnceWith("あ");
  });

  it("連続入力では最後の値だけが1回保存される", () => {
    const save = vi.fn();
    const { result } = renderHook(() => useDebouncedSave<string>(save, 500));

    result.current.schedule("あ");
    vi.advanceTimersByTime(200);
    result.current.schedule("あい");
    vi.advanceTimersByTime(200);
    result.current.schedule("あいう");
    vi.advanceTimersByTime(500);

    expect(save).toHaveBeenCalledExactlyOnceWith("あいう");
  });

  it("flushで保留中の保存が即座に実行される", () => {
    const save = vi.fn();
    const { result } = renderHook(() => useDebouncedSave<string>(save, 500));

    result.current.schedule("あ");
    result.current.flush();

    expect(save).toHaveBeenCalledExactlyOnceWith("あ");

    // フラッシュ済みなのでタイマー経過で二重保存されない
    vi.advanceTimersByTime(500);
    expect(save).toHaveBeenCalledTimes(1);
  });

  it("保留が無い状態のflushでは保存が呼ばれない", () => {
    const save = vi.fn();
    const { result } = renderHook(() => useDebouncedSave<string>(save, 500));

    result.current.flush();

    expect(save).not.toHaveBeenCalled();
  });

  it("アンマウント時に保留中の保存が実行される", () => {
    const save = vi.fn();
    const { result, unmount } = renderHook(() =>
      useDebouncedSave<string>(save, 500),
    );

    result.current.schedule("あ");
    unmount();

    expect(save).toHaveBeenCalledExactlyOnceWith("あ");
  });
});
```

- [ ] **Step 6: テストが失敗することを確認する**

Run:
```bash
cd /Users/kei06/dev/smartTaskManagement && npx vitest run src/hooks/useDebouncedSave.test.ts
```

Expected: FAIL。`Failed to resolve import "./useDebouncedSave"` が出る。

- [ ] **Step 7: useDebouncedSave を実装する**

`src/hooks/useDebouncedSave.ts`:

```ts
import { useCallback, useEffect, useRef } from "react";

export interface DebouncedSave<T> {
  /** 値の保存を予約する。遅延時間内に再度呼ぶと後の値で上書きされる。 */
  schedule: (value: T) => void;
  /** 保留中の保存を即座に実行する。保留が無ければ何もしない。 */
  flush: () => void;
}

/**
 * 値の変更を指定ミリ秒デバウンスして保存する。
 * Escでの離脱やウィンドウ非表示に備えて、保留分を確定させるflushを返す。
 */
export function useDebouncedSave<T>(
  save: (value: T) => void | Promise<void>,
  delayMs = 500,
): DebouncedSave<T> {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRef = useRef<{ value: T } | null>(null);
  const saveRef = useRef(save);
  // 常に最新のsave関数を参照する(依存配列でタイマーを張り直さないため)
  saveRef.current = save;

  const run = useCallback(() => {
    const pending = pendingRef.current;
    if (pending === null) return;
    pendingRef.current = null;
    void saveRef.current(pending.value);
  }, []);

  const flush = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    run();
  }, [run]);

  const schedule = useCallback(
    (value: T) => {
      pendingRef.current = { value };
      if (timerRef.current !== null) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        run();
      }, delayMs);
    },
    [delayMs, run],
  );

  // アンマウント時に保留分を保存して取りこぼしを防ぐ
  useEffect(() => () => flush(), [flush]);

  return { schedule, flush };
}
```

- [ ] **Step 8: テストが通ることを確認する**

Run:
```bash
cd /Users/kei06/dev/smartTaskManagement && npx vitest run src/hooks/useDebouncedSave.test.ts
```

Expected: PASS（5 tests）。

- [ ] **Step 9: コミット**

```bash
cd /Users/kei06/dev/smartTaskManagement
git add src/lib/detailBridge.ts src/lib/detailBridge.test.ts src/hooks/useDebouncedSave.ts src/hooks/useDebouncedSave.test.ts
git commit -m "feat: 詳細画面の強制フラッシュ橋渡しとデバウンス保存フックを追加"
```

---

### Task 3: TaskDetail の骨格（ヘッダー・ステータスチップ・タイトル編集）

**Files:**
- Create: `src/hooks/usePrefersDark.ts`
- Create: `src/components/TaskDetail.tsx`
- Create: `src/components/TaskDetail.test.tsx`

- [ ] **Step 1: usePrefersDark を実装する**

`src/hooks/usePrefersDark.ts`:

```ts
import { useEffect, useState } from "react";

/** OSのダークモード設定(prefers-color-scheme)を購読する */
export function usePrefersDark(): boolean {
  const [isDark, setIsDark] = useState(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches,
  );

  useEffect(() => {
    const query = window.matchMedia("(prefers-color-scheme: dark)");
    const handle = (event: MediaQueryListEvent) => setIsDark(event.matches);
    query.addEventListener("change", handle);
    return () => query.removeEventListener("change", handle);
  }, []);

  return isDark;
}
```

- [ ] **Step 2: TaskDetail の失敗するテストを書く**

`src/components/TaskDetail.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Board, Status, Task } from "../types";
import { useAppStore } from "../store/appStore";
import { TaskDetail } from "./TaskDetail";

// BlockNoteはjsdomで動かないためモックする(実挙動はTask 4の手動確認でカバーする)
vi.mock("@blocknote/react", () => ({
  useCreateBlockNote: () => ({
    document: [],
    tryParseMarkdownToBlocks: (md: string) => [
      { id: "b1", type: "paragraph", content: md },
    ],
    blocksToMarkdownLossy: () => "本文",
    replaceBlocks: () => undefined,
  }),
}));

vi.mock("@blocknote/shadcn", () => ({
  BlockNoteView: () => <div data-testid="blocknote-view" />,
}));

const updateTaskTitle = vi.fn(async () => undefined);
const moveSelectedTask = vi.fn(async () => undefined);

const board: Board = { id: "board-1", name: "メイン", position: 0 };

const statuses: Status[] = [
  {
    id: "st-1",
    boardId: "board-1",
    name: "未着手",
    color: "#8E8E93",
    position: 0,
  },
  {
    id: "st-2",
    boardId: "board-1",
    name: "進行中",
    color: "#007AFF",
    position: 1,
  },
];

const task: Task = {
  id: "task-1",
  boardId: "board-1",
  statusId: "st-2",
  title: "設計書を書く",
  contentMd: "# 見出し",
  position: 0,
  createdAt: "2026-08-20 10:00:00",
  updatedAt: "2026-08-20 10:00:00",
};

describe("TaskDetail", () => {
  beforeEach(() => {
    updateTaskTitle.mockClear();
    moveSelectedTask.mockClear();
    useAppStore.setState({
      boards: [board],
      currentBoardId: "board-1",
      statuses,
      tasks: [task],
      selectedTaskId: "task-1",
      view: "detail",
      updateTaskTitle,
      moveSelectedTask,
    });
  });

  it("タイトルとステータス名を表示する", () => {
    render(<TaskDetail />);

    expect(screen.getByDisplayValue("設計書を書く")).toBeInTheDocument();
    expect(screen.getByText("進行中")).toBeInTheDocument();
  });

  it("ボードに戻るヘッダーボタンがEscラベル付きで表示される", () => {
    render(<TaskDetail />);

    expect(
      screen.getByRole("button", { name: "ボードに戻る (Esc)" }),
    ).toBeInTheDocument();
  });

  it("エディタが描画される", () => {
    render(<TaskDetail />);

    expect(screen.getByTestId("blocknote-view")).toBeInTheDocument();
  });

  it("タイトルを編集すると500ms後に保存される", async () => {
    const user = userEvent.setup();
    render(<TaskDetail />);

    const input = screen.getByDisplayValue("設計書を書く");
    await user.clear(input);
    await user.type(input, "実装する");

    await vi.waitFor(
      () => {
        expect(updateTaskTitle).toHaveBeenCalledWith("task-1", "実装する");
      },
      { timeout: 2000 },
    );
  });

  it("ステータスチップの右矢印ボタンでステータスが右へ移動する", async () => {
    const user = userEvent.setup();
    render(<TaskDetail />);

    await user.click(
      screen.getByRole("button", { name: "次のステータスへ (⌘→)" }),
    );

    expect(moveSelectedTask).toHaveBeenCalledWith("right");
  });
});
```

- [ ] **Step 3: テストが失敗することを確認する**

Run:
```bash
cd /Users/kei06/dev/smartTaskManagement && npx vitest run src/components/TaskDetail.test.tsx
```

Expected: FAIL。`Failed to resolve import "./TaskDetail"` が出る。

- [ ] **Step 4: TaskDetail を実装する**

`src/components/TaskDetail.tsx`:

```tsx
import { useCreateBlockNote } from "@blocknote/react";
import { BlockNoteView } from "@blocknote/shadcn";
import { ArrowLeft, ChevronLeft, ChevronRight } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useDebouncedSave } from "../hooks/useDebouncedSave";
import { usePrefersDark } from "../hooks/usePrefersDark";
import { registerDetailBridge } from "../lib/detailBridge";
import { useAppStore } from "../store/appStore";

/**
 * タスク詳細画面。BlockNoteでNotion風にMarkdownを編集し、500msデバウンスで自動保存する。
 * 保存ボタンは無く、Escでボードへ戻る前に保留分をフラッシュする。
 */
export function TaskDetail() {
  const tasks = useAppStore((state) => state.tasks);
  const statuses = useAppStore((state) => state.statuses);
  const selectedTaskId = useAppStore((state) => state.selectedTaskId);
  const setView = useAppStore((state) => state.setView);
  const updateTaskContent = useAppStore((state) => state.updateTaskContent);
  const updateTaskTitle = useAppStore((state) => state.updateTaskTitle);
  const moveSelectedTask = useAppStore((state) => state.moveSelectedTask);

  const task = tasks.find((item) => item.id === selectedTaskId) ?? null;
  const status = statuses.find((item) => item.id === task?.statusId) ?? null;

  const [title, setTitle] = useState(task?.title ?? "");
  const titleRef = useRef<HTMLInputElement>(null);
  const isDark = usePrefersDark();

  const editor = useCreateBlockNote();
  // 初期読み込み中のonChangeを保存として拾わないためのフラグ
  const loadingRef = useRef(true);

  const contentSave = useDebouncedSave<string>((markdown) => {
    if (task === null) return;
    void updateTaskContent(task.id, markdown);
  }, 500);

  const titleSave = useDebouncedSave<string>((value) => {
    if (task === null) return;
    void updateTaskTitle(task.id, value);
  }, 500);

  const flushAll = useCallback(() => {
    contentSave.flush();
    titleSave.flush();
  }, [contentSave, titleSave]);

  // 画面外(useKeyboardのEsc・ウィンドウのフォーカス喪失)から叩けるように登録する
  useEffect(() => {
    registerDetailBridge({
      flush: flushAll,
      focusTitle: () => {
        titleRef.current?.focus();
        titleRef.current?.select();
      },
    });
    return () => registerDetailBridge(null);
  }, [flushAll]);

  // Markdown文字列をBlockNoteのブロックへ変換して流し込む(タスクが変わったときだけ)
  useEffect(() => {
    if (task === null) return;
    loadingRef.current = true;
    const blocks = editor.tryParseMarkdownToBlocks(task.contentMd);
    editor.replaceBlocks(
      editor.document,
      blocks.length > 0 ? blocks : [{ type: "paragraph" }],
    );
    loadingRef.current = false;
    // contentMdは保存のたびに変わるが、再流し込みするとカーソルが飛ぶのでidだけを見る
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, task?.id]);

  const handleEditorChange = useCallback(() => {
    if (loadingRef.current) return;
    // 0.54系ではblocksToMarkdownLossyは同期でstringを返す
    const markdown = editor.blocksToMarkdownLossy(editor.document);
    contentSave.schedule(markdown);
  }, [contentSave, editor]);

  const handleBack = useCallback(() => {
    flushAll();
    setView("board");
  }, [flushAll, setView]);

  if (task === null) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-neutral-500">
        タスクが選択されていません
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-2 px-4 pb-3 pt-4">
        <button
          type="button"
          aria-label="ボードに戻る (Esc)"
          onClick={handleBack}
          className="flex items-center gap-1 rounded-md px-2 py-1 text-sm text-neutral-600 transition-colors hover:bg-black/5"
        >
          <ArrowLeft size={16} />
          <span>ボード</span>
        </button>

        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            aria-label="前のステータスへ (⌘←)"
            onClick={() => void moveSelectedTask("left")}
            className="rounded-md p-1 text-neutral-500 transition-colors hover:bg-black/5"
          >
            <ChevronLeft size={16} />
          </button>
          <span
            className="rounded-full px-3 py-1 text-xs font-medium"
            style={{
              backgroundColor: `${status?.color ?? "#8E8E93"}1F`,
              color: status?.color ?? "#8E8E93",
            }}
          >
            {status?.name ?? "未分類"}
          </span>
          <button
            type="button"
            aria-label="次のステータスへ (⌘→)"
            onClick={() => void moveSelectedTask("right")}
            className="rounded-md p-1 text-neutral-500 transition-colors hover:bg-black/5"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </header>

      <input
        ref={titleRef}
        value={title}
        onChange={(event) => {
          setTitle(event.target.value);
          titleSave.schedule(event.target.value);
        }}
        aria-label="タスクのタイトル"
        placeholder="タイトルを入力"
        className="mx-4 mb-2 bg-transparent text-xl font-semibold text-neutral-900 outline-none placeholder:text-neutral-400"
      />

      <div className="min-h-0 flex-1 overflow-y-auto px-1 pb-2">
        <BlockNoteView
          editor={editor}
          theme={isDark ? "dark" : "light"}
          onChange={handleEditorChange}
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 5: テストが通ることを確認する**

Run:
```bash
cd /Users/kei06/dev/smartTaskManagement && npx vitest run src/components/TaskDetail.test.tsx
```

Expected: PASS（5 tests）。

- [ ] **Step 6: Palette に detail ビューを繋ぐ**

`src/components/Palette.tsx` の view 分岐に detail を追加する。`key` を渡してタスクが変わるたびエディタを作り直す。

```tsx
import { TaskDetail } from "./TaskDetail";

// ...Palette コンポーネント内の描画部分
{view === "detail" && <TaskDetail key={selectedTaskId ?? "none"} />}
```

`selectedTaskId` をまだ購読していない場合は、コンポーネント冒頭に次を追加する。

```tsx
const selectedTaskId = useAppStore((state) => state.selectedTaskId);
```

- [ ] **Step 7: 型チェックとテスト一式を通す**

Run:
```bash
cd /Users/kei06/dev/smartTaskManagement && npx tsc --noEmit && npx vitest run
```

Expected: 型エラーなし。全テストPASS。

- [ ] **Step 8: コミット**

```bash
cd /Users/kei06/dev/smartTaskManagement
git add src/hooks/usePrefersDark.ts src/components/TaskDetail.tsx src/components/TaskDetail.test.tsx src/components/Palette.tsx
git commit -m "feat: タスク詳細画面の骨格とタイトル自動保存を追加"
```

---

### Task 4: BlockNote統合の実挙動確認（Markdown相互変換・自動保存）

BlockNoteの実挙動はjsdomで再現できないため、このタスクは**手動確認で代替する**（設計書のテスト方針「E2Eは手動スモークで代替」に沿う）。

**Files:**
- Modify: `src/components/TaskDetail.tsx`（必要に応じて）

- [ ] **Step 1: 開発サーバでアプリを起動する**

Run:
```bash
cd /Users/kei06/dev/smartTaskManagement && npm run tauri dev
```

Expected: パレットが表示され、boardビューが出る。

- [ ] **Step 2: 新規タスクを作って本文を書く**

操作: 検索バーに `テスト本文` と入力 → Enter → 詳細画面が開く → 本文に次を順に入力する。

```
# 見出し1
- リスト項目
- [ ] チェック項目
```

Expected: `# ` を打った瞬間に見出しブロックへ、`- ` でリスト、`- [ ] ` でチェックボックスへライブ変換される。

- [ ] **Step 3: 自動保存されていることをDBで確認する**

入力後2秒待ってから別ターミナルで実行する。

Run:
```bash
sqlite3 ~/Library/Application\ Support/smartTask/smart-task.db \
  "SELECT title, content_md FROM tasks WHERE deleted_at IS NULL ORDER BY updated_at DESC LIMIT 1;"
```

Expected: `テスト本文|# 見出し1\n\n- リスト項目\n\n- [ ] チェック項目` のように、Markdownテキストがそのまま入っている。

- [ ] **Step 4: 再入場で本文が復元されることを確認する**

操作: Esc でボードへ戻り、同じカードを Enter で開き直す。

Expected: 見出し・リスト・チェックボックスがブロックとして復元されている（生の `# ` が見えていたら `tryParseMarkdownToBlocks` の呼び出し漏れ）。

- [ ] **Step 5: フォントがSF Proになっていることを確認する**

操作: エディタ内で右クリック → 「要素の詳細を検査」→ `.bn-editor` の computed `font-family` を見る。

Expected: `-apple-system` から始まる。Interが出ていたら `src/main.tsx` のimport順か `src/index.css` の `.bn-root` 指定を見直す。

- [ ] **Step 6: 見つかった不具合があれば TaskDetail.tsx を修正して再確認する**

修正が必要になりやすい箇所は次の2つ。
1. 本文が空のタスクでエディタがクラッシュする → `blocks.length > 0 ? blocks : [{ type: "paragraph" }]` のフォールバックが効いているか確認。
2. 保存のたびにカーソルが先頭へ飛ぶ → 流し込みの `useEffect` の依存配列が `[editor, task?.id]` になっているか確認（`task` 全体になっていると毎保存で再流し込みが走る）。

- [ ] **Step 7: コミット（修正があった場合のみ）**

```bash
cd /Users/kei06/dev/smartTaskManagement
git add src/components/TaskDetail.tsx
git commit -m "fix: BlockNoteのMarkdown流し込みとカーソル維持を調整"
```

---

### Task 5: 保留中保存の強制フラッシュ（ウィンドウ非表示・フォーカス喪失）

**Files:**
- Create: `src/hooks/useFlushOnHide.ts`
- Create: `src/hooks/useFlushOnHide.test.ts`
- Modify: `src/components/Palette.tsx`

- [ ] **Step 1: 失敗するテストを書く**

`src/hooks/useFlushOnHide.test.ts`:

```ts
import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registerDetailBridge } from "../lib/detailBridge";
import { useFlushOnHide } from "./useFlushOnHide";

const onFocusChanged = vi.fn();

vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({
    onFocusChanged: (handler: (event: { payload: boolean }) => void) => {
      onFocusChanged(handler);
      return Promise.resolve(() => undefined);
    },
  }),
}));

describe("useFlushOnHide", () => {
  let flush: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    flush = vi.fn();
    onFocusChanged.mockClear();
    registerDetailBridge({ flush, focusTitle: vi.fn() });
  });

  afterEach(() => {
    registerDetailBridge(null);
  });

  it("ウィンドウのフォーカスが外れるとフラッシュする", async () => {
    renderHook(() => useFlushOnHide());

    await vi.waitFor(() => expect(onFocusChanged).toHaveBeenCalled());
    const handler = onFocusChanged.mock.calls[0][0];

    handler({ payload: false });
    expect(flush).toHaveBeenCalledTimes(1);

    handler({ payload: true });
    expect(flush).toHaveBeenCalledTimes(1);
  });

  it("WebViewが非表示になるとフラッシュする", () => {
    renderHook(() => useFlushOnHide());

    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => "hidden",
    });
    document.dispatchEvent(new Event("visibilitychange"));

    expect(flush).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: テストが失敗することを確認する**

Run:
```bash
cd /Users/kei06/dev/smartTaskManagement && npx vitest run src/hooks/useFlushOnHide.test.ts
```

Expected: FAIL。`Failed to resolve import "./useFlushOnHide"` が出る。

- [ ] **Step 3: useFlushOnHide を実装する**

`src/hooks/useFlushOnHide.ts`:

```ts
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useEffect } from "react";
import { flushDetail } from "../lib/detailBridge";

/**
 * パレットが隠れる・フォーカスを失う・WebViewが非表示になる瞬間に、
 * 詳細画面の保留中の自動保存を確定させる。Escで即閉じても内容を失わないための保険。
 */
export function useFlushOnHide(): void {
  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | null = null;

    void getCurrentWindow()
      .onFocusChanged(({ payload: focused }) => {
        if (!focused) flushDetail();
      })
      .then((fn) => {
        if (disposed) fn();
        else unlisten = fn;
      });

    const handleVisibility = () => {
      if (document.visibilityState === "hidden") flushDetail();
    };
    const handleUnload = () => flushDetail();

    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("beforeunload", handleUnload);

    return () => {
      disposed = true;
      unlisten?.();
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("beforeunload", handleUnload);
    };
  }, []);
}
```

- [ ] **Step 4: テストが通ることを確認する**

Run:
```bash
cd /Users/kei06/dev/smartTaskManagement && npx vitest run src/hooks/useFlushOnHide.test.ts
```

Expected: PASS（2 tests）。

- [ ] **Step 5: Palette に装着する**

`src/components/Palette.tsx` のコンポーネント本体の先頭付近に追加する。

```tsx
import { useFlushOnHide } from "../hooks/useFlushOnHide";

// ...Palette コンポーネント内
  useFlushOnHide();
```

- [ ] **Step 6: 実機で取りこぼしが無いことを確認する**

Run:
```bash
cd /Users/kei06/dev/smartTaskManagement && npm run tauri dev
```

操作: 詳細画面で本文を1文字打った直後（500ms待たずに）⌥Space でパレットを隠す → 3秒待つ → 別ターミナルでDBを確認する。

```bash
sqlite3 ~/Library/Application\ Support/smartTask/smart-task.db \
  "SELECT content_md FROM tasks WHERE deleted_at IS NULL ORDER BY updated_at DESC LIMIT 1;"
```

Expected: 打った1文字が保存されている。

- [ ] **Step 7: コミット**

```bash
cd /Users/kei06/dev/smartTaskManagement
git add src/hooks/useFlushOnHide.ts src/hooks/useFlushOnHide.test.ts src/components/Palette.tsx
git commit -m "feat: パレット非表示時に本文の保留保存を強制フラッシュする"
```

---

### Task 6: detailビューのキーマップとフッターヒント

**Files:**
- Modify: `src/hooks/useKeyboard.ts`
- Create: `src/components/FooterHints.tsx`
- Create: `src/components/FooterHints.test.tsx`
- Modify: `src/components/Palette.tsx`

- [ ] **Step 1: useKeyboard のディスパッチ構造を確認する**

Run:
```bash
rg -n "view ===|switch \(|addEventListener" /Users/kei06/dev/smartTaskManagement/src/hooks/useKeyboard.ts
```

Expected: `view === "board"` でboard用ハンドラへ分岐している箇所が見つかる。次のステップではその分岐に detail を足す。

- [ ] **Step 2: detailビューのハンドラを追加する**

`src/hooks/useKeyboard.ts` に次の関数を追加する（ファイル内のトップレベル）。

```ts
import { flushDetail, focusDetailTitle } from "../lib/detailBridge";

/**
 * 詳細画面のキーマップ。
 * Esc=保存を確定してボードへ戻る / ⌘←→=ステータス変更 / ⌘T=タイトルへフォーカス
 */
function handleDetailKey(event: KeyboardEvent): void {
  const store = useAppStore.getState();

  if (event.key === "Escape") {
    event.preventDefault();
    flushDetail();
    store.setView("board");
    return;
  }

  if (event.metaKey && event.key === "ArrowLeft") {
    event.preventDefault();
    void store.moveSelectedTask("left");
    return;
  }

  if (event.metaKey && event.key === "ArrowRight") {
    event.preventDefault();
    void store.moveSelectedTask("right");
    return;
  }

  if (event.metaKey && (event.key === "t" || event.key === "T")) {
    event.preventDefault();
    focusDetailTitle();
  }
}
```

- [ ] **Step 3: ディスパッチにdetailを繋ぎ、switcher/settingsは各コンポーネントに委ねる**

`useKeyboard.ts` の keydown ハンドラ本体の view 分岐を次の形にする。

```ts
    if (view === "detail") {
      handleDetailKey(event);
      return;
    }
    // スイッチャーと設定は入力欄やモード状態を持つため、各コンポーネント側でキーを処理する
    if (view === "switcher" || view === "settings") {
      return;
    }
    // 以下は既存のboardビューの処理
```

- [ ] **Step 4: FooterHints の失敗するテストを書く**

`src/components/FooterHints.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FooterHints } from "./FooterHints";

describe("FooterHints", () => {
  it("boardビューではボード操作のヒントを出す", () => {
    render(<FooterHints view="board" />);

    expect(screen.getByText("⌘B")).toBeInTheDocument();
    expect(screen.getByText("ボード切替")).toBeInTheDocument();
  });

  it("detailビューでは詳細画面のヒントに差し替わる", () => {
    render(<FooterHints view="detail" />);

    expect(screen.getByText("⌘T")).toBeInTheDocument();
    expect(screen.getByText("タイトル")).toBeInTheDocument();
    expect(screen.getByText("ボードに戻る")).toBeInTheDocument();
    expect(screen.queryByText("⌘B")).not.toBeInTheDocument();
  });

  it("switcherビューではボード管理のヒントを出す", () => {
    render(<FooterHints view="switcher" />);

    expect(screen.getByText("新規ボード")).toBeInTheDocument();
  });

  it("settingsビューでは設定のヒントを出す", () => {
    render(<FooterHints view="settings" />);

    expect(screen.getByText("タブ切替")).toBeInTheDocument();
  });
});
```

- [ ] **Step 5: テストが失敗することを確認する**

Run:
```bash
cd /Users/kei06/dev/smartTaskManagement && npx vitest run src/components/FooterHints.test.tsx
```

Expected: FAIL。`Failed to resolve import "./FooterHints"` が出る。

- [ ] **Step 6: FooterHints を実装する**

`src/components/FooterHints.tsx`:

```tsx
import type { View } from "../types";

type Hint = readonly [key: string, label: string];

/** viewごとに出すキーボードヒント。設計書のキーボード操作仕様と1対1で対応させる。 */
const HINTS: Record<View, readonly Hint[]> = {
  board: [
    ["↑↓←→", "移動"],
    ["Enter", "開く"],
    ["⌘←→", "ステータス"],
    ["⌘⌫", "削除"],
    ["⌘B", "ボード切替"],
    ["⌘,", "設定"],
    ["Esc", "閉じる"],
  ],
  detail: [
    ["⌘←→", "ステータス"],
    ["⌘T", "タイトル"],
    ["Esc", "ボードに戻る"],
  ],
  switcher: [
    ["↑↓", "選択"],
    ["Enter", "切替"],
    ["N", "新規ボード"],
    ["R", "改名"],
    ["⌘⌫", "削除"],
    ["Esc", "戻る"],
  ],
  settings: [
    ["↑↓", "選択"],
    ["Enter", "改名"],
    ["C", "色"],
    ["⌘↑↓", "並び替え"],
    ["N", "追加"],
    ["⌘⌫", "削除"],
    ["Tab", "タブ切替"],
    ["Esc", "戻る"],
  ],
};

/** パレット下部に常時表示するキーボードヒント */
export function FooterHints({ view }: { view: View }) {
  return (
    <footer className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-black/5 px-4 py-2 text-[11px] text-neutral-500">
      {HINTS[view].map(([key, label]) => (
        <span key={key} className="flex items-center gap-1">
          <kbd className="rounded border border-black/10 bg-black/[0.03] px-1.5 py-0.5 font-medium">
            {key}
          </kbd>
          <span>{label}</span>
        </span>
      ))}
    </footer>
  );
}
```

- [ ] **Step 7: テストが通ることを確認する**

Run:
```bash
cd /Users/kei06/dev/smartTaskManagement && npx vitest run src/components/FooterHints.test.tsx
```

Expected: PASS（4 tests）。

- [ ] **Step 8: Palette のフッターを差し替える**

`src/components/Palette.tsx` の既存のフッター（インラインのキーボードヒント）を削除し、次に置き換える。

```tsx
import { FooterHints } from "./FooterHints";

// ...Palette の描画部分の末尾
      <FooterHints view={view} />
```

- [ ] **Step 9: 全テストと型チェックを通す**

Run:
```bash
cd /Users/kei06/dev/smartTaskManagement && npx tsc --noEmit && npx vitest run
```

Expected: 型エラーなし。全テストPASS。

- [ ] **Step 10: コミット**

```bash
cd /Users/kei06/dev/smartTaskManagement
git add src/hooks/useKeyboard.ts src/components/FooterHints.tsx src/components/FooterHints.test.tsx src/components/Palette.tsx
git commit -m "feat: 詳細画面のキーマップとview別フッターヒントを追加"
```

---

### Task 7: BoardSwitcher（一覧・選択・切替）

**Files:**
- Create: `src/components/BoardSwitcher.tsx`
- Create: `src/components/BoardSwitcher.test.tsx`
- Modify: `src/components/Palette.tsx`

- [ ] **Step 1: 失敗するテストを書く**

`src/components/BoardSwitcher.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Board } from "../types";
import { useAppStore } from "../store/appStore";
import { BoardSwitcher } from "./BoardSwitcher";

vi.mock("../lib/api", () => ({
  boardCreate: vi.fn(),
  boardRename: vi.fn(),
  boardDelete: vi.fn(),
}));

const boards: Board[] = [
  { id: "b1", name: "メイン", position: 0 },
  { id: "b2", name: "仕事", position: 1 },
  { id: "b3", name: "個人", position: 2 },
];

const selectBoard = vi.fn(async () => undefined);
const setView = vi.fn();

describe("BoardSwitcher 一覧と切替", () => {
  beforeEach(() => {
    selectBoard.mockClear();
    setView.mockClear();
    useAppStore.setState({
      boards,
      currentBoardId: "b1",
      statuses: [],
      tasks: [],
      selectedTaskId: null,
      view: "switcher",
      selectBoard,
      setView,
    });
  });

  it("全ボードと新規ボード項目を表示する", () => {
    render(<BoardSwitcher />);

    expect(screen.getByText("メイン")).toBeInTheDocument();
    expect(screen.getByText("仕事")).toBeInTheDocument();
    expect(screen.getByText("個人")).toBeInTheDocument();
    expect(screen.getByText("新規ボード")).toBeInTheDocument();
  });

  it("初期選択は現在のボードにあわせる", () => {
    useAppStore.setState({ currentBoardId: "b2" });
    render(<BoardSwitcher />);

    expect(screen.getByRole("option", { name: /仕事/ })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  it("↓で選択が下へ移動する", async () => {
    const user = userEvent.setup();
    render(<BoardSwitcher />);

    await user.keyboard("{ArrowDown}");

    expect(screen.getByRole("option", { name: /仕事/ })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  it("Enterで選択中のボードへ切り替えてboardビューへ戻る", async () => {
    const user = userEvent.setup();
    render(<BoardSwitcher />);

    await user.keyboard("{ArrowDown}{Enter}");

    expect(selectBoard).toHaveBeenCalledWith("b2");
    expect(setView).toHaveBeenCalledWith("board");
  });

  it("⌘3で3枚目のボードへ直接切り替わる", async () => {
    const user = userEvent.setup();
    render(<BoardSwitcher />);

    await user.keyboard("{Meta>}3{/Meta}");

    expect(selectBoard).toHaveBeenCalledWith("b3");
    expect(setView).toHaveBeenCalledWith("board");
  });

  it("Escでboardビューへ戻る", async () => {
    const user = userEvent.setup();
    render(<BoardSwitcher />);

    await user.keyboard("{Escape}");

    expect(setView).toHaveBeenCalledWith("board");
    expect(selectBoard).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: テストが失敗することを確認する**

Run:
```bash
cd /Users/kei06/dev/smartTaskManagement && npx vitest run src/components/BoardSwitcher.test.tsx
```

Expected: FAIL。`Failed to resolve import "./BoardSwitcher"` が出る。

- [ ] **Step 3: BoardSwitcher を一覧・切替だけ実装する**

`src/components/BoardSwitcher.tsx`:

```tsx
import { Check, Plus } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useAppStore } from "../store/appStore";

/**
 * ボードスイッチャー(⌘Bで開く)。
 * ↑↓で選択、Enterで切替。リスト末尾の「新規ボード」で作成に入る。
 */
export function BoardSwitcher() {
  const boards = useAppStore((state) => state.boards);
  const currentBoardId = useAppStore((state) => state.currentBoardId);
  const selectBoard = useAppStore((state) => state.selectBoard);
  const setView = useAppStore((state) => state.setView);

  // インデックスが boards.length のときは「新規ボード」項目を指す
  const [index, setIndex] = useState(() => {
    const found = boards.findIndex((board) => board.id === currentBoardId);
    return found >= 0 ? found : 0;
  });
  const containerRef = useRef<HTMLDivElement>(null);

  // 開いた直後からキーを受け取れるようにフォーカスする
  useEffect(() => {
    containerRef.current?.focus();
  }, []);

  const openBoard = (boardId: string) => {
    void selectBoard(boardId);
    setView("board");
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const lastIndex = boards.length; // 「新規ボード」項目の位置

    if (event.metaKey && /^[1-9]$/.test(event.key)) {
      const target = boards[Number(event.key) - 1];
      if (target !== undefined) {
        event.preventDefault();
        openBoard(target.id);
      }
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      setView("board");
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setIndex((prev) => Math.min(prev + 1, lastIndex));
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setIndex((prev) => Math.max(prev - 1, 0));
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      const target = boards[index];
      if (target !== undefined) openBoard(target.id);
    }
  };

  return (
    <div
      ref={containerRef}
      tabIndex={-1}
      role="listbox"
      aria-label="ボード一覧"
      onKeyDown={handleKeyDown}
      className="flex h-full flex-col gap-1 overflow-y-auto p-3 outline-none"
    >
      {boards.map((board, i) => (
        <div
          key={board.id}
          role="option"
          aria-selected={i === index}
          className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${
            i === index ? "bg-black/[0.06]" : ""
          }`}
        >
          <span className="w-5 shrink-0 text-xs text-neutral-400">
            {i < 9 ? `⌘${i + 1}` : ""}
          </span>
          <span className="flex-1 truncate text-neutral-900">{board.name}</span>
          {board.id === currentBoardId && (
            <Check size={14} className="text-neutral-500" />
          )}
        </div>
      ))}

      <div
        role="option"
        aria-selected={index === boards.length}
        className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-neutral-500 ${
          index === boards.length ? "bg-black/[0.06]" : ""
        }`}
      >
        <span className="w-5 shrink-0" />
        <Plus size={14} />
        <span>新規ボード</span>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: テストが通ることを確認する**

Run:
```bash
cd /Users/kei06/dev/smartTaskManagement && npx vitest run src/components/BoardSwitcher.test.tsx
```

Expected: PASS（6 tests）。

- [ ] **Step 5: Palette に switcher ビューを繋ぐ**

`src/components/Palette.tsx` に追加する。

```tsx
import { BoardSwitcher } from "./BoardSwitcher";

// ...描画部分
{view === "switcher" && <BoardSwitcher />}
```

- [ ] **Step 6: コミット**

```bash
cd /Users/kei06/dev/smartTaskManagement
git add src/components/BoardSwitcher.tsx src/components/BoardSwitcher.test.tsx src/components/Palette.tsx
git commit -m "feat: ボードスイッチャーの一覧表示とキーボード切替を追加"
```

---

### Task 8: BoardSwitcher の新規作成・改名・削除

**Files:**
- Create: `src/components/ConfirmDialog.tsx`
- Create: `src/components/ConfirmDialog.test.tsx`
- Modify: `src/components/BoardSwitcher.tsx`
- Modify: `src/components/BoardSwitcher.test.tsx`

- [ ] **Step 1: ConfirmDialog の失敗するテストを書く**

`src/components/ConfirmDialog.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ConfirmDialog } from "./ConfirmDialog";

describe("ConfirmDialog", () => {
  it("タイトルと説明を表示する", () => {
    render(
      <ConfirmDialog
        title="ボードを削除しますか？"
        description="このボードのタスクとステータスもすべて削除されます。"
        confirmLabel="削除する"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.getByText("ボードを削除しますか？")).toBeInTheDocument();
    expect(
      screen.getByText(
        "このボードのタスクとステータスもすべて削除されます。",
      ),
    ).toBeInTheDocument();
  });

  it("EnterでonConfirmが呼ばれる", async () => {
    const onConfirm = vi.fn();
    const user = userEvent.setup();
    render(
      <ConfirmDialog
        title="削除しますか？"
        description="元に戻せません。"
        confirmLabel="削除する"
        onConfirm={onConfirm}
        onCancel={vi.fn()}
      />,
    );

    await user.keyboard("{Enter}");

    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("EscでonCancelが呼ばれる", async () => {
    const onCancel = vi.fn();
    const user = userEvent.setup();
    render(
      <ConfirmDialog
        title="削除しますか？"
        description="元に戻せません。"
        confirmLabel="削除する"
        onConfirm={vi.fn()}
        onCancel={onCancel}
      />,
    );

    await user.keyboard("{Escape}");

    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: テストが失敗することを確認する**

Run:
```bash
cd /Users/kei06/dev/smartTaskManagement && npx vitest run src/components/ConfirmDialog.test.tsx
```

Expected: FAIL。`Failed to resolve import "./ConfirmDialog"` が出る。

- [ ] **Step 3: ConfirmDialog を実装する**

`src/components/ConfirmDialog.tsx`:

```tsx
import { AlertTriangle } from "lucide-react";
import { useEffect, useRef } from "react";

export interface ConfirmDialogProps {
  title: string;
  description: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}

/** キーボードだけで操作できる確認ダイアログ。Enter=実行 / Esc=取消 */
export function ConfirmDialog({
  title,
  description,
  confirmLabel,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    containerRef.current?.focus();
  }, []);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      event.stopPropagation();
      onConfirm();
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      onCancel();
    }
  };

  return (
    <div
      ref={containerRef}
      tabIndex={-1}
      role="alertdialog"
      aria-label={title}
      onKeyDown={handleKeyDown}
      className="absolute inset-0 z-20 flex items-center justify-center bg-black/20 p-6 outline-none backdrop-blur-[2px]"
    >
      <div className="w-full max-w-sm rounded-xl bg-white p-5 shadow-xl">
        <div className="flex items-start gap-3">
          <AlertTriangle size={18} className="mt-0.5 shrink-0 text-[#FF3B30]" />
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-neutral-900">{title}</h2>
            <p className="mt-1 text-xs leading-relaxed text-neutral-600">
              {description}
            </p>
          </div>
        </div>

        <div className="mt-4 flex items-center justify-end gap-2 text-xs">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md px-3 py-1.5 text-neutral-600 transition-colors hover:bg-black/5"
          >
            キャンセル (Esc)
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="rounded-md bg-[#FF3B30] px-3 py-1.5 font-medium text-white transition-opacity hover:opacity-90"
          >
            {confirmLabel} (Enter)
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: ConfirmDialog のテストが通ることを確認する**

Run:
```bash
cd /Users/kei06/dev/smartTaskManagement && npx vitest run src/components/ConfirmDialog.test.tsx
```

Expected: PASS（3 tests）。

- [ ] **Step 5: BoardSwitcher の作成・改名・削除の失敗するテストを追加する**

`src/components/BoardSwitcher.test.tsx` のインポート群の末尾に次の1行を足す。

```tsx
import * as api from "../lib/api";
```

そのうえでファイルの末尾に次を追記する。

```tsx
describe("BoardSwitcher の作成・改名・削除", () => {
  beforeEach(() => {
    vi.mocked(api.boardCreate).mockReset();
    vi.mocked(api.boardRename).mockReset();
    vi.mocked(api.boardDelete).mockReset();
    selectBoard.mockClear();
    setView.mockClear();
    useAppStore.setState({
      boards,
      currentBoardId: "b1",
      statuses: [],
      tasks: [],
      selectedTaskId: null,
      view: "switcher",
      selectBoard,
      setView,
      loadBoards: vi.fn(async () => undefined),
    });
  });

  it("Nキーで名前入力に入り、Enterでボードを作成して切り替える", async () => {
    vi.mocked(api.boardCreate).mockResolvedValue({
      id: "b4",
      name: "新ボード",
      position: 3,
    });
    const user = userEvent.setup();
    render(<BoardSwitcher />);

    await user.keyboard("n");
    const input = screen.getByLabelText("新しいボード名");
    await user.type(input, "新ボード{Enter}");

    expect(api.boardCreate).toHaveBeenCalledWith("新ボード");
    await vi.waitFor(() => expect(selectBoard).toHaveBeenCalledWith("b4"));
  });

  it("空の名前ではボードを作成しない", async () => {
    const user = userEvent.setup();
    render(<BoardSwitcher />);

    await user.keyboard("n");
    await user.keyboard("{Enter}");

    expect(api.boardCreate).not.toHaveBeenCalled();
  });

  it("Rキーで改名に入り、Enterで改名する", async () => {
    vi.mocked(api.boardRename).mockResolvedValue({
      id: "b1",
      name: "本業",
      position: 0,
    });
    const user = userEvent.setup();
    render(<BoardSwitcher />);

    await user.keyboard("r");
    const input = screen.getByLabelText("ボード名");
    await user.clear(input);
    await user.type(input, "本業{Enter}");

    expect(api.boardRename).toHaveBeenCalledWith("b1", "本業");
  });

  it("⌘⌫で確認ダイアログを出し、EnterでCASCADE削除する", async () => {
    vi.mocked(api.boardDelete).mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<BoardSwitcher />);

    await user.keyboard("{Meta>}{Backspace}{/Meta}");

    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    expect(
      screen.getByText(
        "このボードのタスクとステータスもすべて削除されます。元に戻せません。",
      ),
    ).toBeInTheDocument();

    await user.keyboard("{Enter}");

    expect(api.boardDelete).toHaveBeenCalledWith("b1");
  });

  it("ボードが1枚のときは削除できない", async () => {
    useAppStore.setState({ boards: [boards[0]], currentBoardId: "b1" });
    const user = userEvent.setup();
    render(<BoardSwitcher />);

    await user.keyboard("{Meta>}{Backspace}{/Meta}");

    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(api.boardDelete).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 6: テストが失敗することを確認する**

Run:
```bash
cd /Users/kei06/dev/smartTaskManagement && npx vitest run src/components/BoardSwitcher.test.tsx
```

Expected: FAIL。`Unable to find a label with the text of: 新しいボード名` などが出る。

- [ ] **Step 7: BoardSwitcher にモード管理を実装する**

`src/components/BoardSwitcher.tsx` を次の内容に置き換える。

```tsx
import { Check, Pencil, Plus } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { boardCreate, boardDelete, boardRename } from "../lib/api";
import { useAppStore } from "../store/appStore";
import { ConfirmDialog } from "./ConfirmDialog";

type Mode = "list" | "create" | "rename" | "confirm-delete";

/**
 * ボードスイッチャー(⌘Bで開く)。
 * ↑↓選択 / Enter切替 / ⌘1-9直接切替 / N新規 / R改名 / ⌘⌫削除 / Esc戻る
 */
export function BoardSwitcher() {
  const boards = useAppStore((state) => state.boards);
  const currentBoardId = useAppStore((state) => state.currentBoardId);
  const selectBoard = useAppStore((state) => state.selectBoard);
  const loadBoards = useAppStore((state) => state.loadBoards);
  const setView = useAppStore((state) => state.setView);

  // インデックスが boards.length のときは「新規ボード」項目を指す
  const [index, setIndex] = useState(() => {
    const found = boards.findIndex((board) => board.id === currentBoardId);
    return found >= 0 ? found : 0;
  });
  const [mode, setMode] = useState<Mode>("list");
  const [draft, setDraft] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (mode === "list") containerRef.current?.focus();
    if (mode === "create" || mode === "rename") inputRef.current?.focus();
  }, [mode]);

  const targetBoard = boards[index] ?? null;

  const openBoard = (boardId: string) => {
    void selectBoard(boardId);
    setView("board");
  };

  const startCreate = () => {
    setDraft("");
    setMode("create");
  };

  const commitCreate = async () => {
    const name = draft.trim();
    if (name === "") {
      setMode("list");
      return;
    }
    try {
      const created = await boardCreate(name);
      await loadBoards();
      await selectBoard(created.id);
      setView("board");
    } catch (error) {
      toast.error("ボードを作成できませんでした", {
        description: String(error),
      });
      setMode("list");
    }
  };

  const commitRename = async () => {
    const name = draft.trim();
    if (targetBoard === null || name === "") {
      setMode("list");
      return;
    }
    try {
      await boardRename(targetBoard.id, name);
      await loadBoards();
    } catch (error) {
      toast.error("ボードを改名できませんでした", {
        description: String(error),
      });
    }
    setMode("list");
  };

  const commitDelete = async () => {
    if (targetBoard === null) {
      setMode("list");
      return;
    }
    try {
      await boardDelete(targetBoard.id);
      await loadBoards();
      const remaining = useAppStore
        .getState()
        .boards.filter((board) => board.id !== targetBoard.id);
      const next = remaining[0];
      if (next !== undefined) await selectBoard(next.id);
      setIndex(0);
    } catch (error) {
      toast.error("ボードを削除できませんでした", {
        description: String(error),
      });
    }
    setMode("list");
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const lastIndex = boards.length; // 「新規ボード」項目の位置

    if (event.metaKey && /^[1-9]$/.test(event.key)) {
      const target = boards[Number(event.key) - 1];
      if (target !== undefined) {
        event.preventDefault();
        openBoard(target.id);
      }
      return;
    }

    if (event.metaKey && event.key === "Backspace") {
      event.preventDefault();
      if (targetBoard === null) return;
      if (boards.length <= 1) {
        toast.error("最後のボードは削除できません");
        return;
      }
      setMode("confirm-delete");
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      setView("board");
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setIndex((prev) => Math.min(prev + 1, lastIndex));
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setIndex((prev) => Math.max(prev - 1, 0));
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      if (index === lastIndex) {
        startCreate();
        return;
      }
      if (targetBoard !== null) openBoard(targetBoard.id);
      return;
    }

    if (event.key === "n" || event.key === "N") {
      event.preventDefault();
      startCreate();
      return;
    }

    if ((event.key === "r" || event.key === "R") && targetBoard !== null) {
      event.preventDefault();
      setDraft(targetBoard.name);
      setMode("rename");
    }
  };

  const handleInputKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      if (mode === "create") void commitCreate();
      else void commitRename();
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      setMode("list");
    }
  };

  return (
    <div className="relative h-full">
      <div
        ref={containerRef}
        tabIndex={-1}
        role="listbox"
        aria-label="ボード一覧"
        onKeyDown={mode === "list" ? handleKeyDown : undefined}
        className="flex h-full flex-col gap-1 overflow-y-auto p-3 outline-none"
      >
        {boards.map((board, i) => (
          <div
            key={board.id}
            role="option"
            aria-selected={i === index}
            className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors ${
              i === index ? "bg-black/[0.06]" : ""
            }`}
          >
            <span className="w-5 shrink-0 text-xs text-neutral-400">
              {i < 9 ? `⌘${i + 1}` : ""}
            </span>
            {mode === "rename" && i === index ? (
              <input
                ref={inputRef}
                aria-label="ボード名"
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={handleInputKeyDown}
                className="flex-1 bg-transparent text-neutral-900 outline-none"
              />
            ) : (
              <span className="flex-1 truncate text-neutral-900">
                {board.name}
              </span>
            )}
            {board.id === currentBoardId && (
              <Check size={14} className="text-neutral-500" />
            )}
            {i === index && mode === "list" && (
              <Pencil size={12} className="text-neutral-300" />
            )}
          </div>
        ))}

        <div
          role="option"
          aria-selected={index === boards.length}
          className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-neutral-500 transition-colors ${
            index === boards.length ? "bg-black/[0.06]" : ""
          }`}
        >
          <span className="w-5 shrink-0" />
          <Plus size={14} />
          {mode === "create" ? (
            <input
              ref={inputRef}
              aria-label="新しいボード名"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={handleInputKeyDown}
              placeholder="ボード名を入力"
              className="flex-1 bg-transparent text-neutral-900 outline-none placeholder:text-neutral-400"
            />
          ) : (
            <span>新規ボード</span>
          )}
        </div>
      </div>

      {mode === "confirm-delete" && targetBoard !== null && (
        <ConfirmDialog
          title={`「${targetBoard.name}」を削除しますか？`}
          description="このボードのタスクとステータスもすべて削除されます。元に戻せません。"
          confirmLabel="削除する"
          onConfirm={() => void commitDelete()}
          onCancel={() => setMode("list")}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 8: テストが通ることを確認する**

Run:
```bash
cd /Users/kei06/dev/smartTaskManagement && npx vitest run src/components/BoardSwitcher.test.tsx
```

Expected: PASS（11 tests）。

- [ ] **Step 9: コミット**

```bash
cd /Users/kei06/dev/smartTaskManagement
git add src/components/ConfirmDialog.tsx src/components/ConfirmDialog.test.tsx src/components/BoardSwitcher.tsx src/components/BoardSwitcher.test.tsx
git commit -m "feat: ボードの新規作成・改名・削除をキーボードで操作できるようにする"
```

---

### Task 9: ボード設定（ステータス一覧・改名・色変更）

**Files:**
- Create: `src/lib/statusPalette.ts`
- Create: `src/components/StatusSettings.tsx`
- Create: `src/components/StatusSettings.test.tsx`

- [ ] **Step 1: ステータス色のプリセットを定義する**

`src/lib/statusPalette.ts`:

```ts
/**
 * ステータス色のプリセットパレット。
 * macOSのシステムカラーに合わせ、デフォルトステータス4色を先頭に置く。
 */
export const STATUS_COLORS = [
  { name: "グレー", value: "#8E8E93" },
  { name: "ブルー", value: "#007AFF" },
  { name: "オレンジ", value: "#FF9500" },
  { name: "グリーン", value: "#34C759" },
  { name: "レッド", value: "#FF3B30" },
  { name: "パープル", value: "#AF52DE" },
  { name: "ピンク", value: "#FF2D55" },
  { name: "ティール", value: "#5AC8FA" },
] as const;

export type StatusColor = (typeof STATUS_COLORS)[number]["value"];
```

- [ ] **Step 2: 失敗するテストを書く**

`src/components/StatusSettings.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Status } from "../types";
import { useAppStore } from "../store/appStore";
import { StatusSettings } from "./StatusSettings";
import * as api from "../lib/api";

vi.mock("../lib/api", () => ({
  statusCreate: vi.fn(),
  statusUpdate: vi.fn(),
  statusDelete: vi.fn(),
  statusReorder: vi.fn(),
}));

const statuses: Status[] = [
  {
    id: "st-1",
    boardId: "b1",
    name: "未着手",
    color: "#8E8E93",
    position: 0,
  },
  {
    id: "st-2",
    boardId: "b1",
    name: "進行中",
    color: "#007AFF",
    position: 1,
  },
];

const selectBoard = vi.fn(async () => undefined);

describe("StatusSettings", () => {
  beforeEach(() => {
    vi.mocked(api.statusUpdate).mockReset();
    vi.mocked(api.statusCreate).mockReset();
    vi.mocked(api.statusDelete).mockReset();
    vi.mocked(api.statusReorder).mockReset();
    selectBoard.mockClear();
    useAppStore.setState({
      boards: [{ id: "b1", name: "メイン", position: 0 }],
      currentBoardId: "b1",
      statuses,
      tasks: [],
      selectedTaskId: null,
      view: "settings",
      selectBoard,
    });
  });

  it("ステータスを並び順どおりに表示する", () => {
    render(<StatusSettings />);

    expect(screen.getByText("未着手")).toBeInTheDocument();
    expect(screen.getByText("進行中")).toBeInTheDocument();
  });

  it("↓で選択が移動する", async () => {
    const user = userEvent.setup();
    render(<StatusSettings />);

    await user.keyboard("{ArrowDown}");

    expect(screen.getByRole("option", { name: /進行中/ })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  it("Enterで改名に入り、Enterで確定する", async () => {
    vi.mocked(api.statusUpdate).mockResolvedValue({
      ...statuses[0],
      name: "バックログ",
    });
    const user = userEvent.setup();
    render(<StatusSettings />);

    await user.keyboard("{Enter}");
    const input = screen.getByLabelText("ステータス名");
    await user.clear(input);
    await user.type(input, "バックログ{Enter}");

    expect(api.statusUpdate).toHaveBeenCalledWith("st-1", "バックログ", null);
  });

  it("Cキーで色選択に入り、→とEnterで色を変更する", async () => {
    vi.mocked(api.statusUpdate).mockResolvedValue({
      ...statuses[0],
      color: "#007AFF",
    });
    const user = userEvent.setup();
    render(<StatusSettings />);

    await user.keyboard("c");
    expect(screen.getByRole("listbox", { name: "色を選択" })).toBeInTheDocument();

    await user.keyboard("{ArrowRight}{Enter}");

    expect(api.statusUpdate).toHaveBeenCalledWith("st-1", null, "#007AFF");
  });
});
```

- [ ] **Step 3: テストが失敗することを確認する**

Run:
```bash
cd /Users/kei06/dev/smartTaskManagement && npx vitest run src/components/StatusSettings.test.tsx
```

Expected: FAIL。`Failed to resolve import "./StatusSettings"` が出る。

- [ ] **Step 4: StatusSettings を実装する（改名・色変更まで）**

`src/components/StatusSettings.tsx`:

```tsx
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { statusUpdate } from "../lib/api";
import { STATUS_COLORS } from "../lib/statusPalette";
import { useAppStore } from "../store/appStore";

type Mode = "list" | "rename" | "color";

/**
 * ボード設定のステータス管理。
 * ↑↓選択 / Enter改名 / C色変更 / ⌘↑↓並び替え / N追加 / ⌘⌫削除
 */
export function StatusSettings() {
  const statuses = useAppStore((state) => state.statuses);
  const currentBoardId = useAppStore((state) => state.currentBoardId);
  const selectBoard = useAppStore((state) => state.selectBoard);

  const [index, setIndex] = useState(0);
  const [mode, setMode] = useState<Mode>("list");
  const [draft, setDraft] = useState("");
  const [colorIndex, setColorIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const colorRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (mode === "rename") inputRef.current?.focus();
    else if (mode === "color") colorRef.current?.focus();
    else containerRef.current?.focus();
  }, [mode]);

  const target = statuses[index] ?? null;

  /** 変更後にボードを読み直してstatuses/tasksを最新化する */
  const reload = async () => {
    if (currentBoardId !== null) await selectBoard(currentBoardId);
  };

  const commitRename = async () => {
    const name = draft.trim();
    if (target === null || name === "") {
      setMode("list");
      return;
    }
    try {
      await statusUpdate(target.id, name, null);
      await reload();
    } catch (error) {
      toast.error("ステータス名を変更できませんでした", {
        description: String(error),
      });
    }
    setMode("list");
  };

  const commitColor = async () => {
    const color = STATUS_COLORS[colorIndex]?.value;
    if (target === null || color === undefined) {
      setMode("list");
      return;
    }
    try {
      await statusUpdate(target.id, null, color);
      await reload();
    } catch (error) {
      toast.error("色を変更できませんでした", { description: String(error) });
    }
    setMode("list");
  };

  const handleListKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "ArrowDown" && !event.metaKey) {
      event.preventDefault();
      setIndex((prev) => Math.min(prev + 1, statuses.length - 1));
      return;
    }
    if (event.key === "ArrowUp" && !event.metaKey) {
      event.preventDefault();
      setIndex((prev) => Math.max(prev - 1, 0));
      return;
    }
    if (event.key === "Enter" && target !== null) {
      event.preventDefault();
      setDraft(target.name);
      setMode("rename");
      return;
    }
    if ((event.key === "c" || event.key === "C") && target !== null) {
      event.preventDefault();
      const found = STATUS_COLORS.findIndex(
        (color) => color.value === target.color,
      );
      setColorIndex(found >= 0 ? found : 0);
      setMode("color");
    }
  };

  const handleColorKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "ArrowRight") {
      event.preventDefault();
      setColorIndex((prev) => Math.min(prev + 1, STATUS_COLORS.length - 1));
      return;
    }
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      setColorIndex((prev) => Math.max(prev - 1, 0));
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      void commitColor();
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      setMode("list");
    }
  };

  const handleInputKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      void commitRename();
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      setMode("list");
    }
  };

  return (
    <div className="flex h-full flex-col">
      <div
        ref={containerRef}
        tabIndex={-1}
        role="listbox"
        aria-label="ステータス一覧"
        onKeyDown={mode === "list" ? handleListKeyDown : undefined}
        className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto p-3 outline-none"
      >
        {statuses.map((status, i) => (
          <div
            key={status.id}
            role="option"
            aria-selected={i === index}
            className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
              i === index ? "bg-black/[0.06]" : ""
            }`}
          >
            <span
              className="h-3 w-3 shrink-0 rounded-full"
              style={{ backgroundColor: status.color }}
            />
            {mode === "rename" && i === index ? (
              <input
                ref={inputRef}
                aria-label="ステータス名"
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={handleInputKeyDown}
                className="flex-1 bg-transparent text-neutral-900 outline-none"
              />
            ) : (
              <span className="flex-1 truncate text-neutral-900">
                {status.name}
              </span>
            )}
          </div>
        ))}
      </div>

      {mode === "color" && (
        <div
          ref={colorRef}
          tabIndex={-1}
          role="listbox"
          aria-label="色を選択"
          onKeyDown={handleColorKeyDown}
          className="flex items-center gap-2 border-t border-black/5 px-4 py-3 outline-none"
        >
          {STATUS_COLORS.map((color, i) => (
            <span
              key={color.value}
              role="option"
              aria-label={color.name}
              aria-selected={i === colorIndex}
              className={`h-5 w-5 rounded-full transition-transform ${
                i === colorIndex
                  ? "scale-110 ring-2 ring-neutral-900/40 ring-offset-2"
                  : ""
              }`}
              style={{ backgroundColor: color.value }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 5: テストが通ることを確認する**

Run:
```bash
cd /Users/kei06/dev/smartTaskManagement && npx vitest run src/components/StatusSettings.test.tsx
```

Expected: PASS（4 tests）。

- [ ] **Step 6: コミット**

```bash
cd /Users/kei06/dev/smartTaskManagement
git add src/lib/statusPalette.ts src/components/StatusSettings.tsx src/components/StatusSettings.test.tsx
git commit -m "feat: ボード設定のステータス改名と色変更を追加"
```

---

### Task 10: ボード設定（ステータスの追加・削除・並び替え）と設定画面のタブ

**Files:**
- Modify: `src/components/StatusSettings.tsx`
- Modify: `src/components/StatusSettings.test.tsx`
- Create: `src/components/BoardSettings.tsx`
- Create: `src/components/BoardSettings.test.tsx`
- Modify: `src/components/Palette.tsx`

- [ ] **Step 1: 追加・削除・並び替えの失敗するテストを追記する**

`src/components/StatusSettings.test.tsx` の `describe("StatusSettings", ...)` の中に追記する。

```tsx
  it("Nキーで追加入力に入り、Enterで末尾にステータスを追加する", async () => {
    vi.mocked(api.statusCreate).mockResolvedValue({
      id: "st-3",
      boardId: "b1",
      name: "保留",
      color: "#8E8E93",
      position: 2,
    });
    const user = userEvent.setup();
    render(<StatusSettings />);

    await user.keyboard("n");
    const input = screen.getByLabelText("新しいステータス名");
    await user.type(input, "保留{Enter}");

    expect(api.statusCreate).toHaveBeenCalledWith("b1", "保留", "#8E8E93");
  });

  it("⌘↓で並び順が1つ下がる", async () => {
    vi.mocked(api.statusReorder).mockResolvedValue(statuses);
    const user = userEvent.setup();
    render(<StatusSettings />);

    await user.keyboard("{Meta>}{ArrowDown}{/Meta}");

    expect(api.statusReorder).toHaveBeenCalledWith("st-1", 1);
  });

  it("⌘⌫で確認ダイアログを出し、タスクの移動先を説明する", async () => {
    const user = userEvent.setup();
    render(<StatusSettings />);

    await user.keyboard("{ArrowDown}");
    await user.keyboard("{Meta>}{Backspace}{/Meta}");

    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    expect(
      screen.getByText(
        "このステータスのタスクは「未着手」へ移動します。元に戻せません。",
      ),
    ).toBeInTheDocument();
  });

  it("最後の1つのステータスは削除できない", async () => {
    useAppStore.setState({ statuses: [statuses[0]] });
    const user = userEvent.setup();
    render(<StatusSettings />);

    await user.keyboard("{Meta>}{Backspace}{/Meta}");

    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(api.statusDelete).not.toHaveBeenCalled();
  });
```

- [ ] **Step 2: テストが失敗することを確認する**

Run:
```bash
cd /Users/kei06/dev/smartTaskManagement && npx vitest run src/components/StatusSettings.test.tsx
```

Expected: FAIL。`Unable to find a label with the text of: 新しいステータス名` が出る。

- [ ] **Step 3: StatusSettings に追加・削除・並び替えを実装する**

`src/components/StatusSettings.tsx` を次の差分で更新する。

インポートを追加する。

```tsx
import { Plus } from "lucide-react";
import {
  statusCreate,
  statusDelete,
  statusReorder,
  statusUpdate,
} from "../lib/api";
import { ConfirmDialog } from "./ConfirmDialog";
```

`Mode` を拡張する。

```tsx
type Mode = "list" | "rename" | "color" | "create" | "confirm-delete";
```

`commitColor` の下に次の3つの関数を追加する。

```tsx
  const commitCreate = async () => {
    const name = draft.trim();
    if (currentBoardId === null || name === "") {
      setMode("list");
      return;
    }
    try {
      // 色はプリセット先頭(グレー)を初期値にし、あとからCキーで変更してもらう
      await statusCreate(currentBoardId, name, STATUS_COLORS[0].value);
      await reload();
      setIndex(statuses.length);
    } catch (error) {
      toast.error("ステータスを追加できませんでした", {
        description: String(error),
      });
    }
    setMode("list");
  };

  const reorder = async (direction: "up" | "down") => {
    if (target === null) return;
    const nextIndex = direction === "up" ? index - 1 : index + 1;
    if (nextIndex < 0 || nextIndex >= statuses.length) return;
    try {
      await statusReorder(target.id, nextIndex);
      await reload();
      setIndex(nextIndex);
    } catch (error) {
      toast.error("並び順を変更できませんでした", {
        description: String(error),
      });
    }
  };

  const commitDelete = async () => {
    if (target === null) {
      setMode("list");
      return;
    }
    try {
      await statusDelete(target.id);
      await reload();
      setIndex(0);
    } catch (error) {
      toast.error("ステータスを削除できませんでした", {
        description: String(error),
      });
    }
    setMode("list");
  };
```

`handleListKeyDown` の先頭に、⌘系のキーを先に処理する分岐を足す。

```tsx
    if (event.metaKey && event.key === "ArrowDown") {
      event.preventDefault();
      void reorder("down");
      return;
    }
    if (event.metaKey && event.key === "ArrowUp") {
      event.preventDefault();
      void reorder("up");
      return;
    }
    if (event.metaKey && event.key === "Backspace") {
      event.preventDefault();
      if (target === null) return;
      if (statuses.length <= 1) {
        toast.error("最後のステータスは削除できません");
        return;
      }
      setMode("confirm-delete");
      return;
    }
    if (event.key === "n" || event.key === "N") {
      event.preventDefault();
      setDraft("");
      setMode("create");
      return;
    }
```

`handleInputKeyDown` の Enter 分岐を、createとrenameで振り分ける。

```tsx
  const handleInputKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      if (mode === "create") void commitCreate();
      else void commitRename();
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      setMode("list");
    }
  };
```

`useEffect` のフォーカス条件を create にも効かせる。

```tsx
  useEffect(() => {
    if (mode === "rename" || mode === "create") inputRef.current?.focus();
    else containerRef.current?.focus();
  }, [mode]);
```

リストの直後（`</div>` の後、色パレットの前）に「新規ステータス」行と確認ダイアログを追加する。

```tsx
      <div className="flex items-center gap-3 border-t border-black/5 px-4 py-2 text-sm text-neutral-500">
        <Plus size={14} />
        {mode === "create" ? (
          <input
            ref={inputRef}
            aria-label="新しいステータス名"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={handleInputKeyDown}
            placeholder="ステータス名を入力"
            className="flex-1 bg-transparent text-neutral-900 outline-none placeholder:text-neutral-400"
          />
        ) : (
          <span>新規ステータス (N)</span>
        )}
      </div>

      {mode === "confirm-delete" && target !== null && (
        <ConfirmDialog
          title={`「${target.name}」を削除しますか？`}
          description={`このステータスのタスクは「${statuses[0]?.name ?? ""}」へ移動します。元に戻せません。`}
          confirmLabel="削除する"
          onConfirm={() => void commitDelete()}
          onCancel={() => setMode("list")}
        />
      )}
```

外側の `<div className="flex h-full flex-col">` を `<div className="relative flex h-full flex-col">` に変える（ConfirmDialogの絶対配置の基準にするため）。

- [ ] **Step 4: テストが通ることを確認する**

Run:
```bash
cd /Users/kei06/dev/smartTaskManagement && npx vitest run src/components/StatusSettings.test.tsx
```

Expected: PASS（8 tests）。

- [ ] **Step 5: BoardSettings（タブ切替）の失敗するテストを書く**

`src/components/BoardSettings.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAppStore } from "../store/appStore";
import { BoardSettings } from "./BoardSettings";

vi.mock("./StatusSettings", () => ({
  StatusSettings: () => <div data-testid="status-settings" />,
}));

vi.mock("./AppSettings", () => ({
  AppSettings: () => <div data-testid="app-settings" />,
}));

const setView = vi.fn();

describe("BoardSettings", () => {
  beforeEach(() => {
    setView.mockClear();
    useAppStore.setState({
      boards: [{ id: "b1", name: "メイン", position: 0 }],
      currentBoardId: "b1",
      statuses: [],
      tasks: [],
      selectedTaskId: null,
      view: "settings",
      setView,
    });
  });

  it("初期表示はボードタブ", () => {
    render(<BoardSettings />);

    expect(screen.getByTestId("status-settings")).toBeInTheDocument();
    expect(screen.queryByTestId("app-settings")).not.toBeInTheDocument();
  });

  it("Tabでアプリタブへ切り替わる", async () => {
    const user = userEvent.setup();
    render(<BoardSettings />);

    await user.keyboard("{Tab}");

    expect(screen.getByTestId("app-settings")).toBeInTheDocument();
    expect(screen.queryByTestId("status-settings")).not.toBeInTheDocument();
  });

  it("Escでboardビューへ戻る", async () => {
    const user = userEvent.setup();
    render(<BoardSettings />);

    await user.keyboard("{Escape}");

    expect(setView).toHaveBeenCalledWith("board");
  });
});
```

- [ ] **Step 6: テストが失敗することを確認する**

Run:
```bash
cd /Users/kei06/dev/smartTaskManagement && npx vitest run src/components/BoardSettings.test.tsx
```

Expected: FAIL。`Failed to resolve import "./BoardSettings"` が出る。

- [ ] **Step 7: BoardSettings を実装する**

`src/components/BoardSettings.tsx`:

```tsx
import { useEffect, useRef, useState } from "react";
import { useAppStore } from "../store/appStore";
import { AppSettings } from "./AppSettings";
import { StatusSettings } from "./StatusSettings";

type Tab = "board" | "app";

/**
 * 設定画面(⌘,で開く)。
 * ボードタブ=ステータス管理 / アプリタブ=自動起動・ホットキー。Tabで行き来する。
 */
export function BoardSettings() {
  const boards = useAppStore((state) => state.boards);
  const currentBoardId = useAppStore((state) => state.currentBoardId);
  const setView = useAppStore((state) => state.setView);

  const [tab, setTab] = useState<Tab>("board");
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    containerRef.current?.focus();
  }, []);

  const boardName =
    boards.find((board) => board.id === currentBoardId)?.name ?? "";

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Tab") {
      event.preventDefault();
      setTab((prev) => (prev === "board" ? "app" : "board"));
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      setView("board");
    }
  };

  return (
    <div
      ref={containerRef}
      tabIndex={-1}
      onKeyDown={handleKeyDown}
      className="flex h-full flex-col outline-none"
    >
      <div
        role="tablist"
        aria-label="設定タブ"
        className="flex items-center gap-1 px-3 pt-3"
      >
        <button
          type="button"
          role="tab"
          aria-selected={tab === "board"}
          onClick={() => setTab("board")}
          className={`rounded-md px-3 py-1 text-xs transition-colors ${
            tab === "board"
              ? "bg-black/[0.06] text-neutral-900"
              : "text-neutral-500"
          }`}
        >
          ボード{boardName === "" ? "" : `（${boardName}）`}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "app"}
          onClick={() => setTab("app")}
          className={`rounded-md px-3 py-1 text-xs transition-colors ${
            tab === "app"
              ? "bg-black/[0.06] text-neutral-900"
              : "text-neutral-500"
          }`}
        >
          アプリ
        </button>
      </div>

      <div className="min-h-0 flex-1">
        {tab === "board" ? <StatusSettings /> : <AppSettings />}
      </div>
    </div>
  );
}
```

- [ ] **Step 8: AppSettings の仮実装を置く（中身はTask 11）**

`src/components/AppSettings.tsx`:

```tsx
/** アプリ設定(自動起動・ホットキー)。中身はTask 11で実装する */
export function AppSettings() {
  return <div className="p-4 text-sm text-neutral-500">アプリ設定</div>;
}
```

- [ ] **Step 9: Palette に settings ビューを繋ぐ**

`src/components/Palette.tsx` に追加する。

```tsx
import { BoardSettings } from "./BoardSettings";

// ...描画部分
{view === "settings" && <BoardSettings />}
```

- [ ] **Step 10: 全テストと型チェックを通す**

Run:
```bash
cd /Users/kei06/dev/smartTaskManagement && npx tsc --noEmit && npx vitest run
```

Expected: 型エラーなし。全テストPASS。

- [ ] **Step 11: コミット**

```bash
cd /Users/kei06/dev/smartTaskManagement
git add src/components/StatusSettings.tsx src/components/StatusSettings.test.tsx src/components/BoardSettings.tsx src/components/BoardSettings.test.tsx src/components/AppSettings.tsx src/components/Palette.tsx
git commit -m "feat: ステータスの追加・削除・並び替えと設定画面のタブを追加"
```

---

### Task 11: 自動起動とホットキー変更

**Files:**
- Create: `src/lib/accelerator.ts`
- Create: `src/lib/accelerator.test.ts`
- Modify: `src/components/AppSettings.tsx`
- Create: `src/components/AppSettings.test.tsx`
- Modify: `src-tauri/Cargo.toml`
- Modify: `src-tauri/src/lib.rs`
- Modify: `src-tauri/capabilities/default.json`

**Rust側のホットキー再登録は計画書1で実装済み。** `src-tauri/src/panel.rs` と
`src-tauri/src/commands.rs` はこの計画書では触らない（Step 8で存在を検証するだけ）。

- [ ] **Step 1: accelerator変換の失敗するテストを書く**

`src/lib/accelerator.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { formatAccelerator, toAccelerator } from "./accelerator";

const base = {
  metaKey: false,
  ctrlKey: false,
  altKey: false,
  shiftKey: false,
};

describe("toAccelerator", () => {
  it("⌥SpaceをAlt+Spaceへ変換する", () => {
    expect(toAccelerator({ ...base, code: "Space", altKey: true })).toBe(
      "Alt+Space",
    );
  });

  it("⌘⇧KをSuper+Shift+Kへ変換する", () => {
    expect(
      toAccelerator({ ...base, code: "KeyK", metaKey: true, shiftKey: true }),
    ).toBe("Shift+Super+K");
  });

  it("数字キーを変換する", () => {
    expect(toAccelerator({ ...base, code: "Digit1", ctrlKey: true })).toBe(
      "Control+1",
    );
  });

  it("ファンクションキーは修飾なしでも受け付ける", () => {
    expect(toAccelerator({ ...base, code: "F5" })).toBe("F5");
  });

  it("修飾キーなしの通常キーはnullを返す", () => {
    expect(toAccelerator({ ...base, code: "KeyA" })).toBeNull();
  });

  it("修飾キー単体はnullを返す", () => {
    expect(toAccelerator({ ...base, code: "ShiftLeft", shiftKey: true })).toBeNull();
  });
});

describe("formatAccelerator", () => {
  it("macOSの記号表記へ整形する", () => {
    expect(formatAccelerator("Alt+Space")).toBe("⌥Space");
    expect(formatAccelerator("Shift+Super+K")).toBe("⇧⌘K");
  });
});
```

- [ ] **Step 2: テストが失敗することを確認する**

Run:
```bash
cd /Users/kei06/dev/smartTaskManagement && npx vitest run src/lib/accelerator.test.ts
```

Expected: FAIL。`Failed to resolve import "./accelerator"` が出る。

- [ ] **Step 3: accelerator変換を実装する**

`src/lib/accelerator.ts`:

```ts
export interface AcceleratorInput {
  code: string;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
}

/** KeyboardEvent.code から Tauri アクセラレータのキー名を得る。対象外はnull。 */
function toKeyName(code: string): string | null {
  if (code.startsWith("Key")) return code.slice(3);
  if (code.startsWith("Digit")) return code.slice(5);
  if (/^F([1-9]|1[0-9]|2[0-4])$/.test(code)) return code;
  if (code === "Space") return "Space";
  if (code === "Enter") return "Enter";
  if (code === "Tab") return "Tab";
  if (code === "Backquote") return "`";
  if (code === "Minus") return "-";
  if (code === "Equal") return "=";
  return null;
}

/**
 * KeyboardEventをTauriのアクセラレータ文字列(例: "Alt+Space")へ変換する。
 * グローバルホットキーとして成立しない組み合わせ(修飾キーなしの通常キー等)はnull。
 * macOSでは Super が ⌘ に対応する。
 */
export function toAccelerator(event: AcceleratorInput): string | null {
  const key = toKeyName(event.code);
  if (key === null) return null;

  const parts: string[] = [];
  if (event.ctrlKey) parts.push("Control");
  if (event.altKey) parts.push("Alt");
  if (event.shiftKey) parts.push("Shift");
  if (event.metaKey) parts.push("Super");

  // ファンクションキーだけは修飾キーなしでもグローバルホットキーになれる
  const isFunctionKey = /^F([1-9]|1[0-9]|2[0-4])$/.test(key);
  if (parts.length === 0 && !isFunctionKey) return null;

  parts.push(key);
  return parts.join("+");
}

const SYMBOLS: Record<string, string> = {
  Control: "⌃",
  Alt: "⌥",
  Shift: "⇧",
  Super: "⌘",
  CommandOrControl: "⌘",
};

/** アクセラレータ文字列をmacOSの記号表記(例: "⌥Space")へ整形する */
export function formatAccelerator(accelerator: string): string {
  return accelerator
    .split("+")
    .map((part) => SYMBOLS[part] ?? part)
    .join("");
}
```

- [ ] **Step 4: テストが通ることを確認する**

Run:
```bash
cd /Users/kei06/dev/smartTaskManagement && npx vitest run src/lib/accelerator.test.ts
```

Expected: PASS（7 tests）。

- [ ] **Step 5: autostartプラグインを導入する**

Run:
```bash
cd /Users/kei06/dev/smartTaskManagement && npm install @tauri-apps/plugin-autostart
cd /Users/kei06/dev/smartTaskManagement/src-tauri && cargo add tauri-plugin-autostart --target 'cfg(any(target_os = "macos", windows, target_os = "linux"))'
```

Expected: `package.json` に `@tauri-apps/plugin-autostart` が入り、`src-tauri/Cargo.toml` に `[target."cfg(any(target_os = \"macos\", windows, target_os = \"linux\"))".dependencies] tauri-plugin-autostart = "2"` が追記される。

- [ ] **Step 6: Rust側にプラグインを登録する**

`src-tauri/src/lib.rs` の `.setup(|app| { ... })` の中に追記する（`.setup` がまだ無ければ `tauri::Builder::default()` のチェーンに追加する）。

```rust
            // ログイン時の自動起動プラグイン(既定はOFF、設定画面でトグルする)
            #[cfg(desktop)]
            app.handle().plugin(tauri_plugin_autostart::init(
                tauri_plugin_autostart::MacosLauncher::LaunchAgent,
                None,
            ))?;
```

- [ ] **Step 7: 権限を追加する**

`src-tauri/capabilities/default.json` の `permissions` 配列に3件追加する。

```json
    "autostart:allow-enable",
    "autostart:allow-disable",
    "autostart:allow-is-enabled"
```

- [ ] **Step 8: 計画書1のRust実装が揃っていることを検証する**

ホットキーの再登録・失敗記録は**すべて計画書1で実装済み**。この計画書ではRustコードを書かず、
存在を確認するだけにする。

Run:
```bash
rg -n "pub fn toggle_panel|pub fn reregister_hotkey|HOTKEY_ERROR_EVENT|MAIN_WINDOW_LABEL" \
  /Users/kei06/dev/smartTaskManagement/src-tauri/src/panel.rs
```

Expected: 次の4つがすべて見つかる。
- `pub const MAIN_WINDOW_LABEL: &str = "main";`
- `pub const HOTKEY_ERROR_EVENT: &str = "hotkey-error";`
- `pub fn toggle_panel(app: &AppHandle)`
- `pub fn reregister_hotkey(app: &AppHandle) -> Result<(), String>` — **アクセラレータは引数で受け取らず、settingsの `hotkey` キーから読む**

Run:
```bash
rg -n "HOTKEY_ERROR_SETTING_KEY" /Users/kei06/dev/smartTaskManagement/src-tauri/src/db/repo.rs
```

Expected: `pub const HOTKEY_ERROR_SETTING_KEY: &str = "hotkeyError";` が見つかる。

Run:
```bash
rg -n -A 20 "pub fn setting_set" /Users/kei06/dev/smartTaskManagement/src-tauri/src/commands.rs
```

Expected: `setting_set(app: AppHandle, state: State<'_, DbState>, key: String, value: String)` の中に
`if key == repo::HOTKEY_SETTING_KEY { panel::reregister_hotkey(&app)?; }` の分岐がある。
**保存が先・再登録が後**の順序になっている（登録に失敗しても値はDBに残り、`Err` が返る）。
この順序はStep 11のフロント実装で前提にするので、必ず目視で確認すること。

Run:
```bash
cd /Users/kei06/dev/smartTaskManagement/src-tauri && cargo test
```

Expected: コンパイル成功、リポジトリ層のテストがすべてPASS。

上のいずれかが見つからない、または `cargo test` が落ちる場合は**このタスクを中断して報告する**。
自分で `panel.rs` / `commands.rs` を書き足さないこと（計画書1の担当範囲であり、二重実装になる）。

- [ ] **Step 9: AppSettings の失敗するテストを書く**

`src/components/AppSettings.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppSettings } from "./AppSettings";
import * as api from "../lib/api";
import * as autostart from "@tauri-apps/plugin-autostart";

vi.mock("../lib/api", () => ({
  settingGet: vi.fn(),
  settingSet: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-autostart", () => ({
  enable: vi.fn(),
  disable: vi.fn(),
  isEnabled: vi.fn(),
}));

describe("AppSettings", () => {
  beforeEach(() => {
    vi.mocked(autostart.isEnabled).mockResolvedValue(false);
    vi.mocked(autostart.enable).mockResolvedValue(undefined);
    vi.mocked(autostart.disable).mockResolvedValue(undefined);
    vi.mocked(api.settingGet).mockResolvedValue("Alt+Space");
    vi.mocked(api.settingSet).mockResolvedValue(undefined);
  });

  it("現在のホットキーを記号表記で表示する", async () => {
    render(<AppSettings />);

    expect(await screen.findByText("⌥Space")).toBeInTheDocument();
  });

  it("自動起動トグルをONにするとenableが呼ばれる", async () => {
    const user = userEvent.setup();
    render(<AppSettings />);

    await user.click(
      await screen.findByRole("switch", { name: "ログイン時に自動起動" }),
    );

    expect(autostart.enable).toHaveBeenCalledTimes(1);
  });

  it("ホットキーを録って保存すると新しいアクセラレータが渡る", async () => {
    const user = userEvent.setup();
    render(<AppSettings />);

    await user.click(
      await screen.findByRole("button", { name: "ホットキーを変更" }),
    );
    await user.keyboard("{Meta>}{Shift>}K{/Shift}{/Meta}");

    await vi.waitFor(() =>
      expect(api.settingSet).toHaveBeenCalledWith("hotkey", "Shift+Super+K"),
    );
  });

  it("登録に失敗したらエラーを表示して元のキーに戻す", async () => {
    vi.mocked(api.settingSet).mockRejectedValue(
      "ホットキー Shift+Super+K を登録できませんでした: already registered",
    );
    const user = userEvent.setup();
    render(<AppSettings />);

    await user.click(
      await screen.findByRole("button", { name: "ホットキーを変更" }),
    );
    await user.keyboard("{Meta>}{Shift>}K{/Shift}{/Meta}");

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "already registered",
    );
    expect(screen.getByText("⌥Space")).toBeInTheDocument();
  });
});
```

- [ ] **Step 10: テストが失敗することを確認する**

Run:
```bash
cd /Users/kei06/dev/smartTaskManagement && npx vitest run src/components/AppSettings.test.tsx
```

Expected: FAIL。`Unable to find an element with the text: ⌥Space` が出る。

- [ ] **Step 11: AppSettings を実装する**

`src/components/AppSettings.tsx` を次の内容に置き換える。

```tsx
import { disable, enable, isEnabled } from "@tauri-apps/plugin-autostart";
import { Keyboard, Power } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { formatAccelerator, toAccelerator } from "../lib/accelerator";
import { settingGet, settingSet } from "../lib/api";

const DEFAULT_HOTKEY = "Alt+Space";

/** アプリ設定タブ。ログイン時自動起動のON/OFFとグローバルホットキーの変更。 */
export function AppSettings() {
  const [autostartOn, setAutostartOn] = useState(false);
  const [hotkey, setHotkey] = useState(DEFAULT_HOTKEY);
  const [capturing, setCapturing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const captureRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    void (async () => {
      setAutostartOn(await isEnabled());
      const saved = await settingGet("hotkey");
      if (saved !== null && saved !== "") setHotkey(saved);
    })();
  }, []);

  const toggleAutostart = async () => {
    try {
      if (autostartOn) {
        await disable();
        setAutostartOn(false);
      } else {
        await enable();
        setAutostartOn(true);
      }
    } catch (caught) {
      setError(`自動起動の設定を変更できませんでした: ${String(caught)}`);
    }
  };

  const handleCaptureKeyDown = async (
    event: React.KeyboardEvent<HTMLButtonElement>,
  ) => {
    event.preventDefault();
    event.stopPropagation();

    if (event.key === "Escape") {
      setCapturing(false);
      return;
    }

    const accelerator = toAccelerator(event);
    if (accelerator === null) return; // 修飾キー単体などは無視して押し直しを待つ

    setCapturing(false);
    setError(null);
    const previous = hotkey;
    setHotkey(accelerator);
    try {
      // Rust側のsetting_setはkey==="hotkey"のとき、保存したうえで
      // panel::reregister_hotkey(&app) を呼ぶ(アクセラレータはsettingsから読まれる)
      await settingSet("hotkey", accelerator);
    } catch (caught) {
      setHotkey(previous);
      setError(String(caught));
      // Rust側は「保存が先・再登録が後」なので、失敗しても新しい値がDBに残っている。
      // 元のキーで保存し直して再登録させ、次回起動時に壊れた設定が使われないようにする
      try {
        await settingSet("hotkey", previous);
      } catch {
        // 復旧にも失敗した場合は、上のエラー表示から手動で直してもらう
      }
    }
  };

  return (
    <div className="flex flex-col gap-1 p-3 text-sm">
      <div className="flex items-center gap-3 rounded-lg px-3 py-2">
        <Power size={14} className="shrink-0 text-neutral-500" />
        <span className="flex-1 text-neutral-900">ログイン時に自動起動</span>
        <button
          type="button"
          role="switch"
          aria-label="ログイン時に自動起動"
          aria-checked={autostartOn}
          onClick={() => void toggleAutostart()}
          className={`relative h-6 w-10 shrink-0 rounded-full transition-colors ${
            autostartOn ? "bg-[#34C759]" : "bg-black/15"
          }`}
        >
          <span
            className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
              autostartOn ? "translate-x-[18px]" : "translate-x-0.5"
            }`}
          />
        </button>
      </div>

      <div className="flex items-center gap-3 rounded-lg px-3 py-2">
        <Keyboard size={14} className="shrink-0 text-neutral-500" />
        <span className="flex-1 text-neutral-900">呼び出しホットキー</span>
        <span className="rounded border border-black/10 bg-black/[0.03] px-2 py-0.5 text-xs font-medium text-neutral-700">
          {formatAccelerator(hotkey)}
        </span>
        <button
          ref={captureRef}
          type="button"
          aria-label="ホットキーを変更"
          onClick={() => {
            setCapturing(true);
            captureRef.current?.focus();
          }}
          onKeyDown={capturing ? (event) => void handleCaptureKeyDown(event) : undefined}
          className={`rounded-md px-2 py-1 text-xs transition-colors ${
            capturing
              ? "bg-[#007AFF] text-white"
              : "text-neutral-600 hover:bg-black/5"
          }`}
        >
          {capturing ? "キーを押してください" : "変更"}
        </button>
      </div>

      {error !== null && (
        <p
          role="alert"
          className="mx-3 mt-1 rounded-md bg-[#FF3B30]/10 px-3 py-2 text-xs leading-relaxed text-[#FF3B30]"
        >
          {error}
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 12: テストが通ることを確認する**

Run:
```bash
cd /Users/kei06/dev/smartTaskManagement && npx vitest run src/components/AppSettings.test.tsx
```

Expected: PASS（4 tests）。

- [ ] **Step 13: 実機で自動起動とホットキー変更を確認する**

Run:
```bash
cd /Users/kei06/dev/smartTaskManagement && npm run tauri dev
```

操作: ⌘, → Tab → 自動起動をON → ターミナルで確認する。

```bash
ls ~/Library/LaunchAgents/ | grep -i smarttask
```

Expected: `*.smartTask.plist` のようなファイルが出来ている。OFFに戻すと消える。

操作: 「変更」を押して ⌃⌥T を押す → パレットを閉じ、⌃⌥T で開くことを確認する。⌥Space では開かなくなる。

- [ ] **Step 14: コミット**

```bash
cd /Users/kei06/dev/smartTaskManagement
git add src/lib/accelerator.ts src/lib/accelerator.test.ts src/components/AppSettings.tsx src/components/AppSettings.test.tsx package.json package-lock.json src-tauri/Cargo.toml src-tauri/Cargo.lock src-tauri/src/lib.rs src-tauri/capabilities/default.json
git commit -m "feat: ログイン時自動起動のトグルとホットキー変更UIを追加"
```

---

### Task 12: ホットキー衝突の起動時通知

**Files:**
- Create: `src/hooks/useHotkeyErrorToast.ts`
- Create: `src/hooks/useHotkeyErrorToast.test.ts`
- Modify: `src/components/Palette.tsx`

- [ ] **Step 1: 計画書1が発火するイベント名と設定キーを確認する**

Run:
```bash
rg -n "HOTKEY_ERROR_EVENT|HOTKEY_ERROR_SETTING_KEY" /Users/kei06/dev/smartTaskManagement/src-tauri/src/
```

Expected: 計画書1の `panel.rs` に `pub const HOTKEY_ERROR_EVENT: &str = "hotkey-error";` と
`app.emit(HOTKEY_ERROR_EVENT, message)` があり、`db/repo.rs` に
`pub const HOTKEY_ERROR_SETTING_KEY: &str = "hotkeyError";` がある。
どちらも実装コントラクトで固定された名前なので、**フロント側をこの文字列に合わせる**（Rust側をリネームしない）。

- [ ] **Step 2: 失敗するテストを書く**

`src/hooks/useHotkeyErrorToast.test.ts`:

```ts
import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useHotkeyErrorToast } from "./useHotkeyErrorToast";
import * as api from "../lib/api";

const listen = vi.fn();
const toastError = vi.fn();

vi.mock("@tauri-apps/api/event", () => ({
  listen: (name: string, handler: unknown) => {
    listen(name, handler);
    return Promise.resolve(() => undefined);
  },
}));

vi.mock("sonner", () => ({
  toast: { error: (...args: unknown[]) => toastError(...args) },
}));

vi.mock("../lib/api", () => ({
  settingGet: vi.fn(),
}));

describe("useHotkeyErrorToast", () => {
  beforeEach(() => {
    listen.mockClear();
    toastError.mockClear();
    vi.mocked(api.settingGet).mockResolvedValue("");
  });

  it("hotkey-errorイベントでトーストを出す", async () => {
    renderHook(() => useHotkeyErrorToast());

    await vi.waitFor(() => expect(listen).toHaveBeenCalled());
    expect(listen.mock.calls[0][0]).toBe("hotkey-error");

    const handler = listen.mock.calls[0][1] as (event: {
      payload: string;
    }) => void;
    handler({ payload: "ホットキー Alt+Space を登録できませんでした" });

    expect(toastError).toHaveBeenCalledWith(
      "ホットキーを登録できませんでした",
      expect.objectContaining({
        description: expect.stringContaining("Alt+Space"),
      }),
    );
  });

  it("起動時にsettingsへ記録済みの失敗も拾う", async () => {
    vi.mocked(api.settingGet).mockResolvedValue(
      "ホットキー Alt+Space を登録できませんでした",
    );

    renderHook(() => useHotkeyErrorToast());

    await vi.waitFor(() => expect(toastError).toHaveBeenCalledTimes(1));
  });

  it("記録が空なら何も出さない", async () => {
    renderHook(() => useHotkeyErrorToast());

    await vi.waitFor(() => expect(api.settingGet).toHaveBeenCalledWith("hotkeyError"));
    expect(toastError).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: テストが失敗することを確認する**

Run:
```bash
cd /Users/kei06/dev/smartTaskManagement && npx vitest run src/hooks/useHotkeyErrorToast.test.ts
```

Expected: FAIL。`Failed to resolve import "./useHotkeyErrorToast"` が出る。

- [ ] **Step 4: useHotkeyErrorToast を実装する**

`src/hooks/useHotkeyErrorToast.ts`:

```ts
import { listen } from "@tauri-apps/api/event";
import { useEffect } from "react";
import { toast } from "sonner";
import { settingGet } from "../lib/api";

const HOTKEY_ERROR_EVENT = "hotkey-error";

function showToast(message: string): void {
  toast.error("ホットキーを登録できませんでした", {
    description: `${message} 設定 (⌘,) のアプリタブから別のキーへ変更してください。`,
    duration: 10000,
  });
}

/**
 * ホットキー登録失敗を通知する。
 * 起動直後の発火を取りこぼさないよう、イベント購読とsettingsの記録の両方を見る。
 */
export function useHotkeyErrorToast(): void {
  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | null = null;
    let shown = false;

    const show = (message: string) => {
      if (shown || message === "") return;
      shown = true;
      showToast(message);
    };

    void listen<string>(HOTKEY_ERROR_EVENT, (event) => {
      show(event.payload);
    }).then((fn) => {
      if (disposed) fn();
      else unlisten = fn;
    });

    void settingGet("hotkeyError").then((message) => {
      if (!disposed && message !== null) show(message);
    });

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);
}
```

- [ ] **Step 5: テストが通ることを確認する**

Run:
```bash
cd /Users/kei06/dev/smartTaskManagement && npx vitest run src/hooks/useHotkeyErrorToast.test.ts
```

Expected: PASS（3 tests）。

- [ ] **Step 6: Palette に装着する**

`src/components/Palette.tsx` のコンポーネント本体に追加する。

```tsx
import { useHotkeyErrorToast } from "../hooks/useHotkeyErrorToast";

// ...Palette コンポーネント内(useFlushOnHide の隣)
  useHotkeyErrorToast();
```

- [ ] **Step 7: 計画書1の暫定エラー表示を取り除く**

計画書1のTask 17は、UIがまだ無い時点の暫定表示として `App.tsx` にホットキーエラーの
インライン表示（`<p className="palette-error">`）を置いている。トーストと二重に出るので消す。

Run:
```bash
rg -n "HOTKEY_ERROR_EVENT|HOTKEY_ERROR_SETTING_KEY|palette-error" /Users/kei06/dev/smartTaskManagement/src/App.tsx
```

見つかった場合は、`App.tsx` から次を削除する（計画書2でApp.tsxが書き換えられていて見つからない場合はこのステップを飛ばす）。
- `HOTKEY_ERROR_EVENT` / `HOTKEY_ERROR_SETTING_KEY` の定数定義
- `hotkeyError` の `useState` と、`listen(...)` / `invoke("setting_get", ...)` の2つの `useEffect`
- `{hotkeyError !== "" && <p className="palette-error">{hotkeyError}</p>}` の描画

`src/index.css` の `.palette-error` のスタイル定義も併せて削除する。
Escハンドラ（`invoke("palette_hide")`）は計画書2のキーボード処理で使うので**消さない**。

- [ ] **Step 8: 実機で衝突時の通知を確認する**

操作: 一時的にホットキーを macOS が確実に押さえているキー（Spotlightを既定に戻した上で ⌘Space）に変更してからアプリを再起動する。

```bash
sqlite3 ~/Library/Application\ Support/smartTask/smart-task.db \
  "INSERT INTO settings(key,value) VALUES('hotkey','Super+Space') ON CONFLICT(key) DO UPDATE SET value='Super+Space';"
cd /Users/kei06/dev/smartTaskManagement && npm run tauri dev
```

Expected: 起動時に「ホットキーを登録できませんでした」のトーストが10秒表示される。確認後は設定画面から `⌥Space` に戻す。

- [ ] **Step 9: コミット**

```bash
cd /Users/kei06/dev/smartTaskManagement
git add src/hooks/useHotkeyErrorToast.ts src/hooks/useHotkeyErrorToast.test.ts src/components/Palette.tsx src/App.tsx src/index.css
git commit -m "feat: ホットキー登録失敗を起動時にトーストで通知する"
```

---

### Task 13: UIUX磨き込み

このタスクは**frontend-designスキルを読んだ上で全UIを磨き込む**タスク。ただし本プロジェクトには**スキルの指示に優先する上書き条件**がある。必ず先に読むこと。

#### 上書き条件（frontend-designスキルより設計書が優先）

| 項目 | frontend-designスキルの指示 | **本プロジェクトの決定（こちらに従う）** |
|---|---|---|
| フォント | 「システムフォント（Inter/Arial等）を避け、個性的な表示フォントを選べ」 | **`-apple-system, BlinkMacSystemFont, "SF Pro Text", "Hiragino Sans", sans-serif` 固定。** Webフォントの読み込み禁止。設計書の決定事項サマリとUI原則がこれを明示している |
| アイコン | 特に指定なし | **絵文字は完全禁止。lucide-react のみ** |
| 美学の方向性 | 「極端な方向にコミットせよ（マキシマリズム、レトロフューチャー等）」 | **Apple純正風の洗練ミニマル一択。** Spotlight / Raycast の隣に置いて違和感がないこと。奇抜な方向に振らない |
| 色 | 「支配的な色と鋭いアクセント」「紫グラデ禁止」 | 紫グラデ禁止は踏襲。**アクセントはステータス色（#8E8E93 / #007AFF / #FF9500 / #34C759）のみ。** 背景は半透明ニュートラル |
| 背景・質感 | 「グラデーションメッシュ、ノイズ、グレイン等で空気感を」 | **`rgba(250,250,252,0.92)` + backdrop-blur + 角丸16px + 大きめシャドウのみ。** 装飾テクスチャは載せない |
| レイアウト | 「予期せぬレイアウト、非対称、斜め」 | **モックアップ（設計書のUI原則）準拠。** カンバンの縦レーン構成は崩さない |

スキルのうち**そのまま活かす部分**は、モーション（マイクロインタラクション・段階的な出現）、余白とタイポグラフィの精度、細部への執着、実装の完成度。

**Files:**
- Modify: `src/index.css`
- Modify: `src/components/Palette.tsx`
- Modify: `src/components/TaskCard.tsx`
- Modify: `src/components/Board.tsx`
- Modify: `src/components/TaskDetail.tsx`
- Modify: `src/components/BoardSwitcher.tsx`
- Modify: `src/components/StatusSettings.tsx`
- Modify: `src/components/ConfirmDialog.tsx`
- Modify: `src/components/FooterHints.tsx`
- Modify: `src/components/AppSettings.tsx`
- Modify: `src/components/BoardSettings.tsx`

- [ ] **Step 1: frontend-designスキルを読む**

Run:
```bash
cat /Users/kei06/.claude/plugins/cache/claude-plugins-official/frontend-design/unknown/skills/frontend-design/SKILL.md
```

読んだ上で、**上の上書き条件表を必ず適用する**。特に「システムフォントを避けよ」「極端な美学にコミットせよ」の2点は本プロジェクトでは採用しない。

- [ ] **Step 2: アニメーションとダークモードの基盤CSSを追加する**

`src/index.css` の末尾に追記する。

```css
/* ============ smartTask デザイントークン ============ */
:root {
  --st-palette-bg: rgba(250, 250, 252, 0.92);
  --st-palette-border: rgba(0, 0, 0, 0.08);
  --st-text-primary: #1c1c1e;
  --st-text-secondary: #6e6e73;
  --st-text-tertiary: #a1a1a6;
  --st-surface-hover: rgba(0, 0, 0, 0.04);
  --st-surface-selected: rgba(0, 0, 0, 0.07);
  --st-shadow: 0 24px 64px rgba(0, 0, 0, 0.22), 0 2px 8px rgba(0, 0, 0, 0.08);
  /* Apple純正のイージング(macOSのウィンドウアニメーションに近い) */
  --st-ease: cubic-bezier(0.32, 0.72, 0, 1);
}

@media (prefers-color-scheme: dark) {
  :root {
    --st-palette-bg: rgba(28, 28, 30, 0.9);
    --st-palette-border: rgba(255, 255, 255, 0.1);
    --st-text-primary: #f5f5f7;
    --st-text-secondary: #a1a1a6;
    --st-text-tertiary: #6e6e73;
    --st-surface-hover: rgba(255, 255, 255, 0.06);
    --st-surface-selected: rgba(255, 255, 255, 0.1);
    --st-shadow: 0 24px 64px rgba(0, 0, 0, 0.5), 0 2px 8px rgba(0, 0, 0, 0.3);
  }
}

/* ============ パレットの出現/消失 ============ */
@keyframes st-palette-in {
  from {
    opacity: 0;
    transform: scale(0.96) translateY(-6px);
  }
  to {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
}

.st-palette {
  background: var(--st-palette-bg);
  border: 0.5px solid var(--st-palette-border);
  border-radius: 16px;
  box-shadow: var(--st-shadow);
  backdrop-filter: saturate(180%) blur(30px);
  -webkit-backdrop-filter: saturate(180%) blur(30px);
  color: var(--st-text-primary);
  animation: st-palette-in 180ms var(--st-ease) both;
}

/* ============ ドリルイン遷移(ボード→詳細) ============ */
@keyframes st-drill-in {
  from {
    opacity: 0;
    transform: translateX(16px);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
}

@keyframes st-drill-back {
  from {
    opacity: 0;
    transform: translateX(-16px);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
}

.st-view-forward {
  animation: st-drill-in 200ms var(--st-ease) both;
}

.st-view-back {
  animation: st-drill-back 200ms var(--st-ease) both;
}

/* ============ カードのマイクロインタラクション ============ */
.st-card {
  transition:
    background-color 120ms var(--st-ease),
    transform 120ms var(--st-ease),
    box-shadow 120ms var(--st-ease);
}

.st-card[data-selected="true"] {
  background-color: var(--st-surface-selected);
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

.st-card:hover:not([data-selected="true"]) {
  background-color: var(--st-surface-hover);
}

/* BlockNoteのダークモード配色をパレットに合わせる */
.bn-root[data-color-scheme="dark"] {
  --bn-colors-editor-background: transparent;
  --bn-colors-editor-text: #f5f5f7;
  --bn-colors-menu-background: #2c2c2e;
  --bn-colors-menu-text: #f5f5f7;
  --bn-colors-border: rgba(255, 255, 255, 0.12);
}

.bn-root[data-color-scheme="light"] {
  --bn-colors-editor-background: transparent;
  --bn-colors-editor-text: #1c1c1e;
  --bn-colors-border: rgba(0, 0, 0, 0.08);
}

/* OSの視差効果を減らす設定を尊重する */
@media (prefers-reduced-motion: reduce) {
  .st-palette,
  .st-view-forward,
  .st-view-back {
    animation: none;
  }
  .st-card {
    transition: none;
  }
}
```

- [ ] **Step 3: Palette にトークンとドリルイン遷移を適用する**

`src/components/Palette.tsx` のルート要素のクラスを `st-palette` を使う形に置き換え、view切替に方向付きのアニメーションを付ける。

```tsx
import { useEffect, useRef, useState } from "react";

// ...Palette コンポーネント内
  // 詳細へ進むときは右から、戻るときは左からスライドさせる
  const previousViewRef = useRef(view);
  const [direction, setDirection] = useState<"forward" | "back">("forward");
  useEffect(() => {
    const order: Record<View, number> = {
      board: 0,
      detail: 1,
      switcher: 1,
      settings: 1,
    };
    setDirection(
      order[view] >= order[previousViewRef.current] ? "forward" : "back",
    );
    previousViewRef.current = view;
  }, [view]);
```

描画部分をこの形にする。

```tsx
    <div className="st-palette flex h-full w-full flex-col overflow-hidden">
      <div
        key={view}
        className={`min-h-0 flex-1 ${
          direction === "forward" ? "st-view-forward" : "st-view-back"
        }`}
      >
        {view === "board" && <Board />}
        {view === "detail" && <TaskDetail key={selectedTaskId ?? "none"} />}
        {view === "switcher" && <BoardSwitcher />}
        {view === "settings" && <BoardSettings />}
      </div>
      <FooterHints view={view} />
    </div>
```

`View` 型のインポートを追加する。

```tsx
import type { View } from "../types";
```

- [ ] **Step 4: TaskCard にマイクロインタラクションを適用する**

`src/components/TaskCard.tsx` のカードのルート要素に `st-card` クラスと `data-selected` 属性を付ける。既存の選択時の背景色クラス（`bg-...`）はCSS側と二重になるので取り除く。

```tsx
    <div
      data-selected={isSelected}
      className="st-card flex cursor-default items-center gap-2 rounded-lg px-3 py-2 text-sm"
    >
```

`isSelected` は既存の選択判定のboolean変数名に合わせること。次で確認する。

Run:
```bash
rg -n "selected|isSelected" /Users/kei06/dev/smartTaskManagement/src/components/TaskCard.tsx
```

- [ ] **Step 5: 各画面の色指定をデザイントークンへ寄せる**

Task 3〜12で書いた `text-neutral-900` / `text-neutral-500` / `bg-black/[0.06]` などのハードコードを、次の対応で CSS 変数に置き換える。ダークモードで文字が見えなくなるのを防ぐためにこれが必要。

| 置換前 | 置換後（`style` 属性またはユーティリティ） |
|---|---|
| `text-neutral-900` | `style={{ color: "var(--st-text-primary)" }}` |
| `text-neutral-600` / `text-neutral-500` | `style={{ color: "var(--st-text-secondary)" }}` |
| `text-neutral-400` / `text-neutral-300` | `style={{ color: "var(--st-text-tertiary)" }}` |
| `bg-black/[0.06]` （選択行） | `style={{ backgroundColor: "var(--st-surface-selected)" }}` |
| `hover:bg-black/5` | `className="st-card"` を付けてホバーをCSSに任せる |
| `border-black/5` | `style={{ borderColor: "var(--st-palette-border)" }}` |
| `bg-white`（ConfirmDialogの箱） | `style={{ backgroundColor: "var(--st-palette-bg)" }}` |

対象ファイル: `TaskDetail.tsx` / `BoardSwitcher.tsx` / `StatusSettings.tsx` / `BoardSettings.tsx` / `AppSettings.tsx` / `ConfirmDialog.tsx` / `FooterHints.tsx`。

- [ ] **Step 6: 空状態をデザインする**

`src/components/Board.tsx` に、タスクが0件のときの空状態を追加する。レーン内が空のときはレーンのプレースホルダを出し、ボード全体が空のときは中央に案内を出す。

```tsx
import { Inbox } from "lucide-react";

// ...Board の描画部分、タスクが1件も無い場合
  if (tasks.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-8 text-center">
        <Inbox
          size={28}
          strokeWidth={1.5}
          style={{ color: "var(--st-text-tertiary)" }}
        />
        <p
          className="text-sm"
          style={{ color: "var(--st-text-secondary)" }}
        >
          タスクはまだありません
        </p>
        <p className="text-xs" style={{ color: "var(--st-text-tertiary)" }}>
          タスク名を入力して Enter で作成できます
        </p>
      </div>
    );
  }
```

`src/components/Lane.tsx` の、そのレーンにタスクが無い場合の表示。

```tsx
      {laneTasks.length === 0 && (
        <div
          className="rounded-lg border border-dashed px-3 py-4 text-center text-xs"
          style={{
            borderColor: "var(--st-palette-border)",
            color: "var(--st-text-tertiary)",
          }}
        >
          なし
        </div>
      )}
```

`laneTasks` は既存のレーン内タスク配列の変数名に合わせること。次で確認する。

Run:
```bash
rg -n "tasks|filter" /Users/kei06/dev/smartTaskManagement/src/components/Lane.tsx
```

`src/components/BoardSwitcher.tsx` はボードが必ず1枚以上あるため空状態は不要。`src/components/StatusSettings.tsx` も最後の1つは削除不可のため不要。

- [ ] **Step 7: 全テストと型チェックを通す**

Run:
```bash
cd /Users/kei06/dev/smartTaskManagement && npx tsc --noEmit && npx vitest run
```

Expected: 型エラーなし。全テストPASS。色指定の置換で `getByText` が壊れていないことを確認する。

- [ ] **Step 8: ライトモードで見た目を確認する**

Run:
```bash
cd /Users/kei06/dev/smartTaskManagement && npm run tauri dev
```

チェック項目:
- ⌥Space でパレットが出るとき、フェード＋わずかな拡大（0.96→1.0）になっている
- カード選択が矢印キーで移るとき、背景と1pxの浮きが滑らかに追従する
- Enter で詳細に入るとき右からスライドイン、Esc で戻るとき左からスライドインする
- フォントがSF Proで、絵文字が1つも出ていない

- [ ] **Step 9: ダークモードで見た目を確認する**

操作: システム設定 → 外観 → ダーク に切り替える（アプリは起動したまま）。

Expected: パレット背景が `rgba(28,28,30,0.9)` になり、本文・ヒント・ステータスチップがすべて可読。BlockNoteエディタもダーク配色に切り替わる。コントラストが足りない箇所があれば `src/index.css` のトークンを調整する。

- [ ] **Step 10: 空状態を確認する**

操作: ⌘B → N → 「空ボード」を作成 → 何も作らずボード画面を見る。

Expected: Inboxアイコンと「タスクはまだありません」「タスク名を入力して Enter で作成できます」が中央に出る。

- [ ] **Step 11: コミット**

```bash
cd /Users/kei06/dev/smartTaskManagement
git add src/index.css src/components/
git commit -m "style: パレットのアニメーション・ダークモード・空状態を整える"
```

---

### Task 14: 手動スモークチェックリストと最終検証

**Files:**
- Create: `docs/superpowers/checklists/2026-08-20-manual-smoke.md`

- [ ] **Step 1: チェックリストのディレクトリを作る**

Run:
```bash
mkdir -p /Users/kei06/dev/smartTaskManagement/docs/superpowers/checklists
```

- [ ] **Step 2: 手動スモークチェックリストを書く**

`docs/superpowers/checklists/2026-08-20-manual-smoke.md`:

```markdown
# smartTask 手動スモークチェックリスト

設計書のテスト方針「E2E（実ウィンドウ・実ホットキー）は手動スモークで代替する」に対応する。
リリース前およびキーボード操作に触れる変更のたびに全項目を実施する。

実施前の準備: `npm run tauri build` でビルドし、`/Applications` へ配置した実アプリで確認する
（`npm run tauri dev` ではNSPanelとホットキーの挙動が実配布時と異なることがあるため）。

## 1. 起動・ホットキー

| # | 手順 | 期待結果 | 結果 |
|---|---|---|---|
| 1-1 | アプリを起動する | Dockにアイコンが出ず、メニューバーにアイコンが常駐する | |
| 1-2 | 別アプリ（Safari等）を前面にして ⌥Space | パレットが最前面に出る。Safariのウィンドウは背面のまま | |
| 1-3 | もう一度 ⌥Space | パレットが消える | |
| 1-4 | アプリをもう一度起動する | 二重起動せず、既存プロセスのパレットが出る | |
| 1-5 | ホットキーを他アプリが押さえた状態で起動する | 「ホットキーを登録できませんでした」のトーストが出る | |
| 1-6 | メニューバーアイコン → 開く | パレットが出る | |
| 1-7 | メニューバーアイコン → 終了 | プロセスが終了する | |

## 2. ボード画面のキーマップ

| # | 手順 | 期待結果 | 結果 |
|---|---|---|---|
| 2-1 | パレットを開いて `会議` と打つ | 検索バーに入り、リアルタイムに絞り込まれる | |
| 2-2 | 入力があり未選択の状態で Enter | 「会議」というタスクが先頭レーンに作られ、詳細画面が開く | |
| 2-3 | 検索バーで ↓ | フォーカスがボードへ移り、先頭カードが選択される | |
| 2-4 | ← → | 隣のレーンのカードへ選択が移る（空レーンは飛ばす） | |
| 2-5 | ↑ ↓ | 同じレーン内で選択が上下する | |
| 2-6 | カード選択中に Enter | 詳細画面が開く | |
| 2-7 | ⌘→ | 選択カードが右のレーンへ移動する | |
| 2-8 | ⌘← | 選択カードが左のレーンへ戻る | |
| 2-9 | ⌘↓ | 同じレーン内で1つ下へ並び替わる | |
| 2-10 | ⌘↑ | 同じレーン内で1つ上へ並び替わる | |
| 2-11 | ⌘⌫ | カードが消える | |
| 2-12 | ⌘Z | 消したカードが元の位置に戻る | |
| 2-13 | ⌘N | 検索バーへフォーカスが移り、入力が空になる | |
| 2-14 | ⌘2 | 2枚目のボードへ切り替わる | |
| 2-15 | ⌘B | ボードスイッチャーが開く | |
| 2-16 | ⌘, | 設定画面が開く | |
| 2-17 | Esc | パレットが閉じる | |
| 2-18 | タスクが0件のボードを開く | 「タスクはまだありません」の空状態が出る | |

## 3. 詳細画面

| # | 手順 | 期待結果 | 結果 |
|---|---|---|---|
| 3-1 | 本文に `# 見出し` と打つ | 打った瞬間に見出しブロックへ変換される | |
| 3-2 | 本文に `- ` と打つ | 箇条書きブロックへ変換される | |
| 3-3 | 本文に `- [ ] ` と打つ | チェックボックスブロックへ変換される | |
| 3-4 | 本文に ``` と打つ | コードブロックへ変換される | |
| 3-5 | ⌘→ | ヘッダーのステータスチップが隣のステータスに変わる | |
| 3-6 | ⌘T | タイトル入力にフォーカスが移り、全選択される | |
| 3-7 | タイトルを書き換えて Esc | ボードへ戻り、カードのタイトルが更新されている | |
| 3-8 | 本文を打った直後（1秒未満）に Esc → Esc | パレットが閉じる。再度開くと本文が保存されている | |
| 3-9 | 本文を打った直後に ⌥Space で隠す | 再度開くと本文が保存されている | |
| 3-10 | 「ボード」ボタンをクリック | ボードへ戻る | |
| 3-11 | フォントを確認する | SF Pro（-apple-system）。Interになっていない | |

## 4. ボードスイッチャー（⌘B）

| # | 手順 | 期待結果 | 結果 |
|---|---|---|---|
| 4-1 | ⌘B | 現在のボードが選択された状態でリストが出る | |
| 4-2 | ↑ ↓ | 選択が移動し、末尾に「新規ボード」がある | |
| 4-3 | Enter（ボード選択中） | そのボードへ切り替わり、ボード画面へ戻る | |
| 4-4 | ⌘3 | 3枚目のボードへ直接切り替わる | |
| 4-5 | N → 名前入力 → Enter | ボードが作られ、デフォルトステータス4つを持った状態で開く | |
| 4-6 | 名前を空のまま Enter | 作成されずリストに戻る | |
| 4-7 | R → 名前を変更 → Enter | ボード名が変わる | |
| 4-8 | R → Esc | 変更が破棄される | |
| 4-9 | ⌘⌫ | 「タスクとステータスもすべて削除されます」の確認が出る | |
| 4-10 | 確認で Enter | ボードが消え、残ったボードへ切り替わる | |
| 4-11 | 確認で Esc | 削除されない | |
| 4-12 | ボードが1枚のときに ⌘⌫ | 「最後のボードは削除できません」のトーストが出る | |
| 4-13 | Esc | ボード画面へ戻る | |

## 5. 設定（⌘,）

| # | 手順 | 期待結果 | 結果 |
|---|---|---|---|
| 5-1 | ⌘, | ボードタブでステータス一覧が出る | |
| 5-2 | ↑ ↓ | 選択が移動する | |
| 5-3 | Enter → 名前変更 → Enter | ステータス名が変わり、ボード画面のレーン見出しにも反映される | |
| 5-4 | C → ← → → Enter | ステータス色が変わり、カードのアクセント色にも反映される | |
| 5-5 | ⌘↓ | ステータスの並び順が1つ下がり、レーンの並びも入れ替わる | |
| 5-6 | N → 名前入力 → Enter | 末尾に新しいステータスが追加される | |
| 5-7 | タスクがあるステータスで ⌘⌫ | 「タスクは『（先頭ステータス名）』へ移動します」の確認が出る | |
| 5-8 | 確認で Enter | ステータスが消え、そのタスクが先頭ステータスへ移っている | |
| 5-9 | ステータスが1つのときに ⌘⌫ | 「最後のステータスは削除できません」のトーストが出る | |
| 5-10 | Tab | アプリタブへ切り替わる | |
| 5-11 | 自動起動トグルをON | `~/Library/LaunchAgents/` にplistが作られる | |
| 5-12 | 自動起動トグルをOFF | plistが消える | |
| 5-13 | 「変更」→ ⌃⌥T | 表示が ⌃⌥T になり、⌃⌥T でパレットが開くようになる | |
| 5-14 | 「変更」→ 他アプリが押さえたキー | エラーが赤字で表示され、表示は元のキーのまま | |
| 5-15 | 「変更」→ Esc | 録音が中止され、変更されない | |
| 5-16 | Esc | ボード画面へ戻る | |

## 6. 自動保存とデータ永続

| # | 手順 | 期待結果 | 結果 |
|---|---|---|---|
| 6-1 | 本文を編集して1秒待つ | `sqlite3 ~/Library/Application\ Support/smartTask/smart-task.db "SELECT content_md FROM tasks ORDER BY updated_at DESC LIMIT 1;"` に反映されている | |
| 6-2 | 本文を編集した直後にアプリを終了する | 再起動後も編集内容が残っている | |
| 6-3 | ボード・ステータス・タスクを一通り作る → 再起動 | すべて再現される（並び順・色・本文含む） | |
| 6-4 | タスクを ⌘⌫ で削除 → 再起動 | 削除されたタスクは表示されない | |
| 6-5 | DBファイルの場所を確認する | `~/Library/Application Support/smartTask/smart-task.db` にある | |

## 7. 見た目

| # | 手順 | 期待結果 | 結果 |
|---|---|---|---|
| 7-1 | パレットを開く | フェード＋わずかな拡大で出現する | |
| 7-2 | 詳細へ入る／戻る | 右から入り、左から戻るドリルイン遷移になる | |
| 7-3 | 矢印キーでカード選択を移す | 背景と浮きが滑らかに追従する | |
| 7-4 | システム設定をダークにする | パレット・エディタ・ヒントすべてがダーク配色になり可読 | |
| 7-5 | 全画面を見る | 絵文字が1つも使われていない（アイコンはlucideのみ） | |
| 7-6 | システム設定 → アクセシビリティ → 視差効果を減らす をON | アニメーションが無効になる | |

## 8. ゴールデンパス

| # | 手順 | 期待結果 | 結果 |
|---|---|---|---|
| 8-1 | 「⌥Space → タスク名を打つ → Enter → 本文を書く → Esc → Esc」を実行する | 一度もマウスに触れずタスクの作成と本文入力が完結し、内容が保存されている | |
```

- [ ] **Step 3: フロントのテスト一式を実行する**

Run:
```bash
cd /Users/kei06/dev/smartTaskManagement && npm test -- --run
```

Expected: 全テストPASS。失敗があれば直してから次へ進む。

- [ ] **Step 4: Rustのテスト一式を実行する**

Run:
```bash
cd /Users/kei06/dev/smartTaskManagement/src-tauri && cargo test
```

Expected: 全テストPASS。

- [ ] **Step 5: 型チェックと本番ビルドを実行する**

Run:
```bash
cd /Users/kei06/dev/smartTaskManagement && npx tsc --noEmit && npm run tauri build
```

Expected: 型エラーなし。`src-tauri/target/release/bundle/macos/smartTask.app` が生成される。

- [ ] **Step 6: 手動スモークチェックリストを実施する**

Run:
```bash
open /Users/kei06/dev/smartTaskManagement/src-tauri/target/release/bundle/macos/smartTask.app
```

`docs/superpowers/checklists/2026-08-20-manual-smoke.md` の全項目（8セクション・計77項目）を上から順に実施し、結果欄に `OK` / `NG` を記入する。NGがあれば該当タスクへ戻って修正し、修正後に該当セクションを再実施する。

- [ ] **Step 7: コミット**

```bash
cd /Users/kei06/dev/smartTaskManagement
git add docs/superpowers/checklists/2026-08-20-manual-smoke.md
git commit -m "docs: 手動スモークチェックリストを追加"
```

---

## 完了条件

- [ ] `npm test -- --run` が全PASS
- [ ] `cd src-tauri && cargo test` が全PASS
- [ ] `npx tsc --noEmit` が型エラーなし
- [ ] `npm run tauri build` が成功
- [ ] 手動スモークチェックリストの全77項目がOK
- [ ] 設計書のキーボード操作仕様（グローバル／ボード画面／詳細画面）がすべて動作
- [ ] 絵文字が1つも使われていない（アイコンはlucide-reactのみ）
- [ ] フォントが `-apple-system` 系で統一されている（BlockNote内を含む）

---

## 実装コントラクトとの関係（逸脱の申告）

本計画は実装コントラクトの名前・型・シグネチャを変更していない。判断が必要だった点を明記する。

1. **ストアにボード/ステータスのCRUDアクションを追加しなかった。**
   コントラクトの `AppState` にはボード作成・ステータス編集のアクションが無い。追加すると公開形の変更になるため、`BoardSwitcher` / `StatusSettings` から `src/lib/api.ts` を直接呼び、成功後に `loadBoards()` / `selectBoard(currentBoardId)` で再読込する方式を採った。

2. **ホットキー再登録は逸脱なし（コントラクトと計画書1に吸収済み）。**
   `setting_set` が `key == "hotkey"` のとき `panel::reregister_hotkey(&app)` を呼ぶ挙動、
   `toggle_panel` / `reregister_hotkey` / `HOTKEY_ERROR_EVENT` の固定名はすべて実装コントラクトに追記され、
   計画書1が実装する。この計画書はRust側を一切変更せず、Task 11 Step 8 で存在を検証してから
   フロントの `settingSet("hotkey", accelerator)` を呼ぶだけ。invoke側のシグネチャは不変。

3. **コントラクトのファイル一覧に無いコンポーネント／モジュールを追加した（改名ではなく追加）。**
   `StatusSettings.tsx` / `AppSettings.tsx` / `ConfirmDialog.tsx` / `FooterHints.tsx` / `src/lib/detailBridge.ts` / `src/lib/statusPalette.ts` / `src/lib/accelerator.ts` / `src/hooks/useDebouncedSave.ts` / `usePrefersDark.ts` / `useFlushOnHide.ts` / `useHotkeyErrorToast.ts`。
   コントラクトが定めた `BoardSettings.tsx` は設定画面のルートとして残し、その中身を責務ごとに分割した形にしてある。

4. **`hotkeyError` キーも逸脱なし（コントラクトと計画書1に吸収済み）。**
   起動直後の `emit` は購読が間に合わず取りこぼすため、Rust側が失敗内容を settings の
   `hotkeyError`（`repo::HOTKEY_ERROR_SETTING_KEY`）にも書く仕組みは計画書1が実装する。
   この計画書のフロントは、`listen("hotkey-error")` と `settingGet("hotkeyError")` の両方で拾うだけ。
   なお計画書1のTask 17が置く暫定のインライン表示は、Task 12 Step 7 でトーストに一本化する。
