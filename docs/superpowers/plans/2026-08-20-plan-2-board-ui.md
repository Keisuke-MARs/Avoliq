# 計画書2: ボードUI（カンバン + キーボード操作）実装計画

> **注記(2026-08-21)**: 本計画の実行後、製品名は smartTask から **Avoliq** に正式改名された。
> 本文中の `smartTask` / `smart-task` は実行当時の記録。現行の正しい名前は実装コントラクトを参照。

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** smartTaskのパレット内に「ステータスごとの縦レーン(カンバン) + 検索/クイック追加 + キーボードだけで完結する盤面操作」を実装し、マウスに触れずタスクの作成・移動・並び替え・削除・復元ができる状態にする。

**Architecture:** Rust側の全Tauriコマンド(計画書1で実装済み)を `src/lib/api.ts` の薄いinvokeラッパーで包み、`src/store/appStore.ts`(zustand)が唯一の状態源になる。盤面のカーソル移動やレーン構築といった判断ロジックは副作用のない純関数として `src/lib/boardNav.ts` に切り出し、Reactに依存せず単体テストできるようにする。UIコンポーネントは表示専用で、キーイベントは `src/hooks/useKeyboard.ts` の1箇所に集約してviewごとにディスパッチする。

**Tech Stack:** React 19 / TypeScript / Vite / zustand v5 / Tailwind CSS v4 / lucide-react v1 / sonner v2 / Vitest v4 + @testing-library/react v16 + @testing-library/user-event v14 / @tauri-apps/api v2

---

## 前提条件（計画書1の完了状態）

この計画は以下がすでに動いている前提で始まる。

- Tauri v2 + React + TypeScript + Vite プロジェクトがリポジトリルートに存在する（`src/` と `src-tauri/`）
- Tailwind CSS v4 + shadcn/ui + lucide-react が導入済み、`@/*` → `./src/*` のパスエイリアスが `vite.config.ts` と `tsconfig.json` の両方に設定済み
- `src-tauri` 側に実装コントラクトの表にある全Tauriコマンド（`boards_list` 〜 `setting_set`）が実装・テスト済みで `invoke_handler` に登録済み
- NSPanel + グローバルホットキーでパレットが表示/非表示できる
- `src/App.tsx` はプレースホルダーのみ

最初のタスクで上記を実際に検証してから着手する。

---

## 事前に確定させた技術的事実（調査済み）

実装中に迷ったらここを参照すること。すべて公式ドキュメント／パッケージ実体で確認済み。

1. **`invoke` のimportパスは `@tauri-apps/api/core`**（v1の `@tauri-apps/api/tauri` ではない）。
2. **Tauriコマンドの引数はJS側camelCase → Rust側snake_case に自動変換される。**
   Rust `fn tasks_list(board_id: String)` に対してJSは `invoke('tasks_list', { boardId })` と書く。
   コマンド名（第1引数）は変換されず、Rustの関数名そのまま（snake_case）。
3. **`Result<T, String>` の `Err` は Promise の reject になる。** `catch (e)` で受け、`String(e)` でメッセージ化する。
4. **Rust側 `Option<String>` にはJSから `null` を渡せる**（serdeが `None` にデシリアライズする）。
5. **zustand v5 のセレクタで新しいオブジェクト／配列を返すと無限再レンダリングになる。**
   レーン構築などの派生計算はセレクタ内ではなくコンポーネントのレンダリング本体で行う。
6. **lucide-react は v1 系。** v0からブランドアイコンが削除され一部が改名された（`Loader2`→`LoaderCircle` 等）。
   この計画で使うのは `Search` / `Circle` の2つのみで、どちらもv1.33.0の型定義に存在することを確認済み。
   v1では `aria-hidden` がデフォルトtrueなので、テストでアイコンをroleで取得することはできない。
7. **lucide の各アイコンは通常のSVG属性を受け取る。** `<Circle stroke={color} fill={color} />` で塗りつぶせる。
8. **Vitest v4 は jsdom を自動インストールしない。** `jsdom` を明示的にdevDependencyへ入れる必要がある。
9. **`@testing-library/react` v16 は `@testing-library/dom` をpeerDependencyとして自前で入れる必要がある。**
10. **user-event の修飾キー構文は `{Meta>}...{/Meta}`。** `>` で押しっぱなし、`/` で解放。この間のキーイベントには `metaKey: true` が乗る。
11. **jsdom には `Element.prototype.scrollIntoView` が無い。** セットアップファイルでスタブする。

---

## ファイル構成

### 新規作成（フロントエンド本体）

| ファイル | 責務 |
|---|---|
| `src/types.ts` | 実装コントラクトの共有型（`Board` / `Status` / `Task` / `View`）のみ |
| `src/lib/api.ts` | Tauriコマンド1つにつき関数1つのinvokeラッパー。ここ以外で `invoke` を呼ばない |
| `src/lib/boardNav.ts` | 絞り込み・レーン構築・カーソル移動先計算の純関数群（React非依存） |
| `src/store/appStore.ts` | zustandストア。実装コントラクトの `AppState` 公開形どおり |
| `src/hooks/useKeyboard.ts` | `window` の keydown を1本だけ張り、viewごとにキーをディスパッチ |
| `src/components/Palette.tsx` | ルート。view切替 + フッターのキーボードヒント + Toaster |
| `src/components/SearchBar.tsx` | 検索兼クイック追加の入力欄 |
| `src/components/Board.tsx` | レーンを横に並べる器 |
| `src/components/Lane.tsx` | 1レーン（ヘッダー + カード一覧） |
| `src/components/TaskCard.tsx` | 1カード |
| `src/components/ui/sonner.tsx` | sonnerの `Toaster` ラッパー（手書き。理由はTask 1に記載） |

### 新規作成（テスト基盤・テスト）

| ファイル | 責務 |
|---|---|
| `setup-vitest.ts` | jest-dom拡張・scrollIntoViewスタブ・DOMクリーンアップ（Task 4でストアリセットを追記） |
| `src/test/fixtures.ts` | テスト用のボード/ステータス/タスク固定データ |
| `src/lib/api.test.ts` | invoke名と引数のcamelCase変換の検証 |
| `src/lib/boardNav.test.ts` | 絞り込み・レーン構築・カーソル移動の検証 |
| `src/store/appStore.test.ts` | ストアの読み込み系・変更系（楽観的更新とロールバック） |
| `src/components/Board.test.tsx` | レーン描画・選択強調の検証 |
| `src/components/Palette.test.tsx` | キーボード操作の統合テスト |

### 変更

| ファイル | 変更内容 |
|---|---|
| `package.json` | テスト用devDependencies追加、`test` スクリプト追加 |
| `vite.config.ts` | `test` セクション追加 |
| `tsconfig.json` | `include` に `setup-vitest.ts` を追加 |
| `src/App.tsx` | プレースホルダーを `<Palette />` に差し替え |
| `src-tauri/src/panel.rs` | `palette_hide` コマンドが無ければ追加（Task 2で確認） |
| `src-tauri/src/lib.rs` | `palette_hide` を `invoke_handler` に登録（同上） |

### この計画のスコープ外（計画書3の担当）

- `src/components/TaskDetail.tsx`（BlockNote）と詳細画面の `⌘←→` / `⌘T`
- `src/components/BoardSwitcher.tsx` / `src/components/BoardSettings.tsx` の中身
- 見た目の磨き込み（アニメーション・影・余白の微調整・ダークモード）

`Palette.tsx` はこの3ビューに対して「Escで盤面に戻れる最小のプレースホルダー」を描画する。
`⌘1〜9` / `⌘B` / `⌘,` の**キー割当そのものはこの計画で確定させる**（遷移先コンポーネントの中身だけが計画書3の担当）。

---

## この計画で自分で決めた仕様

実装コントラクト／設計書に書かれていなかったため、ここで確定させる。実装中に勝手に変えないこと。

### A. ステータスアイコンの方式

**採用: レーンヘッダーには常に `Circle` アイコン1種類だけを使い、`fill` と `stroke` にそのステータスの `color` を入れて塗り分ける。**

理由: ステータスはユーザーが自由に追加・改名できるため、名前やposition順でアイコンを出し分けると
「ステータスを5つ目に足した」「"未着手"を"バックログ"に改名した」瞬間に対応が破綻する。
色は `statuses.color` に必ず存在する属性なので、色だけで識別する方式ならステータスが何個あっても、
どんな名前でも破綻しない。形の違いによる情報量は捨て、色 + テキストラベルで識別する。

### B. カーソル移動（←→↑↓）の規則

「レーン」は `statuses` を position昇順に並べたもの。「行」は各レーンのタスクを position昇順に並べたもの。
**絞り込み後のタスクだけを対象にする。**

| 状況 | キー | 動作 |
|---|---|---|
| 未選択（検索バーにフォーカス） | ↓ | 一番左の「空でないレーン」の先頭カードを選択 |
| 未選択 | ↑ | 何もしない |
| 未選択 | ←→ | **インターセプトしない**（入力欄のキャレット移動を優先） |
| カード選択中・行0 | ↑ | 選択解除 → 検索バーへフォーカスを戻す |
| カード選択中・行0より下 | ↑ | 同レーンの1つ上を選択 |
| カード選択中・最終行 | ↓ | 何もしない（選択維持） |
| カード選択中・最終行以外 | ↓ | 同レーンの1つ下を選択 |
| カード選択中 | ← | 左方向へ走査し、**最初に見つかった空でないレーン**へ移動。空レーンは飛ばす |
| カード選択中 | → | 右方向へ同上 |
| 移動先レーンが見つからない | ←→ | 何もしない（選択維持） |

レーン跨ぎの着地行は `min(現在の行, 移動先レーンの件数 - 1)`。つまり行3から2件しかないレーンへ移ると行1に着地する。

絞り込みによって選択中のカードが表示対象から消えた場合は、選択を解除して検索バーへ戻す（`setSearchQuery` 内で処理）。

### C. 絞り込みと「行番号」の使い分け

- **カーソル移動（←→↑↓）** は絞り込み**後**のリストで計算する。見えていないカードへは飛ばない。
- **並び替え（⌘↑↓）** は絞り込み**前**のレーン全件で行番号を計算する。DBのpositionは絞り込みと無関係な絶対順序なので、
  絞り込み中に並び替えても正しい位置に入る。

### D. ステータス移動（⌘←→）の着地位置

隣接ステータス（position順で1つ隣。**空レーンも飛ばさない**）へ `task_move(id, statusId, 0)` で移動する。
移動先レーンの**先頭**に入れる理由は、`task_create` も先頭挿入なので「最後に触ったものが上に来る」で一貫するため。
端のレーンにいる場合は何もしない。選択は移動したタスクに追従する。

### E. 削除後の選択

`⌘⌫` の後は、同レーンの「1つ下のカード」を選択する。無ければ「1つ上のカード」。それも無ければ選択解除（検索バーへ戻る）。

### F. 楽観的更新の適用範囲

| アクション | 方式 | 理由 |
|---|---|---|
| `moveSelectedTask` / `reorderSelectedTask` / `deleteSelectedTask` / `updateTaskTitle` / `updateTaskContent` | 楽観的更新（先にローカル更新 → 失敗時スナップショットへロールバック + トースト） | 対象タスクが手元にあるので即座に反映できる |
| `createTaskFromSearch` | **API先行** | IDがRust側で採番されるUUIDなので、レスポンスを待たないと本物のタスクを作れない |
| `undoDelete` | **API先行** | 復元後の `position` はRust側の状態に依存するため |
| `loadBoards` / `selectBoard` | API先行（読み込みのみ） | 更新対象が存在しない |

### G. 検索バーへのフォーカス受け渡し

`useKeyboard` は React の ref ではなく `document.getElementById(SEARCH_INPUT_ID)` で入力欄を掴む。
window の keydown ハンドラは React のツリー外に張るため、refをContextで配り回すよりDOM idの方が単純で、
テストからも同じ手段で検証できる。id は `useKeyboard.ts` が `SEARCH_INPUT_ID` として公開し、`SearchBar` がそれを使う。

### H. Escの挙動

- `view === "board"`: 検索クエリと選択をクリアしてから `palette_hide` を invoke する。
  次にホットキーで開いたとき前回の入力が残っていない、Spotlightと同じ体験にするため。
- `view === "detail" | "switcher" | "settings"`: `setView("board")` で盤面に戻る（設計書の「グローバル」キーマップ）。

---

## 実装コントラクトからの逸脱・追加（承認が必要）

1. **`palette_hide` コマンドの追加**（必須）。
   設計書・コントラクトともに「Esc → パレット非表示（Rust側 hide）」とだけ書かれており、
   コマンド表にhide用のコマンドが載っていない。フロントからEscで隠すには必ずコマンドが要る。
   コマンド表の命名規則（`board_create` / `task_delete` = `<名詞>_<動詞>`）に合わせて `palette_hide` とする。
   計画書1側が別名で実装していた場合は、`src/lib/api.ts` の `hidePalette()` 内の invoke 名1箇所だけを合わせる（Task 2で確認する）。

2. **`initialAppState` の追加エクスポート**（軽微）。
   コントラクトの `AppState` インターフェースはそのまま実装するが、テストでストアを初期状態に戻すために
   データ部分だけを `initialAppState` という定数として別途エクスポートする。`AppState` の形は一切変えない。

3. **`src/lib/boardNav.ts` の新設**（軽微）。
   コントラクトのファイル構成表には無いファイル。カーソル移動ロジックをストアにもコンポーネントにも
   置かず純関数として独立させるため。`AppState` に新しいメソッドを生やさずに済むという意味で、
   むしろコントラクトの公開形を守るための追加。

---

## Task 1: フロントエンドのテスト基盤とトースト基盤を整える

**Files:**
- Modify: `package.json`
- Modify: `vite.config.ts`
- Modify: `tsconfig.json`
- Create: `setup-vitest.ts`
- Create: `src/components/ui/sonner.tsx`

- [ ] **Step 1: 計画書1の完了状態を確認する**

```bash
ls src/App.tsx src/main.tsx vite.config.ts tsconfig.json src-tauri/src/commands.rs
grep -n '"@/\*"' tsconfig.json
grep -n 'alias' vite.config.ts
grep -c 'tauri::command' src-tauri/src/commands.rs
```

期待する結果:
- 5つのファイルがすべて存在する
- `tsconfig.json` に `"@/*": ["./src/*"]` の記述がある
- `vite.config.ts` に `alias` の記述がある
- `grep -c` の結果が `18` 以上（コントラクトのコマンド18個）

いずれかが満たされない場合は計画書1が未完了なので、ここで停止して報告する。

- [ ] **Step 2: テスト用の依存とsonnerをインストールする**

```bash
npm install sonner@^2.0.8
npm install -D vitest@^4.1.11 jsdom@^30.0.1 @testing-library/react@^16.3.2 @testing-library/dom@^10.4.1 @testing-library/user-event@^14.6.5 @testing-library/jest-dom@^7.0.1
```

期待する結果: `added N packages` と表示され、エラーが出ない。

補足: `jsdom` は Vitest v4 が自動インストールしないため明示的に入れる。
`@testing-library/dom` は `@testing-library/react` v16 のpeerDependencyなので明示的に入れる。

- [ ] **Step 3: `package.json` にテストスクリプトを追加する**

`scripts` に2行を追加する。

```json
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview",
    "tauri": "tauri",
    "test": "vitest run",
    "test:watch": "vitest"
  },
```

（`dev` / `build` / `preview` / `tauri` は計画書1が生成した既存の値をそのまま残し、`test` と `test:watch` の2つだけ足す）

- [ ] **Step 4: `vite.config.ts` に `test` セクションを追加する**

ファイル先頭に型参照コメントを足し、`defineConfig` が返すオブジェクトに `test` を追加する。
既存の `plugins` / `resolve` / `clearScreen` / `envPrefix` / `server` はそのまま残すこと。

```ts
/// <reference types="vitest/config" />
```

を1行目に追加し、設定オブジェクトへ以下を追加する。

```ts
  // Vitest 設定（jsdom + Testing Library）
  test: {
    globals: false,
    environment: "jsdom",
    setupFiles: ["./setup-vitest.ts"],
    clearMocks: true,
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
  },
```

`globals: false` にしているので、各テストファイルは `import { describe, it, expect, vi } from "vitest";` を明示的に書く。

- [ ] **Step 5: `tsconfig.json` の `include` にセットアップファイルを足す**

```json
  "include": ["src", "setup-vitest.ts"]
```

（既存の `"include": ["src"]` を上記に置き換える）

- [ ] **Step 6: `setup-vitest.ts` を作成する**

```ts
// Vitest の全テストファイルで共通に走るセットアップ。
import "@testing-library/jest-dom/vitest";
import { afterEach, vi } from "vitest";
import { cleanup } from "@testing-library/react";

// jsdom は scrollIntoView を実装していないため、呼ばれても落ちないようスタブする。
Element.prototype.scrollIntoView = vi.fn();

afterEach(() => {
  cleanup();
});
```

zustandストアのリセットは、ストアが存在するようになるTask 4でこのファイルに追記する。

補足（採用しなかった案）: zustand公式ドキュメントは `__mocks__/zustand.ts` に
`vi.importActual` を使った自動モックを置き `vi.mock('zustand')` する方式を案内しているが、
`__mocks__` の置き場所がVitestのrootに依存して壊れやすく、トップレベル `await` を含むため
挙動が読みにくい。ストアが1つしかない本アプリでは、Task 4で入れる明示的な
`setState(initialAppState, false)` リセットの方が確実。

- [ ] **Step 7: `src/components/ui/sonner.tsx` を手書きで作成する**

```tsx
import { Toaster as SonnerToaster } from "sonner";
import type { ToasterProps } from "sonner";

/**
 * sonner の Toaster ラッパー。
 * shadcn/ui の CLI が生成する版は next-themes に依存しており Vite プロジェクトでは動かないため、
 * テーマ固定（light）の最小構成を手書きしている。
 */
export function Toaster(props: ToasterProps) {
  return (
    <SonnerToaster
      theme="light"
      position="bottom-right"
      closeButton={false}
      toastOptions={{
        classNames: {
          toast: "rounded-xl border border-black/5 bg-white text-[13px] shadow-lg",
        },
      }}
      {...props}
    />
  );
}
```

- [ ] **Step 8: テストランナーが起動することを確認する**

```bash
npx vitest run
```

期待する結果: `No test files found, exiting with code 1` と表示されて終了する（テストがまだ無いため終了コード1は正常）。
`Cannot find package 'jsdom'` や設定の読み込みエラーが出た場合はStep 2〜5を見直す。

- [ ] **Step 9: コミット**

```bash
git add package.json package-lock.json vite.config.ts tsconfig.json setup-vitest.ts src/components/ui/sonner.tsx
git commit -m "chore: フロントエンドのVitest/Testing Library基盤とsonnerを導入"
```

---

## Task 2: 共有型定義とTauri invokeラッパー

**Files:**
- Create: `src/types.ts`
- Create: `src/lib/api.ts`
- Test: `src/lib/api.test.ts`
- Modify: `src-tauri/src/panel.rs`（`palette_hide` が無い場合のみ）
- Modify: `src-tauri/src/lib.rs`（同上）

- [ ] **Step 1: `src/types.ts` を作成する**

実装コントラクトの型定義をそのまま写す。1文字も変えないこと。

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

- [ ] **Step 2: 失敗するテスト `src/lib/api.test.ts` を書く**

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import * as api from "./api";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

const invokeMock = vi.mocked(invoke);

describe("Tauri invoke ラッパー", () => {
  beforeEach(() => {
    invokeMock.mockResolvedValue(undefined);
  });

  it("boards_list は引数なしで呼ぶ", async () => {
    await api.boardsList();
    expect(invokeMock).toHaveBeenCalledWith("boards_list");
  });

  it("statuses_list は boardId を camelCase で渡す", async () => {
    await api.statusesList("board-1");
    expect(invokeMock).toHaveBeenCalledWith("statuses_list", { boardId: "board-1" });
  });

  it("tasks_list は boardId を camelCase で渡す", async () => {
    await api.tasksList("board-1");
    expect(invokeMock).toHaveBeenCalledWith("tasks_list", { boardId: "board-1" });
  });

  it("task_create は boardId / statusId / title を渡す", async () => {
    await api.taskCreate("board-1", "st-todo", "牛乳を買う");
    expect(invokeMock).toHaveBeenCalledWith("task_create", {
      boardId: "board-1",
      statusId: "st-todo",
      title: "牛乳を買う",
    });
  });

  it("task_move は newIndex を camelCase で渡す", async () => {
    await api.taskMove("t-a", "st-doing", 0);
    expect(invokeMock).toHaveBeenCalledWith("task_move", {
      id: "t-a",
      statusId: "st-doing",
      newIndex: 0,
    });
  });

  it("task_update は未指定の項目に null を渡す", async () => {
    await api.taskUpdate("t-a", "新しいタイトル", null);
    expect(invokeMock).toHaveBeenCalledWith("task_update", {
      id: "t-a",
      title: "新しいタイトル",
      contentMd: null,
    });
  });

  it("status_update は未指定の項目に null を渡す", async () => {
    await api.statusUpdate("st-todo", null, "#FF0000");
    expect(invokeMock).toHaveBeenCalledWith("status_update", {
      id: "st-todo",
      name: null,
      color: "#FF0000",
    });
  });

  it("status_reorder は newIndex を camelCase で渡す", async () => {
    await api.statusReorder("st-todo", 2);
    expect(invokeMock).toHaveBeenCalledWith("status_reorder", { id: "st-todo", newIndex: 2 });
  });

  it("setting_set は key と value を渡す", async () => {
    await api.settingSet("hotkey", "Alt+Space");
    expect(invokeMock).toHaveBeenCalledWith("setting_set", { key: "hotkey", value: "Alt+Space" });
  });

  it("palette_hide は引数なしで呼ぶ", async () => {
    await api.hidePalette();
    expect(invokeMock).toHaveBeenCalledWith("palette_hide");
  });
});
```

- [ ] **Step 3: テストが失敗することを確認する**

```bash
npx vitest run src/lib/api.test.ts
```

期待する結果: FAIL。`Failed to resolve import "./api"` または
`Cannot find module './api'` というエラーになる。

- [ ] **Step 4: `src/lib/api.ts` を実装する**

コマンド名はコントラクトの表と完全一致（snake_case）、引数キーはcamelCaseで渡す。

```ts
import { invoke } from "@tauri-apps/api/core";
import type { Board, Status, Task } from "@/types";

// ---- ボード ----

export function boardsList(): Promise<Board[]> {
  return invoke<Board[]>("boards_list");
}

export function boardCreate(name: string): Promise<Board> {
  return invoke<Board>("board_create", { name });
}

export function boardRename(id: string, name: string): Promise<Board> {
  return invoke<Board>("board_rename", { id, name });
}

export function boardDelete(id: string): Promise<void> {
  return invoke<void>("board_delete", { id });
}

// ---- ステータス ----

export function statusesList(boardId: string): Promise<Status[]> {
  return invoke<Status[]>("statuses_list", { boardId });
}

export function statusCreate(boardId: string, name: string, color: string): Promise<Status> {
  return invoke<Status>("status_create", { boardId, name, color });
}

// name / color は変更しない項目に null を渡す（Rust側 Option<String> の None になる）
export function statusUpdate(
  id: string,
  name: string | null,
  color: string | null,
): Promise<Status> {
  return invoke<Status>("status_update", { id, name, color });
}

export function statusDelete(id: string): Promise<void> {
  return invoke<void>("status_delete", { id });
}

export function statusReorder(id: string, newIndex: number): Promise<Status[]> {
  return invoke<Status[]>("status_reorder", { id, newIndex });
}

// ---- タスク ----

export function tasksList(boardId: string): Promise<Task[]> {
  return invoke<Task[]>("tasks_list", { boardId });
}

export function taskCreate(boardId: string, statusId: string, title: string): Promise<Task> {
  return invoke<Task>("task_create", { boardId, statusId, title });
}

// title / contentMd は変更しない項目に null を渡す
export function taskUpdate(
  id: string,
  title: string | null,
  contentMd: string | null,
): Promise<Task> {
  return invoke<Task>("task_update", { id, title, contentMd });
}

export function taskMove(id: string, statusId: string, newIndex: number): Promise<Task> {
  return invoke<Task>("task_move", { id, statusId, newIndex });
}

export function taskDelete(id: string): Promise<Task> {
  return invoke<Task>("task_delete", { id });
}

export function taskRestore(id: string): Promise<Task> {
  return invoke<Task>("task_restore", { id });
}

// ---- 設定 ----

export function settingGet(key: string): Promise<string | null> {
  return invoke<string | null>("setting_get", { key });
}

export function settingSet(key: string, value: string): Promise<void> {
  return invoke<void>("setting_set", { key, value });
}

// ---- パレット制御 ----

/** Escキーでパレットを隠す。Rust側でNSPanelの hide() を呼ぶ。 */
export function hidePalette(): Promise<void> {
  return invoke<void>("palette_hide");
}
```

- [ ] **Step 5: テストが通ることを確認する**

```bash
npx vitest run src/lib/api.test.ts
```

期待する結果: PASS（10 passed）。

- [ ] **Step 6: Rust側に `palette_hide` があるか確認する**

```bash
grep -rn "palette_hide" src-tauri/src/
```

期待する結果A: `src-tauri/src/panel.rs` と `src-tauri/src/lib.rs` にヒットする → Step 7・8を飛ばしてStep 9へ。

期待する結果B: 何もヒットしない → Step 7・8を実施する。

期待する結果C: 別名（例 `hide_panel`）のhideコマンドがある →
`src/lib/api.ts` の `hidePalette()` と `src/lib/api.test.ts` の該当テストの invoke 名を
そのコマンド名に1箇所ずつ書き換え、Step 5を再実行してからStep 9へ。

- [ ] **Step 7: `src-tauri/src/panel.rs` に `palette_hide` を追加する（Step 6が結果Bの場合のみ）**

ファイル末尾に追加する。パネルのラベル文字列（下記の `"main"`）は
計画書1がパネル生成時に使ったラベルと一致させること（`grep -n 'PanelBuilder\|get_webview_panel\|to_panel' src-tauri/src/panel.rs` で確認できる）。

```rust
/// パレットを隠す。フロントエンドのEscキーから呼ばれる。
#[tauri::command]
pub fn palette_hide(app: tauri::AppHandle) -> Result<(), String> {
    use tauri_nspanel::ManagerExt;
    let panel = app
        .get_webview_panel("main")
        .map_err(|e| format!("パネルが見つかりません: {e}"))?;
    panel.hide();
    Ok(())
}
```

- [ ] **Step 8: `src-tauri/src/lib.rs` の `invoke_handler` に登録する（Step 6が結果Bの場合のみ）**

`tauri::generate_handler![...]` の末尾に `panel::palette_hide` を追加する。

```rust
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
            panel::palette_hide,
        ])
```

そのうえでビルドを確認する。

```bash
cd src-tauri && cargo check && cd ..
```

期待する結果: `Finished` で終わる（warningは可、errorは不可）。

- [ ] **Step 9: コミット**

```bash
git add src/types.ts src/lib/api.ts src/lib/api.test.ts src-tauri/src
git commit -m "feat: 共有型定義とTauriコマンドのinvokeラッパーを追加"
```

---

## Task 3: 盤面ナビゲーションの純関数（boardNav）

**Files:**
- Create: `src/test/fixtures.ts`
- Create: `src/lib/boardNav.ts`
- Test: `src/lib/boardNav.test.ts`

- [ ] **Step 1: テスト用フィクスチャ `src/test/fixtures.ts` を作成する**

```ts
import type { Board, Status, Task } from "@/types";

export const board: Board = { id: "board-1", name: "メイン", position: 0 };
export const board2: Board = { id: "board-2", name: "私用", position: 1 };

export const statuses: Status[] = [
  { id: "st-todo", boardId: "board-1", name: "未着手", color: "#8E8E93", position: 0 },
  { id: "st-doing", boardId: "board-1", name: "進行中", color: "#007AFF", position: 1 },
  { id: "st-check", boardId: "board-1", name: "確認中", color: "#FF9500", position: 2 },
  { id: "st-done", boardId: "board-1", name: "完了", color: "#34C759", position: 3 },
];

function makeTask(id: string, statusId: string, title: string, position: number): Task {
  return {
    id,
    boardId: "board-1",
    statusId,
    title,
    contentMd: "",
    position,
    createdAt: "2026-08-20T00:00:00Z",
    updatedAt: "2026-08-20T00:00:00Z",
  };
}

// 未着手に3件 / 進行中に2件 / 確認中は空 / 完了に1件
export const tasks: Task[] = [
  makeTask("t-a", "st-todo", "牛乳を買う", 0),
  makeTask("t-b", "st-todo", "資料をまとめる", 1),
  makeTask("t-c", "st-todo", "牛丼を食べる", 2),
  makeTask("t-d", "st-doing", "設計レビュー", 0),
  makeTask("t-e", "st-doing", "実装する", 1),
  makeTask("t-f", "st-done", "リリース準備", 0),
];

export { makeTask };
```

- [ ] **Step 2: 失敗するテスト `src/lib/boardNav.test.ts` を書く**

```ts
import { describe, expect, it } from "vitest";
import {
  buildLanes,
  filterTasks,
  locateTask,
  nextSelectedTaskId,
  selectionAfterDelete,
} from "./boardNav";
import { statuses, tasks } from "@/test/fixtures";

const lanes = buildLanes(statuses, tasks);

describe("filterTasks", () => {
  it("空クエリなら全件返す", () => {
    expect(filterTasks(tasks, "")).toHaveLength(6);
  });

  it("タイトルの部分一致で絞り込む", () => {
    expect(filterTasks(tasks, "牛").map((t) => t.id)).toEqual(["t-a", "t-c"]);
  });

  it("前後の空白を無視する", () => {
    expect(filterTasks(tasks, "  牛丼  ").map((t) => t.id)).toEqual(["t-c"]);
  });

  it("英字は大文字小文字を区別しない", () => {
    const withAscii = [...tasks, { ...tasks[0], id: "t-g", title: "Release Note" }];
    expect(filterTasks(withAscii, "release").map((t) => t.id)).toEqual(["t-g"]);
  });

  it("一致しなければ空配列", () => {
    expect(filterTasks(tasks, "存在しない")).toEqual([]);
  });
});

describe("buildLanes", () => {
  it("ステータスをposition昇順に並べる", () => {
    expect(lanes.map((l) => l.status.id)).toEqual(["st-todo", "st-doing", "st-check", "st-done"]);
  });

  it("各レーンのタスクをposition昇順に並べる", () => {
    expect(lanes[0].tasks.map((t) => t.id)).toEqual(["t-a", "t-b", "t-c"]);
  });

  it("タスクの無いレーンも空配列で残す", () => {
    expect(lanes[2].tasks).toEqual([]);
  });

  it("statusesの入力順が乱れていてもposition順に直す", () => {
    const shuffled = [statuses[3], statuses[1], statuses[0], statuses[2]];
    expect(buildLanes(shuffled, tasks).map((l) => l.status.id)).toEqual([
      "st-todo",
      "st-doing",
      "st-check",
      "st-done",
    ]);
  });
});

describe("locateTask", () => {
  it("レーン番号と行番号を返す", () => {
    expect(locateTask(lanes, "t-e")).toEqual({ lane: 1, row: 1 });
  });

  it("存在しないIDには null を返す", () => {
    expect(locateTask(lanes, "t-zzz")).toBeNull();
  });
});

describe("nextSelectedTaskId", () => {
  it("未選択で↓なら一番左の空でないレーンの先頭を選ぶ", () => {
    expect(nextSelectedTaskId(lanes, null, "down")).toBe("t-a");
  });

  it("未選択で↑なら選択しないまま", () => {
    expect(nextSelectedTaskId(lanes, null, "up")).toBeNull();
  });

  it("未選択で←→なら選択しないまま", () => {
    expect(nextSelectedTaskId(lanes, null, "left")).toBeNull();
    expect(nextSelectedTaskId(lanes, null, "right")).toBeNull();
  });

  it("タスクが1件も無ければ↓でも選択しない", () => {
    expect(nextSelectedTaskId(buildLanes(statuses, []), null, "down")).toBeNull();
  });

  it("一番左のレーンが空なら↓は次に空でないレーンの先頭を選ぶ", () => {
    const onlyDoing = buildLanes(
      statuses,
      tasks.filter((t) => t.statusId === "st-doing"),
    );
    expect(nextSelectedTaskId(onlyDoing, null, "down")).toBe("t-d");
  });

  it("↓で同レーンの次の行へ進む", () => {
    expect(nextSelectedTaskId(lanes, "t-a", "down")).toBe("t-b");
  });

  it("最終行で↓なら選択は動かない", () => {
    expect(nextSelectedTaskId(lanes, "t-c", "down")).toBe("t-c");
  });

  it("↑で同レーンの前の行へ戻る", () => {
    expect(nextSelectedTaskId(lanes, "t-c", "up")).toBe("t-b");
  });

  it("行0で↑なら選択を外して検索バーへ戻る", () => {
    expect(nextSelectedTaskId(lanes, "t-a", "up")).toBeNull();
  });

  it("→で右隣のレーンへ移り、行番号を維持する", () => {
    expect(nextSelectedTaskId(lanes, "t-b", "right")).toBe("t-e");
  });

  it("→で移った先が短いレーンなら最終行に着地する", () => {
    expect(nextSelectedTaskId(lanes, "t-c", "right")).toBe("t-e");
  });

  it("→は空のレーンを飛ばす", () => {
    // 進行中(行0) → 確認中は空なので飛ばして 完了(行0)
    expect(nextSelectedTaskId(lanes, "t-d", "right")).toBe("t-f");
  });

  it("←は空のレーンを飛ばす", () => {
    expect(nextSelectedTaskId(lanes, "t-f", "left")).toBe("t-d");
  });

  it("右端のレーンで→なら選択は動かない", () => {
    expect(nextSelectedTaskId(lanes, "t-f", "right")).toBe("t-f");
  });

  it("左端のレーンで←なら選択は動かない", () => {
    expect(nextSelectedTaskId(lanes, "t-a", "left")).toBe("t-a");
  });

  it("選択中のIDがレーンに存在しなければ選択を外す", () => {
    expect(nextSelectedTaskId(lanes, "t-zzz", "down")).toBeNull();
  });
});

describe("selectionAfterDelete", () => {
  it("同レーンの1つ下を選ぶ", () => {
    expect(selectionAfterDelete(lanes, "t-a")).toBe("t-b");
  });

  it("最終行なら1つ上を選ぶ", () => {
    expect(selectionAfterDelete(lanes, "t-c")).toBe("t-b");
  });

  it("レーンに1件しか無ければ選択を外す", () => {
    expect(selectionAfterDelete(lanes, "t-f")).toBeNull();
  });

  it("存在しないIDなら選択を外す", () => {
    expect(selectionAfterDelete(lanes, "t-zzz")).toBeNull();
  });
});
```

- [ ] **Step 3: テストが失敗することを確認する**

```bash
npx vitest run src/lib/boardNav.test.ts
```

期待する結果: FAIL。`Failed to resolve import "./boardNav"`。

- [ ] **Step 4: `src/lib/boardNav.ts` を実装する**

```ts
import type { Status, Task } from "@/types";

/** 1レーン分の表示データ（ステータスと、そのステータスに属するタスク） */
export interface LaneData {
  status: Status;
  tasks: Task[];
}

/** カーソル移動の方向 */
export type MoveDir = "left" | "right" | "up" | "down";

/**
 * 検索クエリでタスクを絞り込む。
 * タイトルの部分一致・英字は大文字小文字を区別しない。空クエリなら全件。
 */
export function filterTasks(tasks: Task[], query: string): Task[] {
  const q = query.trim().toLowerCase();
  if (q === "") return tasks;
  return tasks.filter((t) => t.title.toLowerCase().includes(q));
}

/**
 * ステータス(position昇順)ごとにタスク(position昇順)をまとめてレーン配列を作る。
 * タスクが1件も無いステータスも空のレーンとして残す。
 */
export function buildLanes(statuses: Status[], tasks: Task[]): LaneData[] {
  const sortedStatuses = [...statuses].sort((a, b) => a.position - b.position);
  return sortedStatuses.map((status) => ({
    status,
    tasks: tasks
      .filter((t) => t.statusId === status.id)
      .sort((a, b) => a.position - b.position),
  }));
}

/** 指定タスクのレーン番号・行番号を返す。見つからなければ null。 */
export function locateTask(
  lanes: LaneData[],
  taskId: string,
): { lane: number; row: number } | null {
  for (let lane = 0; lane < lanes.length; lane += 1) {
    const row = lanes[lane].tasks.findIndex((t) => t.id === taskId);
    if (row !== -1) return { lane, row };
  }
  return null;
}

/** 指定方向で最初に見つかる「空でないレーン」の番号を返す。無ければ null。 */
function findAdjacentNonEmptyLane(lanes: LaneData[], from: number, step: number): number | null {
  for (let i = from + step; i >= 0 && i < lanes.length; i += step) {
    if (lanes[i].tasks.length > 0) return i;
  }
  return null;
}

/**
 * カーソル移動後に選択されるべきタスクIDを返す。
 * null は「選択なし = 検索バーにフォーカスがある状態」を表す。
 * 移動できない場合は現在の選択をそのまま返す。
 */
export function nextSelectedTaskId(
  lanes: LaneData[],
  selectedTaskId: string | null,
  dir: MoveDir,
): string | null {
  // 未選択（検索バーにいる）状態
  if (selectedTaskId === null) {
    if (dir !== "down") return null;
    const firstLane = findAdjacentNonEmptyLane(lanes, -1, 1);
    if (firstLane === null) return null;
    return lanes[firstLane].tasks[0].id;
  }

  const pos = locateTask(lanes, selectedTaskId);
  // 絞り込み等で選択中のカードが消えている場合は検索バーへ戻す
  if (pos === null) return null;

  const laneTasks = lanes[pos.lane].tasks;

  if (dir === "up") {
    // 行0からさらに上へ行くと検索バーへ戻る
    if (pos.row === 0) return null;
    return laneTasks[pos.row - 1].id;
  }

  if (dir === "down") {
    if (pos.row >= laneTasks.length - 1) return selectedTaskId;
    return laneTasks[pos.row + 1].id;
  }

  // 左右: 空のレーンは飛ばす
  const step = dir === "left" ? -1 : 1;
  const targetLane = findAdjacentNonEmptyLane(lanes, pos.lane, step);
  if (targetLane === null) return selectedTaskId;
  const targetTasks = lanes[targetLane].tasks;
  const targetRow = Math.min(pos.row, targetTasks.length - 1);
  return targetTasks[targetRow].id;
}

/**
 * タスクを削除した直後に選択すべきタスクIDを返す。
 * 同レーンの1つ下 → 1つ上 → 選択なし、の順で決める。
 */
export function selectionAfterDelete(lanes: LaneData[], deletedTaskId: string): string | null {
  const pos = locateTask(lanes, deletedTaskId);
  if (pos === null) return null;
  const laneTasks = lanes[pos.lane].tasks;
  if (pos.row < laneTasks.length - 1) return laneTasks[pos.row + 1].id;
  if (pos.row > 0) return laneTasks[pos.row - 1].id;
  return null;
}
```

- [ ] **Step 5: テストが通ることを確認する**

```bash
npx vitest run src/lib/boardNav.test.ts
```

期待する結果: PASS（31 passed）。

- [ ] **Step 6: コミット**

```bash
git add src/test/fixtures.ts src/lib/boardNav.ts src/lib/boardNav.test.ts
git commit -m "feat: 盤面のカーソル移動と絞り込みの純関数を追加"
```

---

## Task 4: zustandストア（読み込みと選択）

**Files:**
- Create: `src/store/appStore.ts`
- Test: `src/store/appStore.test.ts`
- Modify: `setup-vitest.ts`

- [ ] **Step 1: 失敗するテスト `src/store/appStore.test.ts` を書く**

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "@/lib/api";
import { toast } from "sonner";
import { useAppStore } from "./appStore";
import { board, board2, statuses, tasks } from "@/test/fixtures";

vi.mock("@/lib/api", () => ({
  boardsList: vi.fn(),
  statusesList: vi.fn(),
  tasksList: vi.fn(),
  taskCreate: vi.fn(),
  taskUpdate: vi.fn(),
  taskMove: vi.fn(),
  taskDelete: vi.fn(),
  taskRestore: vi.fn(),
  hidePalette: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

const mocked = vi.mocked(api);

/** 「メインボードを読み込み済み」の状態を作る */
async function loadFixtureBoard(): Promise<void> {
  mocked.boardsList.mockResolvedValue([board, board2]);
  mocked.statusesList.mockResolvedValue(statuses);
  mocked.tasksList.mockResolvedValue(tasks);
  await useAppStore.getState().loadBoards();
}

describe("appStore: 初期状態", () => {
  it("すべて空・view は board", () => {
    const s = useAppStore.getState();
    expect(s.boards).toEqual([]);
    expect(s.currentBoardId).toBeNull();
    expect(s.statuses).toEqual([]);
    expect(s.tasks).toEqual([]);
    expect(s.selectedTaskId).toBeNull();
    expect(s.view).toBe("board");
    expect(s.searchQuery).toBe("");
    expect(s.lastDeletedTaskId).toBeNull();
  });
});

describe("appStore: loadBoards", () => {
  it("ボード一覧を読み込み、先頭ボードを自動選択する", async () => {
    await loadFixtureBoard();
    const s = useAppStore.getState();
    expect(s.boards).toHaveLength(2);
    expect(s.currentBoardId).toBe("board-1");
    expect(s.statuses).toHaveLength(4);
    expect(s.tasks).toHaveLength(6);
  });

  it("失敗したらトーストを出して状態を変えない", async () => {
    mocked.boardsList.mockRejectedValue("DB error");
    await useAppStore.getState().loadBoards();
    expect(useAppStore.getState().boards).toEqual([]);
    expect(toast.error).toHaveBeenCalled();
  });
});

describe("appStore: selectBoard", () => {
  it("ステータスとタスクを読み直し、検索と選択をリセットする", async () => {
    await loadFixtureBoard();
    useAppStore.setState({ searchQuery: "牛", selectedTaskId: "t-a", view: "detail" });

    mocked.statusesList.mockResolvedValue([]);
    mocked.tasksList.mockResolvedValue([]);
    await useAppStore.getState().selectBoard("board-2");

    const s = useAppStore.getState();
    expect(s.currentBoardId).toBe("board-2");
    expect(s.statuses).toEqual([]);
    expect(s.tasks).toEqual([]);
    expect(s.searchQuery).toBe("");
    expect(s.selectedTaskId).toBeNull();
    expect(s.view).toBe("board");
  });
});

describe("appStore: setSearchQuery", () => {
  beforeEach(async () => {
    await loadFixtureBoard();
  });

  it("クエリを保存する", () => {
    useAppStore.getState().setSearchQuery("牛");
    expect(useAppStore.getState().searchQuery).toBe("牛");
  });

  it("絞り込みで選択中のカードが消えたら選択を外す", () => {
    useAppStore.getState().setSelectedTask("t-b");
    useAppStore.getState().setSearchQuery("牛");
    expect(useAppStore.getState().selectedTaskId).toBeNull();
  });

  it("選択中のカードが絞り込み後も残るなら選択を保つ", () => {
    useAppStore.getState().setSelectedTask("t-a");
    useAppStore.getState().setSearchQuery("牛");
    expect(useAppStore.getState().selectedTaskId).toBe("t-a");
  });
});

describe("appStore: setView / setSelectedTask", () => {
  it("view を切り替える", () => {
    useAppStore.getState().setView("detail");
    expect(useAppStore.getState().view).toBe("detail");
  });

  it("選択タスクを設定・解除できる", () => {
    useAppStore.getState().setSelectedTask("t-a");
    expect(useAppStore.getState().selectedTaskId).toBe("t-a");
    useAppStore.getState().setSelectedTask(null);
    expect(useAppStore.getState().selectedTaskId).toBeNull();
  });
});
```

- [ ] **Step 2: テストが失敗することを確認する**

```bash
npx vitest run src/store/appStore.test.ts
```

期待する結果: FAIL。`Failed to resolve import "./appStore"`。

- [ ] **Step 3: `src/store/appStore.ts` の読み込み系を実装する**

`AppState` インターフェースは実装コントラクトの公開形どおり**最初から全メソッド分を宣言する**。
変更系7つはこのステップでは空の非同期関数として置き、Task 5で本体を埋める。

```ts
import { create } from "zustand";
import { toast } from "sonner";
import * as api from "@/lib/api";
import { buildLanes, filterTasks, selectionAfterDelete } from "@/lib/boardNav";
import type { Board, Status, Task, View } from "@/types";

export interface AppState {
  boards: Board[];
  currentBoardId: string | null;
  statuses: Status[];
  tasks: Task[];
  selectedTaskId: string | null;
  view: View;
  searchQuery: string;
  lastDeletedTaskId: string | null;

  loadBoards(): Promise<void>;
  selectBoard(boardId: string): Promise<void>;
  setView(view: View): void;
  setSearchQuery(q: string): void;
  setSelectedTask(id: string | null): void;
  createTaskFromSearch(): Promise<void>;
  moveSelectedTask(dir: "left" | "right"): Promise<void>;
  reorderSelectedTask(dir: "up" | "down"): Promise<void>;
  deleteSelectedTask(): Promise<void>;
  undoDelete(): Promise<void>;
  updateTaskContent(id: string, contentMd: string): Promise<void>;
  updateTaskTitle(id: string, title: string): Promise<void>;
}

/** データ部分だけの初期値。テストのリセットにも使う。 */
export const initialAppState = {
  boards: [] as Board[],
  currentBoardId: null as string | null,
  statuses: [] as Status[],
  tasks: [] as Task[],
  selectedTaskId: null as string | null,
  view: "board" as View,
  searchQuery: "",
  lastDeletedTaskId: null as string | null,
};

export const useAppStore = create<AppState>()((set, get) => ({
  ...initialAppState,

  async loadBoards() {
    try {
      const boards = await api.boardsList();
      set({ boards });
      const first = boards[0];
      // 初回のみ先頭ボードを自動で開く
      if (first !== undefined && get().currentBoardId === null) {
        await get().selectBoard(first.id);
      }
    } catch (e) {
      toast.error(`ボードの読み込みに失敗しました: ${String(e)}`);
    }
  },

  async selectBoard(boardId) {
    try {
      const [statuses, tasks] = await Promise.all([
        api.statusesList(boardId),
        api.tasksList(boardId),
      ]);
      set({
        currentBoardId: boardId,
        statuses,
        tasks,
        selectedTaskId: null,
        searchQuery: "",
        view: "board",
      });
    } catch (e) {
      toast.error(`ボードの読み込みに失敗しました: ${String(e)}`);
    }
  },

  setView(view) {
    set({ view });
  },

  setSearchQuery(q) {
    const { tasks, selectedTaskId } = get();
    // 絞り込みの結果、選択中のカードが表示対象から外れたら選択を解除して検索バーへ戻す
    const stillVisible =
      selectedTaskId !== null && filterTasks(tasks, q).some((t) => t.id === selectedTaskId);
    set({ searchQuery: q, selectedTaskId: stillVisible ? selectedTaskId : null });
  },

  setSelectedTask(id) {
    set({ selectedTaskId: id });
  },

  // --- 以下 Task 5 で実装する ---
  async createTaskFromSearch() {},
  async moveSelectedTask() {},
  async reorderSelectedTask() {},
  async deleteSelectedTask() {},
  async undoDelete() {},
  async updateTaskContent() {},
  async updateTaskTitle() {},
}));
```

このステップの時点では `buildLanes` と `selectionAfterDelete` のimportが未使用でlint警告になる可能性があるが、Task 5で使う。

- [ ] **Step 4: `setup-vitest.ts` にストアリセットを追記する**

ストアができたので、テストごとに初期状態へ戻す処理を足す。ファイル全体を以下に置き換える。

```ts
// Vitest の全テストファイルで共通に走るセットアップ。
import "@testing-library/jest-dom/vitest";
import { afterEach, vi } from "vitest";
import { cleanup } from "@testing-library/react";
import { initialAppState, useAppStore } from "./src/store/appStore";

// jsdom は scrollIntoView を実装していないため、呼ばれても落ちないようスタブする。
Element.prototype.scrollIntoView = vi.fn();

afterEach(() => {
  cleanup();
  // zustand ストアはモジュール単位のシングルトンなので、テストごとに初期状態へ戻す。
  // 第2引数を false（マージ）にすることで、アクション関数はそのまま残る。
  useAppStore.setState(initialAppState, false);
});
```

- [ ] **Step 5: テストが通ることを確認する**

```bash
npx vitest run src/store/appStore.test.ts
```

期待する結果: PASS（9 passed）。

- [ ] **Step 6: 全テストを通す**

```bash
npm test
```

期待する結果: 3ファイル・50テスト（api 10 / boardNav 31 / appStore 9）がすべてPASS。

- [ ] **Step 7: コミット**

```bash
git add src/store/appStore.ts src/store/appStore.test.ts setup-vitest.ts
git commit -m "feat: zustandストアのボード読み込みと選択状態を実装"
```

---

## Task 5: zustandストア（変更系アクションと楽観的更新）

**Files:**
- Modify: `src/store/appStore.ts`
- Test: `src/store/appStore.test.ts`

- [ ] **Step 1: 変更系の失敗するテストを `src/store/appStore.test.ts` の末尾に追加する**

```ts
describe("appStore: createTaskFromSearch", () => {
  beforeEach(async () => {
    await loadFixtureBoard();
  });

  it("検索文字列をタイトルに先頭ステータスへ作成し、詳細画面へ遷移する", async () => {
    const created: Task = {
      id: "t-new",
      boardId: "board-1",
      statusId: "st-todo",
      title: "新しいタスク",
      contentMd: "",
      position: 0,
      createdAt: "2026-08-20T01:00:00Z",
      updatedAt: "2026-08-20T01:00:00Z",
    };
    mocked.taskCreate.mockResolvedValue(created);

    useAppStore.getState().setSearchQuery("新しいタスク");
    await useAppStore.getState().createTaskFromSearch();

    expect(mocked.taskCreate).toHaveBeenCalledWith("board-1", "st-todo", "新しいタスク");
    const s = useAppStore.getState();
    expect(s.tasks).toHaveLength(7);
    expect(s.selectedTaskId).toBe("t-new");
    expect(s.view).toBe("detail");
    expect(s.searchQuery).toBe("");
    // 先頭挿入なので同レーンの既存タスクは1つずつ後ろへずれる
    expect(s.tasks.find((t) => t.id === "t-a")?.position).toBe(1);
    // 別レーンのタスクのpositionは動かない
    expect(s.tasks.find((t) => t.id === "t-d")?.position).toBe(0);
  });

  it("検索文字列が空なら何もしない", async () => {
    await useAppStore.getState().createTaskFromSearch();
    expect(mocked.taskCreate).not.toHaveBeenCalled();
    expect(useAppStore.getState().view).toBe("board");
  });

  it("失敗したらトーストを出し、タスクを増やさない", async () => {
    mocked.taskCreate.mockRejectedValue("DB error");
    useAppStore.getState().setSearchQuery("失敗するタスク");
    await useAppStore.getState().createTaskFromSearch();
    expect(useAppStore.getState().tasks).toHaveLength(6);
    expect(useAppStore.getState().view).toBe("board");
    expect(toast.error).toHaveBeenCalled();
  });
});

describe("appStore: moveSelectedTask", () => {
  beforeEach(async () => {
    await loadFixtureBoard();
    mocked.taskMove.mockResolvedValue(tasks[0]);
  });

  it("→で隣のステータスの先頭へ移す", async () => {
    useAppStore.getState().setSelectedTask("t-b");
    await useAppStore.getState().moveSelectedTask("right");

    expect(mocked.taskMove).toHaveBeenCalledWith("t-b", "st-doing", 0);
    const s = useAppStore.getState();
    const moved = s.tasks.find((t) => t.id === "t-b");
    expect(moved?.statusId).toBe("st-doing");
    expect(moved?.position).toBe(0);
    // 移動先レーンの既存タスクは後ろへずれる
    expect(s.tasks.find((t) => t.id === "t-d")?.position).toBe(1);
    // 移動元レーンで後ろにいたタスクは前へ詰まる
    expect(s.tasks.find((t) => t.id === "t-c")?.position).toBe(1);
    // 選択は移動したタスクに追従する
    expect(s.selectedTaskId).toBe("t-b");
  });

  it("←で1つ前のステータスへ移す", async () => {
    useAppStore.getState().setSelectedTask("t-d");
    await useAppStore.getState().moveSelectedTask("left");
    expect(mocked.taskMove).toHaveBeenCalledWith("t-d", "st-todo", 0);
    expect(useAppStore.getState().tasks.find((t) => t.id === "t-d")?.statusId).toBe("st-todo");
  });

  it("空のレーンへも移せる（空レーンは飛ばさない）", async () => {
    useAppStore.getState().setSelectedTask("t-d");
    await useAppStore.getState().moveSelectedTask("right");
    expect(mocked.taskMove).toHaveBeenCalledWith("t-d", "st-check", 0);
  });

  it("左端のレーンで←なら何もしない", async () => {
    useAppStore.getState().setSelectedTask("t-a");
    await useAppStore.getState().moveSelectedTask("left");
    expect(mocked.taskMove).not.toHaveBeenCalled();
  });

  it("右端のレーンで→なら何もしない", async () => {
    useAppStore.getState().setSelectedTask("t-f");
    await useAppStore.getState().moveSelectedTask("right");
    expect(mocked.taskMove).not.toHaveBeenCalled();
  });

  it("未選択なら何もしない", async () => {
    await useAppStore.getState().moveSelectedTask("right");
    expect(mocked.taskMove).not.toHaveBeenCalled();
  });

  it("失敗したら元の状態へロールバックしトーストを出す", async () => {
    mocked.taskMove.mockRejectedValue("DB error");
    useAppStore.getState().setSelectedTask("t-b");
    await useAppStore.getState().moveSelectedTask("right");

    const s = useAppStore.getState();
    expect(s.tasks.find((t) => t.id === "t-b")?.statusId).toBe("st-todo");
    expect(s.tasks.find((t) => t.id === "t-b")?.position).toBe(1);
    expect(toast.error).toHaveBeenCalled();
  });
});

describe("appStore: reorderSelectedTask", () => {
  beforeEach(async () => {
    await loadFixtureBoard();
    mocked.taskMove.mockResolvedValue(tasks[0]);
  });

  it("↑で同レーンの1つ上と入れ替える", async () => {
    useAppStore.getState().setSelectedTask("t-b");
    await useAppStore.getState().reorderSelectedTask("up");

    expect(mocked.taskMove).toHaveBeenCalledWith("t-b", "st-todo", 0);
    const s = useAppStore.getState();
    expect(s.tasks.find((t) => t.id === "t-b")?.position).toBe(0);
    expect(s.tasks.find((t) => t.id === "t-a")?.position).toBe(1);
  });

  it("↓で同レーンの1つ下と入れ替える", async () => {
    useAppStore.getState().setSelectedTask("t-b");
    await useAppStore.getState().reorderSelectedTask("down");
    expect(mocked.taskMove).toHaveBeenCalledWith("t-b", "st-todo", 2);
    expect(useAppStore.getState().tasks.find((t) => t.id === "t-b")?.position).toBe(2);
  });

  it("先頭で↑なら何もしない", async () => {
    useAppStore.getState().setSelectedTask("t-a");
    await useAppStore.getState().reorderSelectedTask("up");
    expect(mocked.taskMove).not.toHaveBeenCalled();
  });

  it("末尾で↓なら何もしない", async () => {
    useAppStore.getState().setSelectedTask("t-c");
    await useAppStore.getState().reorderSelectedTask("down");
    expect(mocked.taskMove).not.toHaveBeenCalled();
  });

  it("絞り込み中でも絞り込み前の行番号で並び替える", async () => {
    // 「牛」で絞ると t-a(行0) と t-c(行2) だけが見えるが、
    // t-c を↑した結果は絞り込み前の1つ上である t-b との入れ替えになる
    useAppStore.getState().setSelectedTask("t-c");
    useAppStore.getState().setSearchQuery("牛");
    await useAppStore.getState().reorderSelectedTask("up");
    expect(mocked.taskMove).toHaveBeenCalledWith("t-c", "st-todo", 1);
  });

  it("失敗したら元の並びへロールバックしトーストを出す", async () => {
    mocked.taskMove.mockRejectedValue("DB error");
    useAppStore.getState().setSelectedTask("t-b");
    await useAppStore.getState().reorderSelectedTask("up");
    expect(useAppStore.getState().tasks.find((t) => t.id === "t-b")?.position).toBe(1);
    expect(toast.error).toHaveBeenCalled();
  });
});

describe("appStore: deleteSelectedTask / undoDelete", () => {
  beforeEach(async () => {
    await loadFixtureBoard();
  });

  it("選択中のタスクを消し、1つ下を選び直し、undo用に覚えておく", async () => {
    mocked.taskDelete.mockResolvedValue(tasks[0]);
    useAppStore.getState().setSelectedTask("t-a");
    await useAppStore.getState().deleteSelectedTask();

    expect(mocked.taskDelete).toHaveBeenCalledWith("t-a");
    const s = useAppStore.getState();
    expect(s.tasks.map((t) => t.id)).not.toContain("t-a");
    expect(s.selectedTaskId).toBe("t-b");
    expect(s.lastDeletedTaskId).toBe("t-a");
  });

  it("レーンの最後の1件を消したら選択を外す", async () => {
    mocked.taskDelete.mockResolvedValue(tasks[5]);
    useAppStore.getState().setSelectedTask("t-f");
    await useAppStore.getState().deleteSelectedTask();
    expect(useAppStore.getState().selectedTaskId).toBeNull();
  });

  it("未選択なら何もしない", async () => {
    await useAppStore.getState().deleteSelectedTask();
    expect(mocked.taskDelete).not.toHaveBeenCalled();
  });

  it("削除に失敗したらタスクを戻しトーストを出す", async () => {
    mocked.taskDelete.mockRejectedValue("DB error");
    useAppStore.getState().setSelectedTask("t-a");
    await useAppStore.getState().deleteSelectedTask();

    const s = useAppStore.getState();
    expect(s.tasks.map((t) => t.id)).toContain("t-a");
    expect(s.selectedTaskId).toBe("t-a");
    expect(s.lastDeletedTaskId).toBeNull();
    expect(toast.error).toHaveBeenCalled();
  });

  it("undoDelete で直前に削除したタスクを復元して選択する", async () => {
    mocked.taskDelete.mockResolvedValue(tasks[0]);
    mocked.taskRestore.mockResolvedValue(tasks[0]);

    useAppStore.getState().setSelectedTask("t-a");
    await useAppStore.getState().deleteSelectedTask();
    await useAppStore.getState().undoDelete();

    expect(mocked.taskRestore).toHaveBeenCalledWith("t-a");
    const s = useAppStore.getState();
    expect(s.tasks).toHaveLength(6);
    expect(s.tasks.filter((t) => t.id === "t-a")).toHaveLength(1);
    expect(s.selectedTaskId).toBe("t-a");
    expect(s.lastDeletedTaskId).toBeNull();
  });

  it("削除していなければ undoDelete は何もしない", async () => {
    await useAppStore.getState().undoDelete();
    expect(mocked.taskRestore).not.toHaveBeenCalled();
  });

  it("復元に失敗したらトーストを出す", async () => {
    mocked.taskDelete.mockResolvedValue(tasks[0]);
    mocked.taskRestore.mockRejectedValue("DB error");
    useAppStore.getState().setSelectedTask("t-a");
    await useAppStore.getState().deleteSelectedTask();
    await useAppStore.getState().undoDelete();
    expect(useAppStore.getState().tasks).toHaveLength(5);
    expect(toast.error).toHaveBeenCalled();
  });
});

describe("appStore: updateTaskTitle / updateTaskContent", () => {
  beforeEach(async () => {
    await loadFixtureBoard();
    mocked.taskUpdate.mockResolvedValue(tasks[0]);
  });

  it("タイトルを先にローカル反映してから保存する", async () => {
    await useAppStore.getState().updateTaskTitle("t-a", "牛乳と卵を買う");
    expect(mocked.taskUpdate).toHaveBeenCalledWith("t-a", "牛乳と卵を買う", null);
    expect(useAppStore.getState().tasks.find((t) => t.id === "t-a")?.title).toBe("牛乳と卵を買う");
  });

  it("本文を先にローカル反映してから保存する", async () => {
    await useAppStore.getState().updateTaskContent("t-a", "# メモ");
    expect(mocked.taskUpdate).toHaveBeenCalledWith("t-a", null, "# メモ");
    expect(useAppStore.getState().tasks.find((t) => t.id === "t-a")?.contentMd).toBe("# メモ");
  });

  it("保存に失敗したらロールバックしトーストを出す", async () => {
    mocked.taskUpdate.mockRejectedValue("DB error");
    await useAppStore.getState().updateTaskTitle("t-a", "壊れるタイトル");
    expect(useAppStore.getState().tasks.find((t) => t.id === "t-a")?.title).toBe("牛乳を買う");
    expect(toast.error).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: テストが失敗することを確認する**

```bash
npx vitest run src/store/appStore.test.ts
```

期待する結果: FAIL。変更系のテストが多数落ちる（`expected "taskCreate" to be called with ...` など）。
Task 4で書いた9テストはPASSのまま。

- [ ] **Step 3: `createTaskFromSearch` を実装する**

`src/store/appStore.ts` の `async createTaskFromSearch() {},` を以下に置き換える。

```ts
  async createTaskFromSearch() {
    const { currentBoardId, statuses, searchQuery, tasks } = get();
    const title = searchQuery.trim();
    const firstStatus = [...statuses].sort((a, b) => a.position - b.position)[0];
    if (currentBoardId === null || firstStatus === undefined || title === "") return;

    // IDはRust側で採番するUUIDなので、ここだけは楽観的更新ではなくAPI先行で作る
    try {
      const created = await api.taskCreate(currentBoardId, firstStatus.id, title);
      // Rust側は先頭(position=0)に挿入して同レーンを再採番するので、手元も同じようにずらす
      const shifted = tasks.map((t) =>
        t.statusId === firstStatus.id ? { ...t, position: t.position + 1 } : t,
      );
      set({
        tasks: [...shifted, created],
        searchQuery: "",
        selectedTaskId: created.id,
        view: "detail",
      });
    } catch (e) {
      toast.error(`タスクの作成に失敗しました: ${String(e)}`);
    }
  },
```

- [ ] **Step 4: `moveSelectedTask` を実装する**

`async moveSelectedTask() {},` を以下に置き換える。

```ts
  async moveSelectedTask(dir) {
    const { tasks, statuses, selectedTaskId } = get();
    if (selectedTaskId === null) return;
    const task = tasks.find((t) => t.id === selectedTaskId);
    if (task === undefined) return;

    const sorted = [...statuses].sort((a, b) => a.position - b.position);
    const index = sorted.findIndex((s) => s.id === task.statusId);
    // 空のレーンにも移せるよう、ここでは空レーンを飛ばさない
    const target = sorted[dir === "left" ? index - 1 : index + 1];
    if (target === undefined) return;

    const snapshot = tasks;
    // 楽観的更新: 移動先レーンの先頭へ差し込み、前後のレーンを詰め直す
    const optimistic = tasks.map((t) => {
      if (t.id === task.id) return { ...t, statusId: target.id, position: 0 };
      if (t.statusId === target.id) return { ...t, position: t.position + 1 };
      if (t.statusId === task.statusId && t.position > task.position) {
        return { ...t, position: t.position - 1 };
      }
      return t;
    });
    set({ tasks: optimistic });

    try {
      await api.taskMove(task.id, target.id, 0);
    } catch (e) {
      set({ tasks: snapshot });
      toast.error(`ステータスの変更に失敗しました: ${String(e)}`);
    }
  },
```

- [ ] **Step 5: `reorderSelectedTask` を実装する**

`async reorderSelectedTask() {},` を以下に置き換える。

```ts
  async reorderSelectedTask(dir) {
    const { tasks, selectedTaskId } = get();
    if (selectedTaskId === null) return;
    const task = tasks.find((t) => t.id === selectedTaskId);
    if (task === undefined) return;

    // 並び替えは検索の絞り込みとは無関係に、レーン全件の並びで行番号を決める
    const lane = tasks
      .filter((t) => t.statusId === task.statusId)
      .sort((a, b) => a.position - b.position);
    const row = lane.findIndex((t) => t.id === task.id);
    const newRow = dir === "up" ? row - 1 : row + 1;
    if (newRow < 0 || newRow >= lane.length) return;

    const neighbor = lane[newRow];
    const snapshot = tasks;
    // 楽観的更新: 隣とpositionを入れ替える
    const optimistic = tasks.map((t) => {
      if (t.id === task.id) return { ...t, position: neighbor.position };
      if (t.id === neighbor.id) return { ...t, position: task.position };
      return t;
    });
    set({ tasks: optimistic });

    try {
      await api.taskMove(task.id, task.statusId, newRow);
    } catch (e) {
      set({ tasks: snapshot });
      toast.error(`並び順の変更に失敗しました: ${String(e)}`);
    }
  },
```

- [ ] **Step 6: `deleteSelectedTask` と `undoDelete` を実装する**

`async deleteSelectedTask() {},` と `async undoDelete() {},` を以下に置き換える。

```ts
  async deleteSelectedTask() {
    const { tasks, statuses, selectedTaskId, searchQuery } = get();
    if (selectedTaskId === null) return;
    const target = tasks.find((t) => t.id === selectedTaskId);
    if (target === undefined) return;

    // 見えているカードの並びを基準に、次に選ぶカードを決める
    const lanes = buildLanes(statuses, filterTasks(tasks, searchQuery));
    const nextSelected = selectionAfterDelete(lanes, selectedTaskId);

    const snapshot = tasks;
    set({
      tasks: tasks.filter((t) => t.id !== selectedTaskId),
      selectedTaskId: nextSelected,
      lastDeletedTaskId: selectedTaskId,
    });

    try {
      await api.taskDelete(target.id);
    } catch (e) {
      set({ tasks: snapshot, selectedTaskId: target.id, lastDeletedTaskId: null });
      toast.error(`タスクの削除に失敗しました: ${String(e)}`);
    }
  },

  async undoDelete() {
    const { lastDeletedTaskId } = get();
    if (lastDeletedTaskId === null) return;
    // 復元後のpositionはRust側の状態に依存するので、レスポンスをそのまま採用する
    try {
      const restored = await api.taskRestore(lastDeletedTaskId);
      set((s) => ({
        tasks: [...s.tasks.filter((t) => t.id !== restored.id), restored],
        selectedTaskId: restored.id,
        lastDeletedTaskId: null,
      }));
    } catch (e) {
      toast.error(`タスクの復元に失敗しました: ${String(e)}`);
    }
  },
```

- [ ] **Step 7: `updateTaskContent` と `updateTaskTitle` を実装する**

`async updateTaskContent() {},` と `async updateTaskTitle() {},` を以下に置き換える。

```ts
  async updateTaskContent(id, contentMd) {
    const snapshot = get().tasks;
    set({ tasks: snapshot.map((t) => (t.id === id ? { ...t, contentMd } : t)) });
    try {
      await api.taskUpdate(id, null, contentMd);
    } catch (e) {
      set({ tasks: snapshot });
      toast.error(`本文の保存に失敗しました: ${String(e)}`);
    }
  },

  async updateTaskTitle(id, title) {
    const snapshot = get().tasks;
    set({ tasks: snapshot.map((t) => (t.id === id ? { ...t, title } : t)) });
    try {
      await api.taskUpdate(id, title, null);
    } catch (e) {
      set({ tasks: snapshot });
      toast.error(`タイトルの保存に失敗しました: ${String(e)}`);
    }
  },
```

- [ ] **Step 8: テストが通ることを確認する**

```bash
npx vitest run src/store/appStore.test.ts
```

期待する結果: PASS（35 passed）。

- [ ] **Step 9: 型チェックと全テスト**

```bash
npx tsc --noEmit && npm test
```

期待する結果: tscがエラーなしで終了し、3ファイル・76テスト（api 10 / boardNav 31 / appStore 35）がPASS。

- [ ] **Step 10: コミット**

```bash
git add src/store/appStore.ts src/store/appStore.test.ts
git commit -m "feat: タスクの作成・移動・並び替え・削除・復元を楽観的更新で実装"
```

---

## Task 6: カード / レーン / ボードのコンポーネント

**Files:**
- Create: `src/components/TaskCard.tsx`
- Create: `src/components/Lane.tsx`
- Create: `src/components/Board.tsx`
- Test: `src/components/Board.test.tsx`

- [ ] **Step 1: 失敗するテスト `src/components/Board.test.tsx` を書く**

```tsx
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Board } from "./Board";
import { useAppStore } from "@/store/appStore";
import { statuses, tasks } from "@/test/fixtures";

vi.mock("@/lib/api", () => ({
  boardsList: vi.fn(),
  statusesList: vi.fn(),
  tasksList: vi.fn(),
  taskCreate: vi.fn(),
  taskUpdate: vi.fn(),
  taskMove: vi.fn(),
  taskDelete: vi.fn(),
  taskRestore: vi.fn(),
  hidePalette: vi.fn(),
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

function setupBoard(): void {
  useAppStore.setState({ statuses, tasks, currentBoardId: "board-1" });
}

describe("Board", () => {
  it("ステータスの数だけレーンを描画する", () => {
    setupBoard();
    render(<Board />);
    expect(screen.getAllByTestId("lane")).toHaveLength(4);
  });

  it("レーンヘッダーにステータス名と件数を出す", () => {
    setupBoard();
    render(<Board />);
    const lanes = screen.getAllByTestId("lane");
    expect(lanes[0]).toHaveTextContent("未着手");
    expect(lanes[0].querySelector("[data-testid='lane-count']")?.textContent).toBe("3");
    expect(lanes[2]).toHaveTextContent("確認中");
    expect(lanes[2].querySelector("[data-testid='lane-count']")?.textContent).toBe("0");
  });

  it("レーンヘッダーのアイコンをステータス色で塗る", () => {
    setupBoard();
    render(<Board />);
    const icon = screen.getAllByTestId("lane")[1].querySelector("svg");
    expect(icon?.getAttribute("fill")).toBe("#007AFF");
    expect(icon?.getAttribute("stroke")).toBe("#007AFF");
  });

  it("カードをposition順に並べる", () => {
    setupBoard();
    render(<Board />);
    const cards = screen.getAllByTestId("lane")[0].querySelectorAll("[data-testid='task-card']");
    expect([...cards].map((c) => c.textContent)).toEqual([
      "牛乳を買う",
      "資料をまとめる",
      "牛丼を食べる",
    ]);
  });

  it("選択中のカードだけ data-selected が true になる", () => {
    setupBoard();
    useAppStore.setState({ selectedTaskId: "t-b" });
    render(<Board />);
    const selected = screen.getAllByTestId("task-card").filter(
      (c) => c.getAttribute("data-selected") === "true",
    );
    expect(selected).toHaveLength(1);
    expect(selected[0].getAttribute("data-task-id")).toBe("t-b");
  });

  it("選択中のカードにステータス色の枠線を付ける", () => {
    setupBoard();
    useAppStore.setState({ selectedTaskId: "t-d" });
    render(<Board />);
    const card = screen
      .getAllByTestId("task-card")
      .find((c) => c.getAttribute("data-task-id") === "t-d");
    expect(card?.getAttribute("style")).toContain("#007AFF");
  });

  it("検索クエリでカードを絞り込む", () => {
    setupBoard();
    useAppStore.setState({ searchQuery: "牛" });
    render(<Board />);
    expect(screen.getAllByTestId("task-card")).toHaveLength(2);
    expect(screen.getAllByTestId("lane")[0].querySelector("[data-testid='lane-count']")?.textContent).toBe("2");
  });

  it("カードをクリックすると選択される", async () => {
    const user = userEvent.setup();
    setupBoard();
    render(<Board />);
    const card = screen
      .getAllByTestId("task-card")
      .find((c) => c.getAttribute("data-task-id") === "t-c");
    await user.click(card as HTMLElement);
    expect(useAppStore.getState().selectedTaskId).toBe("t-c");
  });
});
```

- [ ] **Step 2: テストが失敗することを確認する**

```bash
npx vitest run src/components/Board.test.tsx
```

期待する結果: FAIL。`Failed to resolve import "./Board"`。

- [ ] **Step 3: `src/components/TaskCard.tsx` を実装する**

```tsx
import { useEffect, useRef } from "react";
import { useAppStore } from "@/store/appStore";
import type { Task } from "@/types";

interface TaskCardProps {
  task: Task;
  /** 所属レーンのステータス色。選択時の強調に使う */
  statusColor: string;
  selected: boolean;
}

export function TaskCard({ task, statusColor, selected }: TaskCardProps) {
  const setSelectedTask = useAppStore((s) => s.setSelectedTask);
  const setView = useAppStore((s) => s.setView);
  const ref = useRef<HTMLDivElement>(null);

  // キーボードで選択が移動したとき、カードが画面外なら見える位置までスクロールする
  useEffect(() => {
    if (selected) ref.current?.scrollIntoView({ block: "nearest" });
  }, [selected]);

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
      className="cursor-default rounded-xl bg-white px-3 py-2 text-[13px] leading-snug text-neutral-900 shadow-sm"
      style={{
        outline: selected ? `2px solid ${statusColor}` : "none",
        outlineOffset: "1px",
      }}
    >
      {task.title}
    </div>
  );
}
```

- [ ] **Step 4: `src/components/Lane.tsx` を実装する**

```tsx
import { Circle } from "lucide-react";
import { TaskCard } from "./TaskCard";
import type { Status, Task } from "@/types";

interface LaneProps {
  status: Status;
  tasks: Task[];
  selectedTaskId: string | null;
}

export function Lane({ status, tasks, selectedTaskId }: LaneProps) {
  return (
    <section
      data-testid="lane"
      data-status-id={status.id}
      className="flex w-56 shrink-0 flex-col"
    >
      <header className="mb-2 flex items-center gap-1.5 px-1">
        {/*
          ステータスのアイコンは常に Circle 1種類で、色だけをステータス色に塗る。
          ユーザーがステータスを自由に追加・改名できるため、
          名前やposition順でアイコンを出し分けるとカスタムステータスで破綻するため。
        */}
        <Circle size={10} stroke={status.color} fill={status.color} strokeWidth={2} />
        <span className="text-[12px] font-semibold text-neutral-700">{status.name}</span>
        <span
          data-testid="lane-count"
          className="ml-auto text-[11px] tabular-nums text-neutral-400"
        >
          {tasks.length}
        </span>
      </header>
      <div className="flex-1 space-y-1.5 overflow-y-auto pb-1">
        {tasks.map((task) => (
          <TaskCard
            key={task.id}
            task={task}
            statusColor={status.color}
            selected={task.id === selectedTaskId}
          />
        ))}
      </div>
    </section>
  );
}
```

- [ ] **Step 5: `src/components/Board.tsx` を実装する**

```tsx
import { Lane } from "./Lane";
import { useAppStore } from "@/store/appStore";
import { buildLanes, filterTasks } from "@/lib/boardNav";

export function Board() {
  // zustand v5 ではセレクタが毎回新しいオブジェクトを返すと無限再レンダリングになるため、
  // 生の配列だけを取り出し、レーンの組み立てはレンダリング本体で行う。
  const statuses = useAppStore((s) => s.statuses);
  const tasks = useAppStore((s) => s.tasks);
  const searchQuery = useAppStore((s) => s.searchQuery);
  const selectedTaskId = useAppStore((s) => s.selectedTaskId);

  const lanes = buildLanes(statuses, filterTasks(tasks, searchQuery));

  return (
    <div data-testid="board" className="flex flex-1 gap-3 overflow-x-auto px-3 py-3">
      {lanes.map((lane) => (
        <Lane
          key={lane.status.id}
          status={lane.status}
          tasks={lane.tasks}
          selectedTaskId={selectedTaskId}
        />
      ))}
    </div>
  );
}
```

- [ ] **Step 6: テストが通ることを確認する**

```bash
npx vitest run src/components/Board.test.tsx
```

期待する結果: PASS（8 passed）。

もし「レーンヘッダーのアイコンをステータス色で塗る」だけが落ちて
`expected null to be '#007AFF'` になる場合は、lucide が `fill` / `stroke` を
属性ではなくスタイルとして出力していないか `screen.debug()` で確認する。

- [ ] **Step 7: コミット**

```bash
git add src/components/TaskCard.tsx src/components/Lane.tsx src/components/Board.tsx src/components/Board.test.tsx
git commit -m "feat: カンバンのレーンとタスクカードを描画するコンポーネントを追加"
```

---

## Task 7: 検索バーとパレットの器

**Files:**
- Create: `src/hooks/useKeyboard.ts`（定数と空フックのみ。本体はTask 8）
- Create: `src/components/SearchBar.tsx`
- Create: `src/components/Palette.tsx`
- Modify: `src/App.tsx`

このタスクは `useKeyboard` を先に用意する必要があるため、
まず `src/hooks/useKeyboard.ts` に `SEARCH_INPUT_ID` の定数だけを置く。
キーマップ本体はTask 8で実装する。

- [ ] **Step 1: `src/hooks/useKeyboard.ts` に定数と空フックを置く**

```ts
/** 検索入力欄のDOM id。window の keydown ハンドラからフォーカスを移すために使う。 */
export const SEARCH_INPUT_ID = "smarttask-search";

/** キーボードディスパッチ。キーマップ本体はTask 8で実装する。 */
export function useKeyboard(): void {}
```

- [ ] **Step 2: `src/components/SearchBar.tsx` を実装する**

```tsx
import { Search } from "lucide-react";
import { useAppStore } from "@/store/appStore";
import { SEARCH_INPUT_ID } from "@/hooks/useKeyboard";

export function SearchBar() {
  const searchQuery = useAppStore((s) => s.searchQuery);
  const setSearchQuery = useAppStore((s) => s.setSearchQuery);

  return (
    <div className="flex h-14 shrink-0 items-center gap-2.5 border-b border-black/5 px-4">
      <Search size={18} className="shrink-0 text-neutral-400" />
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
        onChange={(e) => setSearchQuery(e.target.value)}
        className="w-full bg-transparent text-[17px] text-neutral-900 outline-none placeholder:text-neutral-400"
      />
    </div>
  );
}
```

- [ ] **Step 3: `src/components/Palette.tsx` を実装する**

```tsx
import { useEffect } from "react";
import { Toaster } from "@/components/ui/sonner";
import { Board } from "./Board";
import { SearchBar } from "./SearchBar";
import { useKeyboard } from "@/hooks/useKeyboard";
import { useAppStore } from "@/store/appStore";

/** フッターに常時出すキーボードヒント */
const HINTS: { keys: string; label: string }[] = [
  { keys: "↑↓←→", label: "移動" },
  { keys: "⏎", label: "開く / 作成" },
  { keys: "⌘←→", label: "ステータス" },
  { keys: "⌘↑↓", label: "並び替え" },
  { keys: "⌘⌫", label: "削除" },
  { keys: "⌘Z", label: "元に戻す" },
  { keys: "esc", label: "閉じる" },
];

/** 計画書3で本実装されるビューの仮表示 */
function ViewPlaceholder({ testId, label }: { testId: string; label: string }) {
  return (
    <div data-testid={testId} className="flex-1 px-4 py-6 text-[13px] text-neutral-500">
      {label}（Escで盤面へ戻ります）
    </div>
  );
}

export function Palette() {
  const view = useAppStore((s) => s.view);
  const loadBoards = useAppStore((s) => s.loadBoards);

  useKeyboard();

  useEffect(() => {
    void loadBoards();
  }, [loadBoards]);

  return (
    <div
      data-testid="palette"
      className="flex h-screen w-screen flex-col overflow-hidden rounded-2xl shadow-2xl backdrop-blur-xl"
      style={{
        backgroundColor: "rgba(250,250,252,0.92)",
        fontFamily:
          '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Hiragino Sans", sans-serif',
      }}
    >
      <SearchBar />

      {view === "board" && <Board />}
      {view === "detail" && (
        <ViewPlaceholder testId="detail-placeholder" label="詳細画面は計画書3で実装します" />
      )}
      {view === "switcher" && (
        <ViewPlaceholder
          testId="switcher-placeholder"
          label="ボードスイッチャーは計画書3で実装します"
        />
      )}
      {view === "settings" && (
        <ViewPlaceholder testId="settings-placeholder" label="ボード設定は計画書3で実装します" />
      )}

      <footer
        data-testid="keyboard-hints"
        className="flex h-8 shrink-0 items-center gap-3 border-t border-black/5 px-4 text-[11px] text-neutral-500"
      >
        {HINTS.map((hint) => (
          <span key={hint.keys} className="flex items-center gap-1">
            <kbd className="rounded bg-black/5 px-1 py-0.5 font-sans text-[10px] text-neutral-600">
              {hint.keys}
            </kbd>
            {hint.label}
          </span>
        ))}
      </footer>

      <Toaster />
    </div>
  );
}
```

- [ ] **Step 4: `src/App.tsx` を差し替える**

計画書1が置いたプレースホルダーの中身をすべて消して、以下に置き換える。

```tsx
import { Palette } from "@/components/Palette";

export default function App() {
  return <Palette />;
}
```

- [ ] **Step 5: 型チェックとビルドを確認する**

```bash
npx tsc --noEmit && npm run build
```

期待する結果: どちらもエラーなしで終了し、`dist/` が生成される。

- [ ] **Step 6: 既存テストが壊れていないことを確認する**

```bash
npm test
```

期待する結果: 4ファイル・84テスト（api 10 / boardNav 31 / appStore 35 / Board 8）がすべてPASS。

- [ ] **Step 7: コミット**

```bash
git add src/hooks/useKeyboard.ts src/components/SearchBar.tsx src/components/Palette.tsx src/App.tsx
git commit -m "feat: パレットの器と検索バーを追加しAppに配線"
```

---

## Task 8: キーボードディスパッチ（useKeyboard）

**Files:**
- Modify: `src/hooks/useKeyboard.ts`
- Create: `src/components/Palette.test.tsx`（テストの土台 + 最初の失敗テスト。残りはTask 9で追記）

- [ ] **Step 1: テストの土台と最初の失敗テストを `src/components/Palette.test.tsx` に書く**

```tsx
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Palette } from "./Palette";
import { useAppStore } from "@/store/appStore";
import * as api from "@/lib/api";
import { board, board2, statuses, tasks } from "@/test/fixtures";
import type { Task } from "@/types";

vi.mock("@/lib/api", () => ({
  boardsList: vi.fn(),
  statusesList: vi.fn(),
  tasksList: vi.fn(),
  taskCreate: vi.fn(),
  taskUpdate: vi.fn(),
  taskMove: vi.fn(),
  taskDelete: vi.fn(),
  taskRestore: vi.fn(),
  hidePalette: vi.fn(),
}));
vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
  Toaster: () => null,
}));

const mocked = vi.mocked(api);

/** パレットを描画し、ボードの読み込み完了まで待つ */
async function renderPalette() {
  const user = userEvent.setup();
  render(<Palette />);
  await waitFor(() => {
    expect(screen.getAllByTestId("task-card").length).toBe(6);
  });
  return user;
}

/** data-selected="true" のカードのタスクIDを返す。1枚も無ければ null */
function selectedCardId(): string | null {
  const selected = screen
    .queryAllByTestId("task-card")
    .find((c) => c.getAttribute("data-selected") === "true");
  return selected?.getAttribute("data-task-id") ?? null;
}

beforeEach(() => {
  mocked.boardsList.mockResolvedValue([board, board2]);
  mocked.statusesList.mockResolvedValue(statuses);
  mocked.tasksList.mockResolvedValue(tasks);
  mocked.hidePalette.mockResolvedValue(undefined);
});

describe("Palette: キーボードの基本動作", () => {
  it("↓で検索バーから一番左のレーンの先頭カードへ移る", async () => {
    const user = await renderPalette();
    await user.keyboard("{ArrowDown}");
    expect(selectedCardId()).toBe("t-a");
  });
});
```

`Task` と `fireEvent` はTask 9で追記するテストが使うため、この時点では未使用のimportになる。
`npm test` は落ちないが `npx tsc --noEmit` が `'Task' is declared but its value is never read`
で落ちる場合は、Task 9まで一時的にこの2つのimport行を消しておいてよい。

- [ ] **Step 2: テストが失敗することを確認する**

```bash
npx vitest run src/components/Palette.test.tsx
```

期待する結果: FAIL。`useKeyboard` がまだ空フックなので ↓ を押しても選択が起きず、
`expected null to be 't-a'` になる。

- [ ] **Step 3: `src/hooks/useKeyboard.ts` を全面的に実装する**

Task 7 Step 1で置いた空フックを、以下の内容で丸ごと置き換える。

```ts
import { useEffect } from "react";
import { hidePalette } from "@/lib/api";
import { buildLanes, filterTasks, nextSelectedTaskId } from "@/lib/boardNav";
import { useAppStore } from "@/store/appStore";
import type { AppState } from "@/store/appStore";

/** 検索入力欄のDOM id。window の keydown ハンドラからフォーカスを移すために使う。 */
export const SEARCH_INPUT_ID = "smarttask-search";

/** 検索入力欄にフォーカスし、キャレットを末尾に置く */
function focusSearchInput(): void {
  const el = document.getElementById(SEARCH_INPUT_ID);
  if (!(el instanceof HTMLInputElement)) return;
  el.focus();
  const end = el.value.length;
  el.setSelectionRange(end, end);
}

/** 検索入力欄からフォーカスを外す（カード選択中は文字キーを自前で拾うため） */
function blurSearchInput(): void {
  const el = document.getElementById(SEARCH_INPUT_ID);
  if (el instanceof HTMLInputElement) el.blur();
}

/** 検索入力欄に今フォーカスがあるか */
function isSearchInputFocused(): boolean {
  return document.activeElement?.id === SEARCH_INPUT_ID;
}

/** 修飾キーなしで打たれた印字可能な1文字かどうか */
function isPrintableKey(e: KeyboardEvent): boolean {
  return e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey;
}

/** ⌘付きのショートカット。処理したら true を返す */
function handleMetaKey(e: KeyboardEvent, s: AppState): boolean {
  switch (e.key) {
    case "ArrowLeft":
      void s.moveSelectedTask("left");
      return true;
    case "ArrowRight":
      void s.moveSelectedTask("right");
      return true;
    case "ArrowUp":
      void s.reorderSelectedTask("up");
      return true;
    case "ArrowDown":
      void s.reorderSelectedTask("down");
      return true;
    case "Backspace":
      void s.deleteSelectedTask();
      return true;
    case "z":
    case "Z":
      void s.undoDelete();
      return true;
    case "n":
    case "N":
      // 新規タスク: 検索バーを空にしてフォーカスを戻す
      s.setSelectedTask(null);
      s.setSearchQuery("");
      focusSearchInput();
      return true;
    case "b":
    case "B":
      // 遷移先の BoardSwitcher の中身は計画書3の担当
      s.setView("switcher");
      return true;
    case ",":
      // 遷移先の BoardSettings の中身は計画書3の担当
      s.setView("settings");
      return true;
    default:
      break;
  }

  // ⌘1〜9 でボードを直接切り替える
  if (/^[1-9]$/.test(e.key)) {
    const board = s.boards[Number(e.key) - 1];
    if (board !== undefined) void s.selectBoard(board.id);
    return true;
  }
  return false;
}

/** ボード画面のキーマップ */
function handleBoardKey(e: KeyboardEvent, s: AppState): void {
  if (e.metaKey) {
    if (handleMetaKey(e, s)) e.preventDefault();
    return;
  }
  // ⌃ / ⌥ 付きはブラウザ/OS側に任せる
  if (e.ctrlKey || e.altKey) return;

  const lanes = buildLanes(s.statuses, filterTasks(s.tasks, s.searchQuery));

  switch (e.key) {
    case "Escape": {
      e.preventDefault();
      // 次に開いたとき前回の入力が残らないよう、隠す前にクリアする
      s.setSelectedTask(null);
      s.setSearchQuery("");
      void hidePalette();
      return;
    }
    case "Enter": {
      e.preventDefault();
      if (s.selectedTaskId !== null) {
        s.setView("detail");
        return;
      }
      if (s.searchQuery.trim() !== "") void s.createTaskFromSearch();
      return;
    }
    case "ArrowUp":
    case "ArrowDown": {
      e.preventDefault();
      const next = nextSelectedTaskId(lanes, s.selectedTaskId, e.key === "ArrowUp" ? "up" : "down");
      s.setSelectedTask(next);
      // カードを選んだら検索バーのフォーカスを外し、以降の文字キーを自前で拾う
      if (next === null) focusSearchInput();
      else blurSearchInput();
      return;
    }
    case "ArrowLeft":
    case "ArrowRight": {
      // 検索バーにいる間は入力欄のキャレット移動を優先する
      if (s.selectedTaskId === null) return;
      e.preventDefault();
      s.setSelectedTask(
        nextSelectedTaskId(lanes, s.selectedTaskId, e.key === "ArrowLeft" ? "left" : "right"),
      );
      return;
    }
    default:
      break;
  }

  // 検索バーの外で打たれた1文字は、検索バーへ送り込んで絞り込みを始める
  if (isPrintableKey(e) && !isSearchInputFocused()) {
    e.preventDefault();
    s.setSelectedTask(null);
    s.setSearchQuery(s.searchQuery + e.key);
    focusSearchInput();
  }
}

/**
 * window に keydown を1本だけ張り、現在のviewに応じてキーを振り分ける。
 * board以外のビューのキーマップ（詳細の⌘←→/⌘T、スイッチャー・設定の操作）は計画書3の担当で、
 * ここではEscで盤面へ戻る導線だけ通してある。
 */
export function useKeyboard(): void {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      // IME変換中のキーは一切拾わない
      if (e.isComposing || e.key === "Process") return;

      const state = useAppStore.getState();
      if (state.view === "board") {
        handleBoardKey(e, state);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        state.setView("board");
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
}
```

- [ ] **Step 4: テストが通ることを確認する**

```bash
npx vitest run src/components/Palette.test.tsx
```

期待する結果: PASS（1 passed）。

- [ ] **Step 5: 型チェックを通す**

```bash
npx tsc --noEmit
```

期待する結果: エラーなし。
`AppState` が `src/store/appStore.ts` から `export interface` されていない場合はここで
`has no exported member 'AppState'` が出る。Task 4のStep 3で `export interface AppState` と
書いてあることを確認する。

- [ ] **Step 6: 既存テストが壊れていないことを確認する**

```bash
npm test
```

期待する結果: 5ファイル・85テスト（api 10 / boardNav 31 / appStore 35 / Board 8 / Palette 1）がすべてPASS。

- [ ] **Step 7: コミット**

```bash
git add src/hooks/useKeyboard.ts src/components/Palette.test.tsx
git commit -m "feat: ボード画面のキーボードディスパッチを実装"
```

---

## Task 9: キーボード操作の統合テスト

**Files:**
- Modify: `src/components/Palette.test.tsx`（Task 8で作った土台に追記していく）

Task 8で作った `src/components/Palette.test.tsx` の**末尾に順番に追記**していく。
先頭のimport・モック・`renderPalette` / `selectedCardId` ヘルパー・`beforeEach` はTask 8のものをそのまま使う。
Task 8で一時的にimportを削っていた場合は、ここで `fireEvent` と `import type { Task } from "@/types";` を戻す。

- [ ] **Step 1: 初期表示のテストを追記する**

```tsx
describe("Palette: 初期表示", () => {
  it("起動時にボードを読み込んで4レーンを描画する", async () => {
    await renderPalette();
    expect(screen.getAllByTestId("lane")).toHaveLength(4);
  });

  it("検索バーに最初からフォーカスがある", async () => {
    await renderPalette();
    expect(document.activeElement?.id).toBe("smarttask-search");
  });

  it("フッターにキーボードヒントを常時表示する", async () => {
    await renderPalette();
    const footer = screen.getByTestId("keyboard-hints");
    expect(footer).toHaveTextContent("移動");
    expect(footer).toHaveTextContent("開く / 作成");
    expect(footer).toHaveTextContent("ステータス");
    expect(footer).toHaveTextContent("並び替え");
    expect(footer).toHaveTextContent("削除");
    expect(footer).toHaveTextContent("元に戻す");
    expect(footer).toHaveTextContent("閉じる");
  });
});
```

- [ ] **Step 2: 初期表示のテストが通ることを確認する**

```bash
npx vitest run src/components/Palette.test.tsx -t "初期表示"
```

期待する結果: PASS（3 passed）。
`task-card` が6個にならず落ちる場合は、`Palette` の `loadBoards` 呼び出しか
api モックのどれかが噛み合っていないので先に直す。

- [ ] **Step 3: カーソル移動のテストを追記する**

```tsx
describe("Palette: カーソル移動", () => {
  it("カードを選ぶと検索バーからフォーカスが外れる", async () => {
    const user = await renderPalette();
    await user.keyboard("{ArrowDown}");
    expect(document.activeElement?.id).not.toBe("smarttask-search");
  });

  it("↓↓で同レーンを下へ進む", async () => {
    const user = await renderPalette();
    await user.keyboard("{ArrowDown}{ArrowDown}{ArrowDown}");
    expect(selectedCardId()).toBe("t-c");
  });

  it("最終行で↓を押しても動かない", async () => {
    const user = await renderPalette();
    await user.keyboard("{ArrowDown}{ArrowDown}{ArrowDown}{ArrowDown}");
    expect(selectedCardId()).toBe("t-c");
  });

  it("先頭行で↑を押すと検索バーへ戻る", async () => {
    const user = await renderPalette();
    await user.keyboard("{ArrowDown}{ArrowUp}");
    expect(selectedCardId()).toBeNull();
    expect(document.activeElement?.id).toBe("smarttask-search");
  });

  it("→で右隣のレーンへ移り、行番号を維持する", async () => {
    const user = await renderPalette();
    await user.keyboard("{ArrowDown}{ArrowDown}{ArrowRight}");
    expect(selectedCardId()).toBe("t-e");
  });

  it("→は空のレーンを飛ばす", async () => {
    const user = await renderPalette();
    // 未着手先頭 → 進行中先頭 → 確認中は空なので飛ばして完了先頭
    await user.keyboard("{ArrowDown}{ArrowRight}{ArrowRight}");
    expect(selectedCardId()).toBe("t-f");
  });

  it("←で左のレーンへ戻る", async () => {
    const user = await renderPalette();
    await user.keyboard("{ArrowDown}{ArrowRight}{ArrowLeft}");
    expect(selectedCardId()).toBe("t-a");
  });

  it("右端で→を押しても動かない", async () => {
    const user = await renderPalette();
    await user.keyboard("{ArrowDown}{ArrowRight}{ArrowRight}{ArrowRight}");
    expect(selectedCardId()).toBe("t-f");
  });

  it("検索バーにいるときの←→は選択を動かさない", async () => {
    const user = await renderPalette();
    await user.keyboard("{ArrowRight}{ArrowLeft}");
    expect(selectedCardId()).toBeNull();
  });
});
```

- [ ] **Step 4: カーソル移動テストが通ることを確認する**

```bash
npx vitest run src/components/Palette.test.tsx -t "カーソル移動"
```

期待する結果: PASS（9 passed）。

- [ ] **Step 5: 検索と新規作成のテストを追記する**

```tsx
describe("Palette: 検索と新規作成", () => {
  it("カード選択中に文字を打つと検索バーへ入り、絞り込みが始まる", async () => {
    const user = await renderPalette();
    await user.keyboard("{ArrowDown}");
    expect(selectedCardId()).toBe("t-a");

    await user.keyboard("r");

    expect(document.activeElement?.id).toBe("smarttask-search");
    expect(useAppStore.getState().searchQuery).toBe("r");
    expect(selectedCardId()).toBeNull();
  });

  it("検索バーへの入力でカードがリアルタイムに絞り込まれる", async () => {
    await renderPalette();
    // 日本語は user-event の keyboard では打てないため change イベントで入力する
    fireEvent.change(screen.getByTestId("search-input"), { target: { value: "牛" } });
    await waitFor(() => {
      expect(screen.getAllByTestId("task-card")).toHaveLength(2);
    });
    expect(screen.getAllByTestId("task-card").map((c) => c.textContent)).toEqual([
      "牛乳を買う",
      "牛丼を食べる",
    ]);
  });

  it("絞り込みで選択中のカードが消えたら選択が外れる", async () => {
    const user = await renderPalette();
    await user.keyboard("{ArrowDown}{ArrowDown}");
    expect(selectedCardId()).toBe("t-b");

    fireEvent.change(screen.getByTestId("search-input"), { target: { value: "牛" } });
    await waitFor(() => {
      expect(selectedCardId()).toBeNull();
    });
  });

  it("入力あり・カード未選択でEnterを押すと新規タスクを作って詳細へ行く", async () => {
    const created: Task = {
      id: "t-new",
      boardId: "board-1",
      statusId: "st-todo",
      title: "牛乳を買い足す",
      contentMd: "",
      position: 0,
      createdAt: "2026-08-20T02:00:00Z",
      updatedAt: "2026-08-20T02:00:00Z",
    };
    mocked.taskCreate.mockResolvedValue(created);

    const user = await renderPalette();
    fireEvent.change(screen.getByTestId("search-input"), { target: { value: "牛乳を買い足す" } });
    await user.keyboard("{Enter}");

    await waitFor(() => {
      expect(screen.getByTestId("detail-placeholder")).toBeInTheDocument();
    });
    expect(mocked.taskCreate).toHaveBeenCalledWith("board-1", "st-todo", "牛乳を買い足す");
    expect(useAppStore.getState().selectedTaskId).toBe("t-new");
    expect(useAppStore.getState().searchQuery).toBe("");
  });

  it("入力なしでEnterを押しても何も起きない", async () => {
    const user = await renderPalette();
    await user.keyboard("{Enter}");
    expect(mocked.taskCreate).not.toHaveBeenCalled();
    expect(useAppStore.getState().view).toBe("board");
  });

  it("カード選択中のEnterは詳細を開く", async () => {
    const user = await renderPalette();
    await user.keyboard("{ArrowDown}{Enter}");
    expect(screen.getByTestId("detail-placeholder")).toBeInTheDocument();
    expect(mocked.taskCreate).not.toHaveBeenCalled();
  });

  it("⌘Nで検索バーが空になりフォーカスが戻る", async () => {
    const user = await renderPalette();
    fireEvent.change(screen.getByTestId("search-input"), { target: { value: "牛" } });
    await user.keyboard("{ArrowDown}");
    await user.keyboard("{Meta>}n{/Meta}");

    expect(useAppStore.getState().searchQuery).toBe("");
    expect(selectedCardId()).toBeNull();
    expect(document.activeElement?.id).toBe("smarttask-search");
  });
});
```

- [ ] **Step 6: 検索と新規作成のテストが通ることを確認する**

```bash
npx vitest run src/components/Palette.test.tsx -t "検索と新規作成"
```

期待する結果: PASS（7 passed）。

- [ ] **Step 7: ステータス移動・並び替え・削除・undoのテストを追記する**

```tsx
describe("Palette: ステータス移動と並び替え", () => {
  it("⌘→で選択カードを隣のステータスへ移す", async () => {
    mocked.taskMove.mockResolvedValue(tasks[0]);
    const user = await renderPalette();
    await user.keyboard("{ArrowDown}");
    await user.keyboard("{Meta>}{ArrowRight}{/Meta}");

    await waitFor(() => {
      expect(mocked.taskMove).toHaveBeenCalledWith("t-a", "st-doing", 0);
    });
    // 進行中レーンの先頭に来ている
    const doingCards = screen
      .getAllByTestId("lane")[1]
      .querySelectorAll("[data-testid='task-card']");
    expect(doingCards[0].getAttribute("data-task-id")).toBe("t-a");
    expect(selectedCardId()).toBe("t-a");
  });

  it("⌘←で1つ前のステータスへ戻す", async () => {
    mocked.taskMove.mockResolvedValue(tasks[3]);
    const user = await renderPalette();
    await user.keyboard("{ArrowDown}{ArrowRight}");
    await user.keyboard("{Meta>}{ArrowLeft}{/Meta}");

    await waitFor(() => {
      expect(mocked.taskMove).toHaveBeenCalledWith("t-d", "st-todo", 0);
    });
  });

  it("左端のレーンで⌘←を押しても何も起きない", async () => {
    const user = await renderPalette();
    await user.keyboard("{ArrowDown}");
    await user.keyboard("{Meta>}{ArrowLeft}{/Meta}");
    expect(mocked.taskMove).not.toHaveBeenCalled();
  });

  it("⌘↑で同レーンの1つ上と入れ替える", async () => {
    mocked.taskMove.mockResolvedValue(tasks[1]);
    const user = await renderPalette();
    await user.keyboard("{ArrowDown}{ArrowDown}");
    await user.keyboard("{Meta>}{ArrowUp}{/Meta}");

    await waitFor(() => {
      expect(mocked.taskMove).toHaveBeenCalledWith("t-b", "st-todo", 0);
    });
    const todoCards = screen
      .getAllByTestId("lane")[0]
      .querySelectorAll("[data-testid='task-card']");
    expect([...todoCards].map((c) => c.getAttribute("data-task-id"))).toEqual([
      "t-b",
      "t-a",
      "t-c",
    ]);
  });

  it("⌘↓で同レーンの1つ下と入れ替える", async () => {
    mocked.taskMove.mockResolvedValue(tasks[0]);
    const user = await renderPalette();
    await user.keyboard("{ArrowDown}");
    await user.keyboard("{Meta>}{ArrowDown}{/Meta}");

    await waitFor(() => {
      expect(mocked.taskMove).toHaveBeenCalledWith("t-a", "st-todo", 1);
    });
  });

  it("先頭カードで⌘↑を押しても何も起きない", async () => {
    const user = await renderPalette();
    await user.keyboard("{ArrowDown}");
    await user.keyboard("{Meta>}{ArrowUp}{/Meta}");
    expect(mocked.taskMove).not.toHaveBeenCalled();
  });
});

describe("Palette: 削除とundo", () => {
  it("⌘⌫でカードが消え、1つ下のカードが選択される", async () => {
    mocked.taskDelete.mockResolvedValue(tasks[0]);
    const user = await renderPalette();
    await user.keyboard("{ArrowDown}");
    await user.keyboard("{Meta>}{Backspace}{/Meta}");

    await waitFor(() => {
      expect(screen.getAllByTestId("task-card")).toHaveLength(5);
    });
    expect(mocked.taskDelete).toHaveBeenCalledWith("t-a");
    expect(selectedCardId()).toBe("t-b");
  });

  it("⌘⌫のあと⌘Zでカードが戻り、再び選択される", async () => {
    mocked.taskDelete.mockResolvedValue(tasks[0]);
    mocked.taskRestore.mockResolvedValue(tasks[0]);
    const user = await renderPalette();
    await user.keyboard("{ArrowDown}");
    await user.keyboard("{Meta>}{Backspace}{/Meta}");
    await waitFor(() => {
      expect(screen.getAllByTestId("task-card")).toHaveLength(5);
    });

    await user.keyboard("{Meta>}z{/Meta}");
    await waitFor(() => {
      expect(screen.getAllByTestId("task-card")).toHaveLength(6);
    });
    expect(mocked.taskRestore).toHaveBeenCalledWith("t-a");
    expect(selectedCardId()).toBe("t-a");
  });

  it("削除していない状態で⌘Zを押しても何も起きない", async () => {
    const user = await renderPalette();
    await user.keyboard("{Meta>}z{/Meta}");
    expect(mocked.taskRestore).not.toHaveBeenCalled();
  });

  it("未選択で⌘⌫を押しても何も起きない", async () => {
    const user = await renderPalette();
    await user.keyboard("{Meta>}{Backspace}{/Meta}");
    expect(mocked.taskDelete).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 8: ステータス移動・削除のテストが通ることを確認する**

```bash
npx vitest run src/components/Palette.test.tsx -t "ステータス移動"
npx vitest run src/components/Palette.test.tsx -t "削除とundo"
```

期待する結果: それぞれ PASS（6 passed / 4 passed）。

- [ ] **Step 9: Esc・ビュー切替のテストを追記する**

```tsx
describe("Palette: Escとビュー切替", () => {
  it("盤面でEscを押すとクリアしてパレットを隠す", async () => {
    const user = await renderPalette();
    fireEvent.change(screen.getByTestId("search-input"), { target: { value: "牛" } });
    await user.keyboard("{Escape}");

    await waitFor(() => {
      expect(mocked.hidePalette).toHaveBeenCalledTimes(1);
    });
    expect(useAppStore.getState().searchQuery).toBe("");
    expect(useAppStore.getState().selectedTaskId).toBeNull();
  });

  it("詳細ビューでEscを押すと盤面へ戻り、パレットは閉じない", async () => {
    const user = await renderPalette();
    await user.keyboard("{ArrowDown}{Enter}");
    expect(screen.getByTestId("detail-placeholder")).toBeInTheDocument();

    await user.keyboard("{Escape}");
    expect(screen.getByTestId("board")).toBeInTheDocument();
    expect(mocked.hidePalette).not.toHaveBeenCalled();
  });

  it("⌘Bでスイッチャービューへ移り、Escで戻る", async () => {
    const user = await renderPalette();
    await user.keyboard("{Meta>}b{/Meta}");
    expect(screen.getByTestId("switcher-placeholder")).toBeInTheDocument();

    await user.keyboard("{Escape}");
    expect(screen.getByTestId("board")).toBeInTheDocument();
  });

  it("⌘,で設定ビューへ移り、Escで戻る", async () => {
    const user = await renderPalette();
    await user.keyboard("{Meta>},{/Meta}");
    expect(screen.getByTestId("settings-placeholder")).toBeInTheDocument();

    await user.keyboard("{Escape}");
    expect(screen.getByTestId("board")).toBeInTheDocument();
  });

  it("⌘2で2枚目のボードへ切り替える", async () => {
    const user = await renderPalette();
    mocked.statusesList.mockResolvedValue([]);
    mocked.tasksList.mockResolvedValue([]);

    await user.keyboard("{Meta>}2{/Meta}");
    await waitFor(() => {
      expect(useAppStore.getState().currentBoardId).toBe("board-2");
    });
    expect(screen.queryAllByTestId("task-card")).toHaveLength(0);
  });

  it("存在しない番号の⌘9を押しても何も起きない", async () => {
    const user = await renderPalette();
    await user.keyboard("{Meta>}9{/Meta}");
    expect(useAppStore.getState().currentBoardId).toBe("board-1");
  });
});
```

- [ ] **Step 10: 全テストを実行する**

```bash
npm test
```

期待する結果: 5ファイルすべてPASS。内訳は api 10 / boardNav 31 / appStore 35 / Board 8 / Palette 36 の
合計 120 テスト。`Palette.test.tsx` の36件の内訳は
キーボードの基本動作1 + 初期表示3 + カーソル移動9 + 検索と新規作成7 + ステータス移動と並び替え6 + 削除とundo4 + Escとビュー切替6。

- [ ] **Step 11: 型チェックとビルド**

```bash
npx tsc --noEmit && npm run build
```

期待する結果: どちらもエラーなしで終了。

- [ ] **Step 12: コミット**

```bash
git add src/components/Palette.test.tsx
git commit -m "test: パレットのキーボード操作の統合テストを追加"
```

---

## Task 10: 実機での手動スモーク検証

**Files:**
- なし（検証のみ）

- [ ] **Step 1: 自動テストがすべて通ることを確認する**

```bash
npm test && npx tsc --noEmit
```

期待する結果: 全テストPASS、型エラーなし。

- [ ] **Step 2: 開発ビルドでアプリを起動する**

```bash
npm run tauri dev
```

期待する結果: Rustのコンパイルが終わり、パレットウィンドウが表示される。
ターミナルに `Error` や `panicked` が出ないこと。

（この操作はRustのビルドを伴い数分かかるため、実行前にユーザーへ確認を取ること）

- [ ] **Step 3: 表示のチェックリストを目視で確認する**

以下をすべて確認し、崩れがあれば該当コンポーネントを直す。

- [ ] パレットが角丸で半透明、背景がぼけている
- [ ] 上部に検索バーがあり、虫めがねアイコンとプレースホルダーが出ている
- [ ] 起動直後にカーソルが検索バーで点滅している
- [ ] レーンが4本（未着手 / 進行中 / 確認中 / 完了）横並びで出ている
- [ ] 各レーンヘッダーの丸アイコンが、灰 / 青 / 橙 / 緑にそれぞれ塗られている
- [ ] 各レーンヘッダーの右端に件数が出ている
- [ ] 下部フッターにキーボードヒントが7つ並んでいる
- [ ] 絵文字が1つも使われていない

- [ ] **Step 4: ゴールデンパスを手で通す**

- [ ] ⌥Space でパレットが出る
- [ ] 「テストタスク」と打つと検索バーに文字が入る
- [ ] Enter を押すと詳細ビューのプレースホルダーが出る
- [ ] Esc を押すと盤面に戻り、「テストタスク」が未着手レーンの先頭に白カードで出ている
- [ ] Esc をもう一度押すとパレットが消える
- [ ] ⌥Space で開き直すと検索バーが空になっている

- [ ] **Step 5: 盤面のキー操作を手で通す**

- [ ] ↓ で先頭カードが選択され、そのステータス色の枠線が付く
- [ ] ↓↑ でカードの選択が上下に動く
- [ ] 先頭カードで ↑ を押すと選択が外れ、検索バーにカーソルが戻る
- [ ] カード選択中に文字を打つと検索バーに入り、リアルタイムに絞り込まれる
- [ ] ⌘→ で選択カードが進行中レーンの先頭へ移る
- [ ] ⌘→ をもう一度押すと、空の確認中レーンにもちゃんと移る
- [ ] → で空でないレーンだけを渡り歩ける（確認中が空なら飛ばされる）
- [ ] ⌘↑↓ で同レーン内の並び順が入れ替わる
- [ ] ⌘⌫ でカードが消え、1つ下のカードが選択される
- [ ] ⌘Z で消したカードが元の位置に戻り、再び選択される
- [ ] ⌘N で検索バーが空になりフォーカスが戻る
- [ ] ⌘B / ⌘, でそれぞれのプレースホルダーが出て、Esc で盤面に戻る
- [ ] 選択カードがレーンの下の方にあるとき、↓ で自動的にスクロールして見える位置に来る

- [ ] **Step 6: 再起動して永続化を確認する**

アプリを終了して `npm run tauri dev` で起動し直す。

- [ ] 前回作ったタスクが同じレーン・同じ並びで残っている
- [ ] ⌘⌫ で消したタスクが復活していない

- [ ] **Step 7: エラートーストを確認する**

DBファイルを一時的に読み取り専用にして、書き込み失敗時の挙動を見る。

```bash
chmod 444 ~/Library/Application\ Support/smartTask/smart-task.db
```

- [ ] ⌘→ でステータスを動かすと、右下にトーストが出る
- [ ] トーストが出たあと、カードは元のレーンに戻っている（ロールバックされている）

確認できたら必ず戻す。

```bash
chmod 644 ~/Library/Application\ Support/smartTask/smart-task.db
```

- [ ] **Step 8: 検証結果をコミット（コード修正があった場合のみ）**

Step 3〜7 で崩れや不具合を直した場合のみコミットする。

```bash
git add -A
git commit -m "fix: 手動スモーク検証で見つかった盤面UIの不具合を修正"
```

---

## セルフレビュー結果

**1. スコープ網羅**

| 担当スコープ | 対応タスク |
|---|---|
| `src/types.ts` / `src/lib/api.ts` | Task 2 |
| zustandストア（TDD・apiモック・楽観的更新） | Task 4 / Task 5 |
| Palette / SearchBar / Board / Lane / TaskCard | Task 6 / Task 7 |
| ステータスアイコンのカスタム対応方式 | 「自分で決めた仕様 A」+ Task 6 Step 4 |
| `src/hooks/useKeyboard.ts` のboardキーマップ全部 | Task 8 |
| ⌘1-9 / ⌘B / ⌘, の置き場所 | Task 8（キー割当は確定。遷移先の中身は計画書3） |
| sonnerでエラートースト | Task 1 Step 7 + Task 5 の各catch |
| キーボード操作のVitestテスト | Task 9 |
| 検証手順（npm test / tauri dev） | Task 10 |

**2. プレースホルダー走査**

「適宜」「TBD」「同様に」「Task Nと同じ」は使っていない。
Task 2 Step 6・Step 7・Step 8 は条件分岐だが、分岐先の実際のコード・コマンド・期待出力をすべて書いてある。
`ViewPlaceholder` は「計画の穴」ではなく、計画書3が差し替える前提の実装済みコンポーネントである。

**3. 型・名前の一貫性**

- `AppState` のメンバー名はコントラクトの公開形と完全一致
- `api.*` の関数名は Task 2 で定義したものだけをTask 4/5/8/9で使用
- `boardNav` の `filterTasks` / `buildLanes` / `locateTask` / `nextSelectedTaskId` / `selectionAfterDelete` / `LaneData` / `MoveDir` は Task 3 で定義し、Task 5/6/8 で同名のまま使用
- `SEARCH_INPUT_ID` は Task 7 Step 1 で定義し Task 8 Step 1 で同じ値のまま引き継ぐ
- テスト用 `data-testid` は `palette` / `search-input` / `board` / `lane` / `lane-count` / `task-card` / `keyboard-hints` / `detail-placeholder` / `switcher-placeholder` / `settings-placeholder` の10種類で、Task 6・7 の実装と Task 9 のテストで一致
