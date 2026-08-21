# Avoliq カラーシステム 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ブランド色 Avoliq Blue を実装に導入し、ダークモード基盤を `.dark` クラスへ一本化したうえで、`windowEffects` のぼかしの上に Liquid Glass の器を作り込む。

**Architecture:** 色の実値を `--av-*` トークン定義ブロック1箇所だけに集約し、shadcn 変数・BlockNote 変数・コンポーネントはすべて `var(--av-*)` を参照するだけにする。ガラスはネイティブの `NSVisualEffectView`（可読性の土台）とその上の CSS レイヤー（色味・ハイライト・屈折）の二層構成にする。ステータス色は Rust / TS が同一の JSON を読む単一ソースにする。

**Tech Stack:** Tauri v2 (Rust) / tauri-nspanel / windowEffects (NSVisualEffectView) / React 19 / TypeScript / Tailwind v4 / shadcn (base-nova) / BlockNote 0.54.0 / sonner / Vitest + Testing Library

**設計書:** `docs/superpowers/specs/2026-08-21-avoliq-color-system-design.md`（本計画の各タスクは設計書の節番号を参照する）

---

## ファイル構成

### 新規作成

| ファイル | 責務 |
|---|---|
| `src/hooks/useColorScheme.ts` | OS のカラースキームを購読し、`documentElement` の `.dark` を切り替え、真偽値を返す唯一のフック |
| `src/hooks/useColorScheme.test.ts` | 上記の回帰テスト |
| `design/status-presets.json` | ステータス色プリセットの**単一ソース**。Rust と TS の両方が読む |

### 変更

| ファイル | 変更内容 |
|---|---|
| `index.html` | FOUC 防止のインラインスクリプトと `color-scheme` メタ |
| `src/index.css` | トークン定義の全面差し替え、shadcn 変数の `var()` 参照化、ガラス・カード・チップのクラス定義 |
| `src/components/Palette.tsx` | `useColorScheme()` の唯一の呼び出し元。`isDark` を子へ渡す |
| `src/components/TaskDetail.tsx` | `usePrefersDark` → props の `isDark`。ステータスチップを `--av-status` 注入へ |
| `src/components/TaskCard.tsx` | 選択表現を案A へ。ステータス点を追加 |
| `src/components/Lane.tsx` | ステータス点の輪郭、件数を secondary へ格上げ |
| `src/components/Board.tsx` | 空状態サブ行を secondary へ格上げ |
| `src/components/ui/sonner.tsx` | `theme` を `isDark` で駆動、面を `--av-surface-raised` へ |
| `src/components/ConfirmDialog.tsx` | scrim / 本体 / 危険色をトークンへ |
| `src/components/AppSettings.tsx` | トグル・ホットキーボタン・エラー表示をトークンへ |
| `src/components/StatusSettings.tsx` | 色ピッカーの ring / ring-offset を修正 |
| `src/lib/statusPalette.ts` | ハードコード配列を JSON import へ |
| `src-tauri/src/panel.rs` | 角丸を定数化（ネイティブのぼかし自体は `windowEffects` で実装済み） |
| `src-tauri/src/db/repo.rs` | `DEFAULT_STATUSES` を JSON 由来へ |
| `docs/superpowers/specs/2026-08-20-avoliq-brand-design.md` | 第4節に Avoliq における適用を追記 |

### 削除

`src/hooks/usePrefersDark.ts` / `src/components/ui/button.tsx` / `src/assets/react.svg` / `public/vite.svg` / `public/tauri.svg`

---

## Task 1: ダークモード基盤を `.dark` クラスへ一本化する

設計書 4節。**これを先に入れないと以降の色が検証できない。**

**Files:**
- Create: `src/hooks/useColorScheme.ts`
- Create: `src/hooks/useColorScheme.test.ts`
- Modify: `index.html`
- Modify: `src/components/Palette.tsx`
- Modify: `src/components/TaskDetail.tsx`
- Delete: `src/hooks/usePrefersDark.ts`

- [ ] **Step 1: 失敗するテストを書く**

`src/hooks/useColorScheme.test.ts` を新規作成する。

`setup-vitest.ts` が `window.matchMedia` をスタブしているが `matches: false` 固定なので、
このテストでは各ケースで差し替える。差し替えたリスナーを保持して `change` を手動で発火させる。

```ts
import { renderHook, act } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useColorScheme } from "./useColorScheme";

/** matchMedia を差し替え、登録されたリスナーを手で発火できるようにする */
function stubMatchMedia(initialMatches: boolean) {
  const listeners = new Set<(event: MediaQueryListEvent) => void>();
  window.matchMedia = vi.fn().mockImplementation((media: string) => ({
    matches: initialMatches,
    media,
    onchange: null,
    addEventListener: (_type: string, handler: (event: MediaQueryListEvent) => void) =>
      listeners.add(handler),
    removeEventListener: (_type: string, handler: (event: MediaQueryListEvent) => void) =>
      listeners.delete(handler),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia;
  return {
    emit(matches: boolean) {
      for (const handler of listeners) {
        handler({ matches } as MediaQueryListEvent);
      }
    },
    get listenerCount() {
      return listeners.size;
    },
  };
}

describe("useColorScheme", () => {
  beforeEach(() => {
    document.documentElement.classList.remove("dark");
  });

  afterEach(() => {
    document.documentElement.classList.remove("dark");
  });

  it("OSがダークなら true を返し、documentElement に dark を付ける", () => {
    stubMatchMedia(true);
    const { result } = renderHook(() => useColorScheme());
    expect(result.current).toBe(true);
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });

  it("OSがライトなら false を返し、dark を外す", () => {
    stubMatchMedia(false);
    document.documentElement.classList.add("dark");
    const { result } = renderHook(() => useColorScheme());
    expect(result.current).toBe(false);
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });

  it("OS設定の変化に追従して dark をトグルする", () => {
    const media = stubMatchMedia(false);
    const { result } = renderHook(() => useColorScheme());
    expect(document.documentElement.classList.contains("dark")).toBe(false);

    act(() => media.emit(true));
    expect(result.current).toBe(true);
    expect(document.documentElement.classList.contains("dark")).toBe(true);

    act(() => media.emit(false));
    expect(result.current).toBe(false);
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });

  it("アンマウントでリスナーを解除する", () => {
    const media = stubMatchMedia(false);
    const { unmount } = renderHook(() => useColorScheme());
    expect(media.listenerCount).toBe(1);
    unmount();
    expect(media.listenerCount).toBe(0);
  });
});
```

- [ ] **Step 2: テストが失敗することを確認する**

Run: `npx vitest run src/hooks/useColorScheme.test.ts`
Expected: FAIL — `Failed to resolve import "./useColorScheme"`

- [ ] **Step 3: フックを実装する**

`src/hooks/useColorScheme.ts` を新規作成する。

```ts
import { useEffect, useState } from "react";

const DARK_QUERY = "(prefers-color-scheme: dark)";

/**
 * OSのカラースキームを購読する唯一のフック。
 *
 * 真偽値を返すだけでなく、documentElement の .dark クラスを切り替える副作用を持つ。
 * CSS 側は @media (prefers-color-scheme: dark) を使わず .dark クラスだけを見るため、
 * このフックが色の切り替えの単一の入口になる。
 * アプリ全体で Palette.tsx の1箇所からのみ呼ぶこと（購読を増やさない）。
 */
export function useColorScheme(): boolean {
  const [isDark, setIsDark] = useState(
    () =>
      typeof window !== "undefined" && window.matchMedia(DARK_QUERY).matches,
  );

  useEffect(() => {
    const query = window.matchMedia(DARK_QUERY);
    // マウント時点の値がstateの初期値とズレている可能性があるので取り直す
    setIsDark(query.matches);
    const handle = (event: MediaQueryListEvent) => setIsDark(event.matches);
    query.addEventListener("change", handle);
    return () => query.removeEventListener("change", handle);
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", isDark);
  }, [isDark]);

  return isDark;
}
```

- [ ] **Step 4: テストが通ることを確認する**

Run: `npx vitest run src/hooks/useColorScheme.test.ts`
Expected: PASS（4件）

- [ ] **Step 5: `index.html` に FOUC 防止スクリプトを足す**

ダークのシステムで起動直後にパレットが一瞬白く光るのを防ぐ。React のマウント前に `.dark` を付ける必要があるため、
バンドルではなくインラインスクリプトで行う。

`index.html` の `<head>` を次のように書き換える。

```html
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="color-scheme" content="light dark" />
    <title>Avoliq</title>
    <!--
      Reactのマウント前に .dark を確定させる。バンドルの読み込みを待つと、
      ダーク環境でパレットが一瞬白く光る（Spotlight風の即時表示では目立つ）。
      以降の追従は useColorScheme が担当する。
    -->
    <script>
      if (window.matchMedia("(prefers-color-scheme: dark)").matches) {
        document.documentElement.classList.add("dark");
      }
    </script>
  </head>
```

- [ ] **Step 6: `Palette.tsx` を唯一の呼び出し元にする**

`src/components/Palette.tsx` の import に追加する。

```tsx
import { useColorScheme } from "@/hooks/useColorScheme";
```

コンポーネント本体の先頭（既存の hooks 呼び出しと並ぶ位置）に追加する。

```tsx
  // カラースキームの購読はここ1箇所だけ。値は子へpropsで渡す
  const isDark = useColorScheme();
```

`<Toaster />`（69行目付近）を `<Toaster isDark={isDark} />` に変える（`Toaster` 側の対応は Task 6）。
62行目付近の `{view === "detail" && <TaskDetail key={selectedTaskId ?? "none"} />}` を
`{view === "detail" && <TaskDetail key={selectedTaskId ?? "none"} isDark={isDark} />}` に変える。

`useEffect` / `useState` は既に import 済みなので追加不要。

- [ ] **Step 7: `TaskDetail.tsx` を props 受け取りへ変える**

`import { usePrefersDark } from "@/hooks/usePrefersDark";` の行を削除する。
`const isDark = usePrefersDark();` の行を削除する。

コンポーネントの props に `isDark` を足す。既存のシグネチャが props 無しなら次の形にする。

```tsx
interface TaskDetailProps {
  /** OSのカラースキーム。購読はPalette側で行い、ここでは受け取るだけ */
  isDark: boolean;
}

export function TaskDetail({ isDark }: TaskDetailProps) {
```

`BlockNoteView` の `theme={isDark ? "dark" : "light"}` はそのまま動く。

- [ ] **Step 8: `usePrefersDark.ts` を削除する**

```bash
git rm src/hooks/usePrefersDark.ts
```

- [ ] **Step 9: 参照が残っていないことを確認する**

Run: `grep -rn "usePrefersDark" src src-tauri docs`
Expected: 出力なし（設計書内の記述はこの時点で歴史的記述として残っていてよいが、`src` に 0 件であること）

- [ ] **Step 10: 全テストと型検査を通す**

Run: `npx vitest run && npx tsc --noEmit`
Expected: すべて PASS。`TaskDetail.test.tsx` が props 追加でエラーになる場合は、テスト側の描画を `<TaskDetail isDark={false} />` に直す。

- [ ] **Step 11: コミット**

```bash
git add -A
git commit -m "refactor: ダークモード判定をuseColorSchemeへ一本化

matchMediaの購読をPaletteの1箇所に集約し、documentElementの
darkクラスを切り替える。起動直後の白い明滅を防ぐため、
index.htmlにマウント前の判定を置く。"
```

---

## Task 2: `--av-*` トークンを定義し、shadcn 変数を付け替える

設計書 3節 / 7.1節。この段階では `--st-*` を `--av-*` のエイリアスとして残すので、**見た目が変わるが壊れない**。

**Files:**
- Modify: `src/index.css`

- [ ] **Step 1: 原色層と意味層のトークンを定義する**

`src/index.css` の `:root { --radius: 0.625rem; … }` から `.dark { … }` までのブロック全体を、次で置き換える。

```css
/* ============================================================
   Avoliq カラートークン

   色の実値（hex / oklch リテラル）はこのブロックにだけ置く。
   shadcn 変数・BlockNote 変数・各コンポーネントは var(--av-*) を参照するだけにする。
   設計書: docs/superpowers/specs/2026-08-21-avoliq-color-system-design.md
   ============================================================ */

:root {
  --radius: 0.625rem;

  /* ---- 原色層（モード非依存。.dark でも上書きしない） ---- */
  /* ブランド設計書3節のカラーシステム。hexは正典の値 */
  --av-blue-300: oklch(0.7748 0.1179 252.36); /* #7DBAFF ダークでの青文字 */
  --av-blue-500: oklch(0.6243 0.2056 255.49); /* #0A84FF Avoliq Blue（正典）文字を載せない塗り */
  --av-blue-600: oklch(0.5615 0.1958 256.54); /* #0070E4 白文字を載せる塗り */
  --av-blue-700: oklch(0.4947 0.1750 256.92); /* #005DC2 ライトでの青文字 */
  --av-azure: oklch(0.7730 0.1263 242.75); /* #66BEFF Glass Azure。屈折のみ */
  --av-violet: oklch(0.5818 0.2316 277.23); /* #615EFF Glass Violet。屈折のみ */

  /* ---- 意味層（ライト） ---- */
  --av-text-primary: oklch(0.2488 0.0542 259.67); /* #11213B Ink */
  --av-text-secondary: oklch(0.4922 0.0434 258.35); /* #52627A Slate */
  --av-text-muted: oklch(0.5764 0.0260 258.37); /* #707A89 装飾のみ。AAは保証しない */
  --av-text-on-accent: oklch(1 0 0);

  --av-glass-tint: oklch(0.9844 0.0045 258.32); /* #F8FAFD */
  --av-glass-alpha-top: 0.64;
  --av-glass-alpha-bottom: 0.56;
  --av-glass-edge: oklch(0.2488 0.0542 259.67 / 0.10);
  --av-glass-specular: oklch(1 0 0 / 0.75);
  --av-glass-refract-azure: oklch(0.7730 0.1263 242.75 / 0.14);
  --av-glass-refract-violet: oklch(0.5818 0.2316 277.23 / 0.10);

  --av-hairline: oklch(0.2488 0.0542 259.67 / 0.10);
  --av-surface-card: oklch(1 0 0 / 0.72);
  --av-surface-card-hover: oklch(0.9546 0.0087 264.52 / 0.80);
  --av-surface-raised: oklch(0.9909 0.0029 264.54); /* #FBFCFE 不透明 */
  --av-surface-hover: oklch(0.2488 0.0542 259.67 / 0.05);
  --av-surface-selected: oklch(0.2488 0.0542 259.67 / 0.08);

  --av-accent: var(--av-blue-500);
  --av-accent-solid: var(--av-blue-600);
  --av-accent-text: var(--av-blue-700);
  --av-accent-mix: 12%;
  --av-focus-ring: var(--av-blue-500);

  --av-danger: oklch(0.5439 0.2049 28.61); /* #CC211B */
  --av-danger-solid: oklch(0.5439 0.2049 28.61);
  --av-danger-subtle: color-mix(in srgb, var(--av-danger) 12%, transparent);
  --av-success: oklch(0.6000 0.1550 147.50); /* #2B9845 */
  --av-toggle-off: oklch(0.2488 0.0542 259.67 / 0.20);
  --av-scrim: oklch(0.2488 0.0542 259.67 / 0.28);

  --av-shadow:
    0 24px 64px oklch(0.2488 0.0542 259.67 / 0.22),
    0 2px 8px oklch(0.2488 0.0542 259.67 / 0.08);

  /* Apple純正のイージング(macOSのウィンドウアニメーションに近い) */
  --av-ease: cubic-bezier(0.32, 0.72, 0, 1);

  /* ---- shadcn 変数（すべて --av-* への参照。実値は持たせない） ---- */
  /* ウィンドウが透過なので背景は器（.av-glass）が持つ */
  --background: transparent;
  --foreground: var(--av-text-primary);
  --card: var(--av-surface-raised);
  --card-foreground: var(--av-text-primary);
  --popover: var(--av-surface-raised);
  --popover-foreground: var(--av-text-primary);
  --primary: var(--av-accent-solid);
  --primary-foreground: var(--av-text-on-accent);
  --secondary: var(--av-surface-selected);
  --secondary-foreground: var(--av-text-primary);
  --muted: var(--av-surface-selected);
  --muted-foreground: var(--av-text-secondary);
  --accent: var(--av-surface-selected);
  --accent-foreground: var(--av-text-primary);
  --destructive: var(--av-danger);
  --destructive-foreground: var(--av-text-on-accent);
  --border: var(--av-hairline);
  --input: var(--av-hairline);
  --ring: var(--av-focus-ring);
  --sidebar: var(--av-surface-raised);
  --sidebar-foreground: var(--av-text-primary);
  --sidebar-primary: var(--av-accent-solid);
  --sidebar-primary-foreground: var(--av-text-on-accent);
  --sidebar-accent: var(--av-surface-selected);
  --sidebar-accent-foreground: var(--av-text-primary);
  --sidebar-border: var(--av-hairline);
  --sidebar-ring: var(--av-focus-ring);

  /* ---- 旧トークンのエイリアス（Task 4で撤去する） ---- */
  --st-palette-border: var(--av-hairline);
  --st-text-primary: var(--av-text-primary);
  --st-text-secondary: var(--av-text-secondary);
  --st-text-tertiary: var(--av-text-muted);
  --st-surface-hover: var(--av-surface-hover);
  --st-surface-selected: var(--av-surface-selected);
  --st-card-bg: var(--av-surface-card);
  --st-card-hover-bg: var(--av-surface-card-hover);
  --st-shadow: var(--av-shadow);
  --st-ease: var(--av-ease);
}

.dark {
  --av-text-primary: oklch(0.9660 0.0062 255.48); /* #F1F4F8 */
  --av-text-secondary: oklch(0.7741 0.0175 259.42); /* #AFB6C1 */
  --av-text-muted: oklch(0.6606 0.0201 258.37); /* #8B939F */

  --av-glass-tint: oklch(0.2160 0.0200 258.34); /* #141A23 */
  --av-glass-alpha-top: 0.68;
  --av-glass-alpha-bottom: 0.58;
  --av-glass-edge: oklch(1 0 0 / 0.12);
  --av-glass-specular: oklch(1 0 0 / 0.16);
  --av-glass-refract-azure: oklch(0.7730 0.1263 242.75 / 0.10);
  --av-glass-refract-violet: oklch(0.5818 0.2316 277.23 / 0.14);

  --av-hairline: oklch(1 0 0 / 0.12);
  --av-surface-card: oklch(0.3076 0.0199 260.64 / 0.62);
  --av-surface-card-hover: oklch(0.3503 0.0214 259.39 / 0.72);
  --av-surface-raised: oklch(0.2790 0.0187 258.37); /* #232932 不透明 */
  --av-surface-hover: oklch(1 0 0 / 0.07);
  --av-surface-selected: oklch(1 0 0 / 0.11);

  --av-accent-text: var(--av-blue-300);
  --av-accent-mix: 16%;

  --av-danger: oklch(0.7073 0.1847 25.94); /* #FF6961 */
  /* danger-solid は白文字を載せるのでライトと同じ暗い赤のまま */
  --av-danger-solid: oklch(0.5439 0.2049 28.61);
  --av-toggle-off: oklch(1 0 0 / 0.22);
  --av-scrim: oklch(0 0 0 / 0.50);

  --av-shadow:
    0 24px 64px oklch(0 0 0 / 0.55),
    0 2px 8px oklch(0 0 0 / 0.35);
}
```

- [ ] **Step 2: `@theme inline` から `--color-chart-*` を削除する**

`src/index.css` の `@theme inline` ブロック内の次の5行を削除する。グラフは存在せず、
ブランド設計書5節も生産性グラフを禁じているため、死に変数を残さない。

```css
  --color-chart-1: var(--chart-1);
  --color-chart-2: var(--chart-2);
  --color-chart-3: var(--chart-3);
  --color-chart-4: var(--chart-4);
  --color-chart-5: var(--chart-5);
```

- [ ] **Step 3: 旧ダークメディアクエリを削除する**

`src/index.css` の `@media (prefers-color-scheme: dark) { :root { --st-palette-bg: … } }` ブロック（`--st-shadow` の再定義まで）を丸ごと削除する。
ダークの値は Step 1 の `.dark` に統合済み。

あわせて、その直前にある旧 `:root { --st-palette-bg: …; --st-ease: …; }`（`/* ============ Avoliq デザイントークン ============ */` 配下）のブロックも削除する。
`--st-*` は Step 1 のエイリアスが引き受ける。

- [ ] **Step 4: ビルドが通ることを確認する**

Run: `npx tsc --noEmit && npm run build`
Expected: 成功。CSS のパースエラーが出ないこと。

- [ ] **Step 5: 全テストを通す**

Run: `npx vitest run`
Expected: 全 PASS（テストは `--st-*` を参照していないため影響しない）

- [ ] **Step 6: コミット**

```bash
git add -A
git commit -m "feat: --av-* カラートークンを定義しshadcn変数を参照へ変える

色の実値をトークン定義ブロック1箇所に集約する。shadcnの
テーマ変数はすべて var(--av-*) を指すだけにして二重管理をなくす。
旧 --st-* は移行中のエイリアスとして残す。"
```

---

## Task 3: ガラスの CSS 層を作り込み、角丸の値を揃える

設計書 5節。**ここが本計画で唯一「計算では詰めきれない」箇所**なので、実機確認を必ず行う。

**前提（重要）**: ネイティブのぼかしは**コミット `c2f9b6c` で既に実装済み**である。
`src-tauri/tauri.conf.json` の `windowEffects`（`popover` / `active` / `radius 16`）が
`NSVisualEffectView` を敷いており、`.st-palette` の `backdrop-filter` も撤去済み。
**`window-vibrancy` クレートは導入しない。** このタスクはその上に重ねる CSS 層を作る。

**Files:**
- Modify: `src-tauri/src/panel.rs`（角丸の定数化のみ）
- Modify: `src-tauri/tauri.conf.json`（コメント追加のみ）
- Modify: `src/index.css`
- Modify: `src/components/Palette.tsx`

- [ ] **Step 1: 角丸を定数化する**

`16` は `tauri.conf.json` / `panel.rs` / CSS の3箇所に散っている。1つでもズレると
効果ビューがはみ出すか影が四角くなるので、Rust 側を定数にして参照元を明示する。

`src-tauri/src/panel.rs` の `MAIN_WINDOW_LABEL` の定義の下に足す。

```rust
/// パネルの角丸半径。
/// tauri.conf.json の windowEffects.radius と CSS の .av-glass の border-radius が
/// 同じ値である必要がある。ズレると効果ビューだけ四角くなり、影も角丸に沿わなくなる。
pub const PANEL_CORNER_RADIUS: f64 = 16.0;
```

`panel.set_corner_radius(16.0);` の行を置き換える。

```rust
    panel.set_corner_radius(PANEL_CORNER_RADIUS);
```

- [ ] **Step 2: `tauri.conf.json` に参照元のコメントを残せないので README で補う**

JSON はコメントを書けないため、`windowEffects` の意図は設計書と README に置く。
このステップでは `tauri.conf.json` を**変更しない**（`radius: 16` / `state: "active"` は既に正しい）。

Run: `grep -n "windowEffects" -A 4 src-tauri/tauri.conf.json`
Expected: `"effects": ["popover"]` / `"state": "active"` / `"radius": 16` が並んでいること。
**この3つが揃っていなければ先に進まない。**（`state` が無いと、非アクティブ時にパネルが灰色に濁る）

- [ ] **Step 3: Rust がビルドできることを確認する**

Run: `cd src-tauri && cargo build`
Expected: 成功

- [ ] **Step 4: Rust のテストを通す**

Run: `cd src-tauri && cargo test`
Expected: 全 PASS（44件）

- [ ] **Step 5: CSS のガラスクラスを実装する**

`src/index.css` の `.st-palette { … }` ブロックを、次の `.av-glass` で置き換える。
`backdrop-filter` は削除する（透過 WebView では no-op で、GPU に無駄な合成レイヤーを作るだけ）。

```css
/* ============ パレットの器（ガラス） ============
   ネイティブの NSVisualEffectView（tauri.conf.json の windowEffects）が敷いたぼかしの上に、
   色味・スペキュラーハイライト・屈折を重ねる二層構成の上側。
   border-radius は panel.rs の PANEL_CORNER_RADIUS と必ず揃えること。 */
.av-glass {
  border-radius: 16px;
  border: 0.5px solid var(--av-glass-edge);
  color: var(--av-text-primary);
  /* 上ほど厚く見えるのが実物のガラスの挙動。可読性の床は下端アルファで決まる */
  background: linear-gradient(
    180deg,
    color-mix(
        in srgb,
        var(--av-glass-tint) calc(var(--av-glass-alpha-top) * 100%),
        transparent
      )
      0%,
    color-mix(
        in srgb,
        var(--av-glass-tint) calc(var(--av-glass-alpha-bottom) * 100%),
        transparent
      )
      100%
  );
  box-shadow:
    /* 上端の細い白のスペキュラーハイライト */
    inset 0 0.5px 0 0 var(--av-glass-specular),
    /* 縁のごく薄い Glass Azure の屈折 */
    inset 0 1px 12px -6px var(--av-glass-refract-azure),
    /* 底の Glass Violet による奥行き */
    inset 0 -24px 44px -28px var(--av-glass-refract-violet),
    var(--av-shadow);
  animation: st-palette-in 180ms var(--av-ease) both;
}

/* vibrancy が使えない環境ではぼかしが無い。半透明のままだと壁紙が素通しになり
   文字が読めなくなる（Slateが1.61:1まで落ちる）ので、実質不透明へ退避する。
   これは装飾ではなく可読性の安全装置。 */
[data-vibrancy="off"] {
  --av-glass-alpha-top: 0.96;
  --av-glass-alpha-bottom: 0.94;
}
```

同じファイルの末尾近くにある `prefers-reduced-motion` ブロックも `.st-palette` を参照しているので、
あわせて `.av-glass` に直す（この1箇所だけは Task 4 の機械置換の対象外）。

```css
/* OSの視差効果を減らす設定を尊重する */
@media (prefers-reduced-motion: reduce) {
  .av-glass,
  .st-view-forward,
  .st-view-back {
    animation: none;
  }
  .st-card {
    transition: none;
  }
}
```

`st-view-forward` / `st-view-back` / `st-card` は Task 4 の sed でまとめて改名される。

- [ ] **Step 6: `Palette.tsx` のクラス名を変える**

`src/components/Palette.tsx`（47行目付近）の `className="st-palette flex h-screen …"` を
`className="av-glass flex h-screen …"` に変える。

`data-vibrancy` を自動で付ける仕組みは**作らない**。`windowEffects` は宣言的な設定で、
適用に失敗したことを知る戻り値が無い。一方 `NSVisualEffectView` は macOS 10.10 以降つねに
利用可能で、Avoliq は macOS 専用なので実質的に失敗経路が存在しない（設計書 5.6節）。
この属性は手動の退避弁 / デバッグ用として CSS 側にだけ用意しておく。

- [ ] **Step 7: 型検査・ビルド・テストを通す**

Run: `npx tsc --noEmit && npm run build && npx vitest run`
Expected: すべて成功

- [ ] **Step 8: 実機で確認する（このタスクの本体）**

Run: `npm run tauri dev`

以下を目で確認し、**設計書 5.6節の合成モデルが実測とズレていないか**を判断する。
ズレていた場合は設計書 8節の検証表を再計算する必要があるため、必ずスクリーンショットを残す。

- [ ] 壁紙がぼけている（背後の他アプリの文字が読めない）
- [ ] パレットの角が丸く、効果ビューがはみ出していない
- [ ] **角の縁がざらついていない**（`popover` 素材の二重マスク懸念の検証。設計書 5.2節。
      ざらついていたら `tauri.conf.json` の `effects` を `["hudWindow"]` に変えて再確認し、
      どちらを採ったかを設計書 5.2節に追記する）
- [ ] 影が丸角に沿っている（四角くなっていない）
- [ ] 他アプリにフォーカスがある状態でパレットを出しても灰色に濁らない
- [ ] 黒い壁紙の上でレーン名（secondary）が読める
- [ ] 白い壁紙の上でパレットの輪郭が背景に溶けていない
- [ ] ダークのシステムで起動時に白く光らない

- [ ] **Step 9: フォールバックを手動検証する**

DevTools のコンソールで実行する。

```js
document.documentElement.setAttribute("data-vibrancy", "off");
```

Expected: ガラスがほぼ不透明になり、壁紙が透けなくなる。文字がすべて読める。
確認後に `document.documentElement.removeAttribute("data-vibrancy")` で戻す。

- [ ] **Step 10: コミット**

```bash
git add -A
git commit -m "feat: ガラスの器にハイライトと屈折を重ねる

ネイティブのぼかしの上に、上端のスペキュラーハイライトと
縁のごく薄い屈折を乗せて、平らな半透明から立体的なガラスにする。
角丸の値は設定とCSSとで揃える必要があるため定数にする。"
```

---

## Task 4: `--st-*` を `--av-*` へ機械置換し、エイリアスを撤去する

設計書 3.2節。**テストは `--st-*` も `st-*` クラスも参照していない**ため、純粋な機械置換で完了する。

**Files:**
- Modify: `src/index.css` および `src/components/` 配下すべて

- [ ] **Step 1: 置換前の件数を記録する**

Run: `grep -rn "st-" src --include="*.tsx" --include="*.ts" --include="*.css" | grep -cE "\-\-st\-|\"st\-|\bst\-(card|palette|text|row|border|chip|input|btn|toggle|view|search)"`
Expected: 数値が出る（記録しておき、置換後に 0 になることを確認する）

- [ ] **Step 2: CSS 変数を置換する**

```bash
grep -rl -- "--st-" src | xargs sed -i '' 's/--st-palette-border/--av-hairline/g; s/--st-text-primary/--av-text-primary/g; s/--st-text-secondary/--av-text-secondary/g; s/--st-text-tertiary/--av-text-muted/g; s/--st-surface-hover/--av-surface-hover/g; s/--st-surface-selected/--av-surface-selected/g; s/--st-card-bg/--av-surface-card/g; s/--st-card-hover-bg/--av-surface-card-hover/g; s/--st-shadow/--av-shadow/g; s/--st-ease/--av-ease/g'
```

- [ ] **Step 3: `--st-palette-bg` の残りを個別に直す**

`--st-palette-bg` は単色から「ティント色＋アルファ」に分離したので、機械置換できない。
`ConfirmDialog.tsx` の1箇所だけが使っている。

Run: `grep -rn -- "--st-palette-bg" src`
Expected: `src/components/ConfirmDialog.tsx` の1件のみ

この1件を次に置き換える（ダイアログ本体はガラスの上に重ねるので**不透明**にする。設計書 5.5節）。

```tsx
        style={{ backgroundColor: "var(--av-surface-raised)" }}
```

- [ ] **Step 4: ユーティリティクラス名を置換する**

```bash
grep -rl "st-" src | xargs sed -i '' 's/\bst-text-1\b/av-text-1/g; s/\bst-text-2\b/av-text-2/g; s/\bst-text-3\b/av-text-3/g; s/\bst-row-selected\b/av-row-selected/g; s/\bst-border\b/av-border/g; s/\bst-chip\b/av-chip/g; s/\bst-input\b/av-input/g; s/\bst-search-input\b/av-input/g; s/\bst-btn-ghost\b/av-btn-ghost/g; s/\bst-toggle-off\b/av-toggle-off/g; s/\bst-card\b/av-card/g; s/\bst-view-forward\b/av-view-forward/g; s/\bst-view-back\b/av-view-back/g; s/\bst-palette-in\b/av-palette-in/g; s/\bst-drill-in\b/av-drill-in/g; s/\bst-drill-back\b/av-drill-back/g'
```

`st-search-input` は `st-input` と完全に同じ定義だったため、`av-input` に統合している。

> **実行時に判明した罠（macOS）**: BSD sed（`/usr/bin/sed`）は `\b`（単語境界）を**サポートしていない**。
> 上の sed をそのまま実行すると**エラーも出さずに1件もマッチしない**。
> `gsed` を入れるか、`\b` を外したリテラル置換に切り替えること。
> 後者の場合は部分一致の危険があるので（`st-input` が `st-search-input` の一部にヒットする等）、
> 実行後に必ず `git diff` と `grep -rn "search" src` で破壊がないか目視すること。

- [ ] **Step 5: `index.css` のエイリアスとユーティリティ定義を整理する**

Task 2 の Step 1 で入れた「旧トークンのエイリアス」ブロック（`--st-palette-border` から `--st-ease` までの10行）を**削除する**。

さらに、`.st-search-input::placeholder { … }` の定義ブロックを削除する（`av-input` に統合済み）。

`prefers-reduced-motion` ブロック内のクラス名も Step 4 の sed で置換済みであることを確認する。

- [ ] **Step 6: 残存がゼロであることを確認する**

Run: `grep -rn -- "--st-" src ; grep -rniE "\bst-(card|palette|text-[123]|row-selected|border|chip|input|btn-ghost|toggle-off|view-|search-input|drill|palette-in)" src`
Expected: **両方とも出力なし**

- [ ] **Step 7: ビルドとテストを通す**

Run: `npx tsc --noEmit && npm run build && npx vitest run`
Expected: すべて成功

- [ ] **Step 8: 実機で見た目が崩れていないことを確認する**

Run: `npm run tauri dev`
Expected: Task 3 の Step 8 と同じ見た目。クラス名の置換漏れがあると、その要素だけ素のまま（枠線や色が消える）になるので目視で探す。

- [ ] **Step 9: コミット**

```bash
git add -A
git commit -m "refactor: カラートークンを --st-* から --av-* へ改名

stはsmartTask時代の遺物で、改名済みの他レイヤーと不整合だった。
重複していた st-search-input は st-input と統合する。"
```

---

## Task 5: 選択カードを案Aにし、ステータス色を `color-mix` へ移す

設計書 6.3節 / 6.4節 / 3.7節。現行の白文字は**ステータス8色すべてで AA を割っている**。

**Files:**
- Modify: `src/index.css`
- Modify: `src/components/TaskCard.tsx`
- Modify: `src/components/Lane.tsx`
- Modify: `src/components/TaskDetail.tsx`
- Modify: `src/components/Board.tsx`
- Test: `src/components/Board.test.tsx`（既存テストの期待値確認）

- [ ] **Step 1: 失敗するテストを書く**

`src/components/Board.test.tsx` の末尾（`describe` の中）に追加する。
「選択カードがステータス色でベタ塗りされていないこと」を回帰として固定する。

```tsx
  it("選択カードはステータス色でベタ塗りされず、白文字固定にもならない", async () => {
    // fixtures の「進行中」レーンにタスクがある前提の既存セットアップを使う
    renderBoard();
    const card = await screen.findByTestId("task-card");
    // 選択状態にする
    fireEvent.click(card);
    await waitFor(() =>
      expect(card).toHaveAttribute("data-selected", "true"),
    );

    // インラインstyleにステータス色や #fff が直接入っていないこと。
    // 選択の見た目は .av-card[data-selected] のCSS側が持つ。
    expect(card.style.backgroundColor).toBe("");
    expect(card.style.color).toBe("");
    // ステータス色は装飾用のカスタムプロパティとしてだけ注入される
    expect(card.style.getPropertyValue("--av-status")).not.toBe("");
  });
```

既存のテストが `renderBoard` / `fireEvent` / `waitFor` を import していない場合は追加する。
既存のセットアップ関数名が異なる場合は、そのファイルの既存パターンに合わせること。

- [ ] **Step 2: テストが失敗することを確認する**

Run: `npx vitest run src/components/Board.test.tsx`
Expected: FAIL — `expected 'rgb(0, 122, 255)' to be ''`（インラインで背景色が入っているため）

- [ ] **Step 3: CSS に選択カードとステータス点を実装する**

`src/index.css` の `.av-card` 関連ブロック（Task 4 で改名済み）を次で置き換える。

```css
/* ============ タスクカード ============
   カードはガラスにしない（ガラス×ガラスは屈折が二乗になって濁る）。
   ただし完全不透明にすると盤面の大半でガラスが消えるので、高アルファの面にする。 */
.av-card {
  background-color: var(--av-surface-card);
  color: var(--av-text-primary);
  transition:
    background-color 120ms var(--av-ease),
    color 120ms var(--av-ease),
    transform 120ms var(--av-ease),
    box-shadow 120ms var(--av-ease);
}

.av-card:hover:not([data-selected="true"]) {
  background-color: var(--av-surface-card-hover);
}

/* 選択は「いまどこにいるか」という状態であって、ステータス（データ）ではない。
   だから選択の色はブランド青ひとつに固定し、ステータスの識別は
   レーンの所属とカード左の点が担う。
   ステータス色に何が入っても選択表示のコントラストが壊れないのが、この設計の要点。 */
.av-card[data-selected="true"] {
  background-color: color-mix(
    in srgb,
    var(--av-accent) var(--av-accent-mix),
    var(--av-surface-card)
  );
  color: var(--av-accent-text);
  font-weight: 600;
  /* 2pxのリングは装飾ではない。淡面だけでは隣接カードとの面コントラストが
     1.15:1 しかなく、WCAG 1.4.11（非文字のUI状態は3:1）を満たせない */
  box-shadow:
    inset 0 0 0 2px var(--av-accent),
    0 4px 12px color-mix(in srgb, var(--av-accent) 30%, transparent);
  transform: translateY(-1px);
}

/* ステータス識別用の点。ティール・オレンジは面コントラストが2:1前後しかなく
   単独では縁が溶けるため、必ず内側の輪郭を添える */
.av-status-dot {
  background-color: var(--av-status);
  box-shadow: inset 0 0 0 0.5px oklch(0 0 0 / 0.15);
}

/* ============ ステータスチップ（詳細画面） ============ */
.av-status-chip {
  background-color: color-mix(in srgb, var(--av-status) 14%, var(--av-surface-card));
  color: color-mix(in srgb, var(--av-status) 45%, var(--av-text-primary));
}

.dark .av-status-chip {
  background-color: color-mix(in srgb, var(--av-status) 22%, var(--av-surface-card));
  color: color-mix(in srgb, var(--av-status) 45%, #fff);
}
```

- [ ] **Step 4: `TaskCard.tsx` を書き換える**

`src/components/TaskCard.tsx` の `return` 部分を次で置き換える。
インラインの色指定を全廃し、ステータス色はカスタムプロパティとしてだけ注入する。

```tsx
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
          ? "av-card flex cursor-default items-center gap-2 rounded-xl px-3 py-2 text-[13px] leading-snug"
          : "av-card flex cursor-default items-center gap-2 rounded-xl px-3 py-2 text-[13px] leading-snug shadow-sm"
      }
      // 色そのものはCSS側が決める。ここはステータス色を渡すだけ
      style={{ "--av-status": statusColor } as React.CSSProperties}
    >
      <span className="av-status-dot h-1.5 w-1.5 shrink-0 rounded-full" />
      <span className="min-w-0 truncate">{task.title}</span>
    </div>
  );
```

ファイル先頭の import に `React` の型が必要になるので、次を確認する。

```tsx
import { useEffect, useRef } from "react";
import type { CSSProperties } from "react";
```

を使う場合は `style={{ "--av-status": statusColor } as CSSProperties}` とする。既存の import 形に合わせること。

- [ ] **Step 5: テストが通ることを確認する**

Run: `npx vitest run src/components/Board.test.tsx`
Expected: PASS

- [ ] **Step 6: `Lane.tsx` の点の輪郭と件数の格上げを行う**

`src/components/Lane.tsx` の `<Circle …>` を、輪郭付きの点に置き換える。
lucide の `Circle` は輪郭を足しづらいので、`span` にする。

```tsx
        {/*
          ステータスのアイコンは常に丸1種類で、色だけをステータス色に塗る。
          ユーザーがステータスを自由に追加・改名できるため、
          名前やposition順でアイコンを出し分けるとカスタムステータスで破綻するため。
        */}
        <span
          className="av-status-dot h-2.5 w-2.5 shrink-0 rounded-full"
          style={{ "--av-status": status.color } as React.CSSProperties}
        />
```

`import { Circle } from "lucide-react";` の行を削除する。

件数を tertiary から secondary へ格上げする（情報であって装飾ではない。設計書 5.6節）。

```tsx
        <span
          data-testid="lane-count"
          className="ml-auto text-[11px] tabular-nums"
          style={{ color: "var(--av-text-secondary)" }}
        >
```

空レーンの「なし」は装飾なので `--av-text-muted` のままでよい（Task 4 の置換で既にそうなっている）。

- [ ] **Step 7: `Board.tsx` の空状態サブ行を格上げする**

`src/components/Board.tsx` の空状態の2つ目の `<p>` を secondary にする。
アイコンは装飾なので muted のままでよい。

```tsx
        <p className="text-xs" style={{ color: "var(--av-text-secondary)" }}>
          タスク名を入力して Enter で作成できます
        </p>
```

- [ ] **Step 8: `TaskDetail.tsx` のステータスチップを直す**

現行は「文字＝生のステータス色、面＝12%」で最小 **1.63:1** と完全に破綻している。

`src/components/TaskDetail.tsx` のチップ部分を次で置き換える。

```tsx
          <span
            className="av-status-chip rounded-full px-3 py-1 text-xs font-medium"
            style={
              { "--av-status": status?.color ?? "#8E8E93" } as React.CSSProperties
            }
          >
            {status?.name ?? "未分類"}
          </span>
```

- [ ] **Step 9: hex 文字列連結が残っていないことを確認する**

Run: `grep -rnE '\$\{[^}]*[Cc]olor[^}]*\}[0-9A-Fa-f]{2}' src`
Expected: 出力なし

- [ ] **Step 10: 全テスト・型検査・ビルドを通す**

Run: `npx vitest run && npx tsc --noEmit && npm run build`
Expected: すべて成功

- [ ] **Step 11: 実機で確認する**

Run: `npm run tauri dev`

- [ ] 選択カードが青い淡面＋青いリングになっている
- [ ] リングが隣接カードと明確に分離して見える
- [ ] カード左の点でステータスが識別できる
- [ ] 詳細画面のステータスチップの文字が読める
- [ ] ステータス色をオレンジ・グリーンに変えても選択カードの見え方が変わらない

- [ ] **Step 12: コミット**

```bash
git add -A
git commit -m "feat: 選択カードをブランド青の表現に変える

ステータス色でベタ塗りして白文字を載せる現行の表現は、
プリセット8色すべてでコントラスト基準を満たしていなかった。
選択は状態でありデータではないので、色はブランド青に固定し、
ステータスの識別はレーンと左の点が担う。
ステータス色のアルファ生成もhex文字列連結からcolor-mixへ移す。"
```

---

## Task 6: トースト・ダイアログ・BlockNote・個別修正をトークンへ寄せる

設計書 7.2〜7.6節。

**Files:**
- Modify: `src/components/ui/sonner.tsx`
- Modify: `src/components/ConfirmDialog.tsx`
- Modify: `src/components/AppSettings.tsx`
- Modify: `src/components/StatusSettings.tsx`
- Modify: `src/index.css`

- [ ] **Step 1: `sonner.tsx` をダーク対応にする**

現行は `theme="light"` 固定 + `bg-white` 固定で、ダークのガラスの上に真っ白な板が乗る。
`src/components/ui/sonner.tsx` を全面的に書き換える。

```tsx
import { Toaster as SonnerToaster } from "sonner";
import type { ToasterProps } from "sonner";

interface Props extends ToasterProps {
  /** OSのカラースキーム。購読はPalette側で行い、ここでは受け取るだけ */
  isDark: boolean;
}

/**
 * sonner の Toaster ラッパー。
 * shadcn/ui の CLI が生成する版は next-themes に依存しており Vite プロジェクトでは動かないため、
 * useColorScheme の値を受け取る最小構成を手書きしている。
 *
 * 面は不透明にする。ガラスの器の上にさらにガラスを重ねると屈折が二乗になって濁るため。
 */
export function Toaster({ isDark, ...props }: Props) {
  return (
    <SonnerToaster
      theme={isDark ? "dark" : "light"}
      position="bottom-right"
      closeButton={false}
      toastOptions={{
        classNames: {
          toast:
            "rounded-xl border av-border av-surface-raised av-text-1 text-[13px] shadow-lg",
          description: "av-text-2",
          error: "av-danger-text",
        },
      }}
      {...props}
    />
  );
}
```

- [ ] **Step 2: トーストが使うユーティリティクラスを `index.css` に足す**

`av-text-1` / `av-text-2` / `av-border` は既にあるので、不足分だけ足す。
ユーティリティ定義が並んでいるブロック（`.av-text-1 { … }` の近く）に追加する。

```css
.av-surface-raised {
  background-color: var(--av-surface-raised);
}
.av-danger-text {
  color: var(--av-danger);
}
```

- [ ] **Step 3: `ConfirmDialog.tsx` の色をトークンへ移す**

`src/components/ConfirmDialog.tsx` を次のように直す。

オーバーレイ（`bg-black/20` はライト/ダーク分岐が無く、ダークでは背面のガラスと区別がつかない）。
`backdrop-blur-[2px]` は**残す** — これは Web 側スタッキングコンテキスト内をぼかすので、
`.av-glass` から外した `backdrop-filter` とは別物。

```tsx
      className="absolute inset-0 z-20 flex items-center justify-center p-6 outline-none backdrop-blur-[2px]"
      style={{ backgroundColor: "var(--av-scrim)" }}
```

警告アイコン（`text-[#FF3B30]` を撤去）。

```tsx
          <AlertTriangle
            size={18}
            className="mt-0.5 shrink-0"
            style={{ color: "var(--av-danger)" }}
          />
```

破棄ボタン（白文字 on `#FF3B30` は 3.55 で不合格。`--av-danger-solid` なら 5.53）。

```tsx
          <button
            type="button"
            onClick={onConfirm}
            className="rounded-md px-3 py-1.5 font-medium transition-opacity hover:opacity-90"
            style={{
              backgroundColor: "var(--av-danger-solid)",
              color: "var(--av-text-on-accent)",
            }}
          >
            {confirmLabel} (Enter)
          </button>
```

本体の背景は Task 4 の Step 3 で `--av-surface-raised` に直済み。

- [ ] **Step 4: `AppSettings.tsx` の色をトークンへ移す**

自動起動トグル ON（白ノブ on `#34C759` は 2.22 で非文字 3:1 も割る）。

```tsx
          className={`relative h-6 w-10 shrink-0 rounded-full transition-colors ${
            autostartOn ? "" : "av-toggle-off"
          }`}
          style={
            autostartOn ? { backgroundColor: "var(--av-success)" } : undefined
          }
```

トグルのつまみ。OFF トラックは意図的に低コントラストな面なので、白ノブとの比は 3:1 に届かない
（Apple の純正トグルも同様）。輪郭の影で分離する。

```tsx
          <span
            className={`absolute top-0.5 left-0 h-5 w-5 rounded-full bg-white transition-transform ${
              autostartOn ? "translate-x-[18px]" : "translate-x-0.5"
            }`}
            style={{ boxShadow: "0 1px 2px oklch(0 0 0 / 0.22)" }}
          />
```

ホットキー取得中ボタン（白文字 on `#007AFF` は 4.02 で不合格。`--av-accent-solid` なら 4.73）。

```tsx
          className={`rounded-md px-2 py-1 text-xs transition-colors ${
            capturing ? "" : "av-text-2 av-btn-ghost"
          }`}
          style={
            capturing
              ? {
                  backgroundColor: "var(--av-accent-solid)",
                  color: "var(--av-text-on-accent)",
                }
              : undefined
          }
```

エラー表示。

```tsx
        <p
          role="alert"
          className="mx-3 mt-1 rounded-md px-3 py-2 text-xs leading-relaxed"
          style={{
            backgroundColor: "var(--av-danger-subtle)",
            color: "var(--av-danger)",
          }}
        >
```

最後に、`src/index.css` の `.av-toggle-off` の値をトークン参照に直す。
Task 4 の sed はクラス名を変えただけで、中身は `rgba(120,120,128,.32)` のライト/ダーク共通のままになっている。

```css
/* トグルOFF時のトラック。地の明るさに合わせて分岐させる */
.av-toggle-off {
  background-color: var(--av-toggle-off);
}
```

- [ ] **Step 5: `StatusSettings.tsx` の色ピッカーのリングを直す**

`ring-offset-2` はオフセット色が Tailwind 既定（白）のままで、ダークで白い輪ができる。
`outline` に変えれば地の色に依存しない。選択の指示にはアクセント青を使う。

`src/components/StatusSettings.tsx` の色チップの `className` を次で置き換える。

```tsx
              className={`h-5 w-5 rounded-full transition-transform ${
                i === colorIndex
                  ? "scale-110 outline-2 outline-offset-2 outline-[var(--av-focus-ring)]"
                  : ""
              }`}
```

- [ ] **Step 6: BlockNote の変数をトークンから流し込む**

`src/index.css` の `.bn-root[data-color-scheme="dark"] { … }` と
`.bn-root[data-color-scheme="light"] { … }` の2ブロックを、次の1ブロックで置き換える。
値を直書きしていた `#f5f5f7` / `#2c2c2e` / `#1c1c1e` は新トークンとズレるため撤去する。

```css
/* BlockNoteの配色をパレットに合わせる。
   data-color-scheme は TaskDetail の theme prop（= useColorScheme の値）が駆動する。
   .dark が documentElement に付いているので、var() は自動的に正しい側を引く */
.bn-root[data-color-scheme="light"],
.bn-root[data-color-scheme="dark"] {
  --bn-colors-editor-background: transparent;
  --bn-colors-editor-text: var(--av-text-primary);
  --bn-colors-menu-background: var(--av-surface-raised);
  --bn-colors-menu-text: var(--av-text-primary);
  --bn-colors-tooltip-background: var(--av-surface-raised);
  --bn-colors-tooltip-text: var(--av-text-secondary);
  --bn-colors-hovered-background: var(--av-surface-hover);
  --bn-colors-hovered-text: var(--av-text-primary);
  --bn-colors-selected-background: var(--av-accent-solid);
  --bn-colors-selected-text: var(--av-text-on-accent);
  --bn-colors-disabled-background: var(--av-surface-hover);
  --bn-colors-disabled-text: var(--av-text-muted);
  --bn-colors-border: var(--av-hairline);
  --bn-colors-side-menu: var(--av-text-muted);
}
```

- [ ] **Step 7: スラッシュメニューの選択行をトークンへ移す**

`src/index.css` のスラッシュメニュー指定を次で置き換える。
`#007aff`（白文字 4.02 で不合格）を `--av-accent-solid`（4.73）にする。
あわせて `#007aff` と `#007AFF` が大小文字違いで別リテラルになっていた問題も消える。

```css
/* ============ スラッシュメニュー(BlockNoteのサジェスト) ============
   shadcn既定の選択色(bg-accent)は、半透明のパレット上では選択行が背景と見分けられない。
   macOSのメニューに合わせてブランド青で塗る。
   Tailwindのユーティリティは@layer内なので、レイヤー外のこの指定が優先される */
.bn-suggestion-menu [aria-selected="true"] {
  background-color: var(--av-accent-solid);
  border-radius: 8px;
}

/* 選択行の中身(タイトル・説明文・アイコン)は白に統一して可読性を保つ */
.bn-suggestion-menu [aria-selected="true"],
.bn-suggestion-menu [aria-selected="true"] * {
  color: var(--av-text-on-accent);
}

.bn-suggestion-menu [aria-selected="true"] svg {
  color: var(--av-text-on-accent);
}

/* ショートカットのバッジは青地に埋もれるので、半透明白の地に置き換える */
.bn-suggestion-menu [aria-selected="true"] kbd,
.bn-suggestion-menu [aria-selected="true"] [class*="badge"],
.bn-suggestion-menu [aria-selected="true"] [data-slot="badge"] {
  background-color: oklch(1 0 0 / 0.22);
  border-color: transparent;
}
```

- [ ] **Step 8: 直書きの色が残っていないことを確認する**

Run: `grep -rniE "#[0-9a-f]{3,8}\b|bg-white|bg-black/|text-white|border-black/" src --include="*.tsx" --include="*.css" | grep -v "\.test\." | grep -v "statusPalette"`
Expected: 残るのは次だけ。それ以外があれば直す。
- `index.css` のトークン定義ブロック内のコメント（`/* #0A84FF … */` 等）
- `TaskCard.tsx` / `TaskDetail.tsx` のステータス色フォールバック `"#8E8E93"`（Task 7 で JSON 由来に置き換える）
- `AppSettings.tsx` のトグルつまみ `bg-white`（白いノブは意図した固定値）
- `index.css` の `oklch(0 0 0 / 0.15)` と `oklch(1 0 0 / 0.22)`（輪郭・半透明白の地）

- [ ] **Step 9: 全テスト・型検査・ビルドを通す**

Run: `npx vitest run && npx tsc --noEmit && npm run build`
Expected: すべて成功。`Palette.test.tsx` の `Toaster: () => null` モックは props 追加後も有効。

- [ ] **Step 10: 実機でダークモードを確認する**

システム設定でダークに切り替えて `npm run tauri dev` を起動する。

- [ ] トーストが暗い面になっている（白い板が出ない）
- [ ] 確認ダイアログの背面のスクリムでダイアログ本体が分離して見える
- [ ] 確認ダイアログの「削除する」ボタンの文字が読める
- [ ] 設定のエラー表示が読める
- [ ] 色ピッカーの選択リングに白い輪が出ていない
- [ ] BlockNote のスラッシュメニューが暗い面になり、選択行が青い
- [ ] `* { @apply border-border }` の復活で意図しない枠線が出ていない

- [ ] **Step 11: コミット**

```bash
git add -A
git commit -m "fix: トースト・ダイアログ・エディタをダークモードに対応させる

トーストがテーマ固定で、ダークのパレット上に白い板が出ていた。
確認ダイアログのスクリムと危険色、設定画面のトグルとエラー表示、
BlockNoteの配色をすべてトークン参照に寄せる。"
```

---

## Task 7: ステータス色プリセットを単一ソースにし、青の役割衝突を解消する

設計書 6.1節 / 6.2節 / 6.5節。

`#007AFF` は Avoliq Blue `#0A84FF` と**色相差 2°・明度差 0.02** で視覚的に同一色。
「唯一の行動色」とステータスの一種が見分けられないのは、キーボード駆動の UI では致命的。

**既存ボードの `statuses.color` は一切書き換えない。マイグレーションは行わない。**

**Files:**
- Create: `design/status-presets.json`
- Modify: `src/lib/statusPalette.ts`
- Modify: `src-tauri/src/db/repo.rs`
- Modify: `src/test/fixtures.ts` および `#007AFF` を使うテスト

- [ ] **Step 1: プリセット JSON を作る**

`design/status-presets.json` を新規作成する。**先頭4件が新規ボードのデフォルトステータスになる。**

```json
[
  { "name": "グレー", "value": "#8E8E93" },
  { "name": "ティール", "value": "#5AC8FA" },
  { "name": "オレンジ", "value": "#FF9500" },
  { "name": "グリーン", "value": "#34C759" },
  { "name": "レッド", "value": "#FF3B30" },
  { "name": "インディゴ", "value": "#5856D6" },
  { "name": "パープル", "value": "#AF52DE" },
  { "name": "ピンク", "value": "#FF2D55" }
]
```

- [ ] **Step 2: TS 側を JSON import に変える**

`src/lib/statusPalette.ts` を次で置き換える。

```ts
import presets from "../../design/status-presets.json";

/**
 * ステータス色のプリセットパレット。
 *
 * 実値は design/status-presets.json が唯一のソースで、Rust 側の DEFAULT_STATUSES も
 * 同じファイルを読む。片方だけ変えてズレることが構造的に起きないようにするため。
 * 先頭4件が新規ボードのデフォルトステータスになる。
 *
 * macOSのシステムカラーを踏襲するが、ブランドの行動色 #0A84FF と見分けがつかない
 * #007AFF は入れない（選択状態とステータスが混同されるため）。
 */
export const STATUS_COLORS: readonly { name: string; value: string }[] = presets;

export type StatusColor = string;
```

- [ ] **Step 3: TS のビルドが通ることを確認する**

Run: `npx tsc --noEmit`
Expected: 成功。`resolveJsonModule` は `tsconfig.json` で既に有効。

失敗する場合（`src` の外を import できない等）は、JSON を `src/lib/statusPresets.json` へ移し、
import を `./statusPresets.json` に変え、Step 4 の `include_str!` のパスを
`../../../src/lib/statusPresets.json` に合わせる。**単一ソースであることが要件であり、置き場所は要件ではない。**

- [ ] **Step 4: Rust 側を JSON 由来に変える**

`src-tauri/src/db/repo.rs` の `DEFAULT_STATUSES` の定義を次で置き換える。

```rust
/// ステータス色プリセット（design/status-presets.json）の1件。
/// TS側の STATUS_COLORS と同じファイルを読むことで、色のズレを構造的に防ぐ。
#[derive(serde::Deserialize)]
struct StatusPreset {
    name: String,
    value: String,
}

/// プリセットのJSON。コンパイル時に埋め込むので実行時のI/Oは無い。
/// JSONが壊れていればビルドではなく最初のパースで落ちる。
const STATUS_PRESETS_JSON: &str =
    include_str!("../../../design/status-presets.json");

/// 新規ボード作成時に自動投入するデフォルトステータス（name, color）。
/// プリセットの先頭4件を使う。並び順は配列の順。
fn default_statuses() -> Vec<(String, String)> {
    let presets: Vec<StatusPreset> = serde_json::from_str(STATUS_PRESETS_JSON)
        .expect("design/status-presets.json のパースに失敗しました");
    presets
        .into_iter()
        .take(4)
        .map(|preset| (preset.name, preset.value))
        .collect()
}
```

`DEFAULT_STATUSES` を参照している箇所（`board_create` 内のループ）を `default_statuses()` へ差し替える。

Run: `grep -n "DEFAULT_STATUSES" src-tauri/src/`
Expected: 参照箇所がすべて洗い出される。テスト内の参照も含めて `default_statuses()` に直す。

- [ ] **Step 5: Rust のテスト期待値を更新する**

`src-tauri/src/db/repo.rs` のテストで「進行中」の色を `#007AFF` と書いている箇所を `#5AC8FA` に直す。
テストで `#AF52DE` / `#FF2D55` を使っている箇所はプリセットに残っているのでそのままでよい。

さらに、JSON が読めることを固定するテストを足す。

```rust
    #[test]
    fn default_statuses_はプリセットの先頭4件を返す() {
        let defaults = default_statuses();
        assert_eq!(defaults.len(), 4);
        assert_eq!(defaults[0], ("未着手".to_string(), "#8E8E93".to_string()));
        // ここは design/status-presets.json の2件目と一致する必要がある
        assert_eq!(defaults[1].1, "#5AC8FA");
    }
```

**注意**: プリセット JSON の1件目の `name` は「グレー」であって「未着手」ではない。
`default_statuses()` はプリセットの `name` をそのままステータス名に使うと
「グレー / ティール / オレンジ / グリーン」というボードができてしまう。
**色だけをプリセットから取り、名前は Rust 側に持つ**のが正しい。次の形にする。

```rust
/// 新規ボードのデフォルトステータス名。色はプリセットの先頭4件を順に使う。
const DEFAULT_STATUS_NAMES: [&str; 4] = ["未着手", "進行中", "確認中", "完了"];

fn default_statuses() -> Vec<(String, String)> {
    let presets: Vec<StatusPreset> = serde_json::from_str(STATUS_PRESETS_JSON)
        .expect("design/status-presets.json のパースに失敗しました");
    DEFAULT_STATUS_NAMES
        .iter()
        .zip(presets.into_iter())
        .map(|(name, preset)| (name.to_string(), preset.value))
        .collect()
}
```

`StatusPreset` の `name` フィールドは Rust では使わないので、警告を避けるため次にする。

```rust
#[derive(serde::Deserialize)]
struct StatusPreset {
    /// TS側の色ピッカーのラベルに使う。Rust側では色だけ使うので読み捨てる
    #[allow(dead_code)]
    name: String,
    value: String,
}
```

- [ ] **Step 6: Rust のテストを通す**

Run: `cd src-tauri && cargo test`
Expected: 全 PASS

- [ ] **Step 7: TS のテスト期待値を更新する**

`#007AFF` を「進行中」の色として使っているテストを洗い出す。

Run: `grep -rn "007AFF" src`

`src/test/fixtures.ts` の「進行中」を `#5AC8FA` に直す。
`Board.test.tsx` / `TaskDetail.test.tsx` / `StatusSettings.test.tsx` で `#007AFF` を
「進行中」の色として使っている箇所を同様に直す。

`api.test.ts` の `#FF0000` はプリセットと無関係な任意色のテストなのでそのままでよい。

`StatusSettings.test.tsx` で「ブルー」というプリセット名を参照している箇所があれば
「ティール」または「インディゴ」に直す。

- [ ] **Step 8: プリセット外の色の回帰テストを足す**

既存ボードには `#007AFF` が残る。色ピッカーを開いても壊れないことを固定する。
`src/components/StatusSettings.test.tsx` に追加する。

```tsx
  it("プリセットに無い色を持つステータスでも色ピッカーが開ける", async () => {
    // 旧プリセットの #007AFF は現在のプリセットに存在しない
    renderStatusSettings([
      { id: "s1", boardId: "b1", name: "進行中", color: "#007AFF", position: 0 },
    ]);

    const row = await screen.findByText("進行中");
    fireEvent.keyDown(row, { key: "c" });

    // 例外が出ず、ピッカーが描画される。現在色が引けないので先頭(グレー)が選択される
    const listbox = await screen.findByRole("listbox", { name: "色を選択" });
    expect(listbox).toBeInTheDocument();
    const options = within(listbox).getAllByRole("option");
    expect(options[0]).toHaveAttribute("aria-selected", "true");
  });
```

セットアップ関数名・キーイベントの送り先は、そのファイルの既存パターンに合わせること。

- [ ] **Step 9: 全テストを通す**

Run: `npx vitest run && cd src-tauri && cargo test && cd ..`
Expected: すべて PASS

- [ ] **Step 10: 実機で新規ボードを作って確認する**

Run: `npm run tauri dev`

- [ ] 新しいボードを作ると「未着手 / 進行中 / 確認中 / 完了」の名前で作られる
- [ ] 「進行中」のレーンの点がティール（水色）になっている
- [ ] 色ピッカーの選択肢にインディゴがあり、`#007AFF` のブルーが無い
- [ ] 既存ボードの色が変わっていない

- [ ] **Step 11: コミット**

```bash
git add -A
git commit -m "feat: ステータス色プリセットを単一ソースにしブルーを入れ替える

RustとTSが同じJSONを読むようにして、先頭4色が一致していることへの
暗黙依存をなくす。#007AFF はブランドの行動色 #0A84FF と見分けが
つかないためプリセットから外し、インディゴを補充する。
新規ボードの進行中はティールにする。既存ボードの色は変更しない。"
```

---

## Task 8: デッドコードを削除する

設計書 7.7節。**ユーザー承認済み。**

**Files:**
- Delete: `src/components/ui/button.tsx` / `src/assets/react.svg` / `public/vite.svg` / `public/tauri.svg`
- Modify: `README.md`

- [ ] **Step 1: 参照がゼロであることを確認する**

Run: `grep -rn "ui/button\|<Button\|react.svg\|vite.svg\|tauri.svg" src index.html src-tauri/tauri.conf.json`
Expected: **出力なし**。1件でも出たら削除せず、参照元を先に処理する。

- [ ] **Step 2: 削除する**

```bash
git rm src/components/ui/button.tsx src/assets/react.svg public/vite.svg public/tauri.svg
```

`src/assets/` が空になったら、git は空ディレクトリを追跡しないので何もしなくてよい。

- [ ] **Step 3: README に shadcn CLI の注意を足す**

`components.json` が残っているため `npx shadcn add` を実行すると、
`ui/button.tsx` が再生成され、`:root` の shadcn 変数も直値に戻る。

`README.md` の末尾に追記する。

```markdown
## 配色まわりの注意

`npx shadcn add` を実行すると `src/index.css` の shadcn テーマ変数が
直値で上書きされ、`var(--av-*)` への参照が失われる。
CLI を実行した後は必ず `git diff src/index.css` を確認して、
テーマ変数が `var(--av-*)` を指したままであることを確かめること。

色の実値は `src/index.css` のトークン定義ブロックにだけ置く。
設計は `docs/superpowers/specs/2026-08-21-avoliq-color-system-design.md` を参照。
```

- [ ] **Step 4: ビルドとテストを通す**

Run: `npx vitest run && npx tsc --noEmit && npm run build`
Expected: すべて成功

- [ ] **Step 5: コミット**

```bash
git add -A
git commit -m "chore: 未使用のコンポーネントと画像を削除する

ui/button.tsx はどこからも使われておらず、テーマ変数の変更に
追随できているか誰も検証しない領域になっていた。
Viteテンプレートの残骸の画像もあわせて整理する。"
```

---

## Task 9: ブランド設計書に追記し、全体を検証する

設計書 9節 / 11節 / 15節。

**Files:**
- Modify: `docs/superpowers/specs/2026-08-20-avoliq-brand-design.md`

- [ ] **Step 1: ブランド設計書の第4節に追記する**

`docs/superpowers/specs/2026-08-20-avoliq-brand-design.md` の第4節「Liquid Glass の使い方」の
箇条書きの後ろに、次を追記する。

字面の「ガラスを背景全面に多用しない」と実装の「パレットの器をガラスにする」が
衝突して見えるため、解釈を確定させる。

```markdown
### Avoliq アプリにおける適用

Avoliq のパレットはデスクトップの上に浮く単一の面であり、これ自体が「前面に浮く重要な一要素」にあたる。
したがって**パレットの器はガラスとして表現してよい**。
禁じるのはその内側での多用であり、タスクカード・ダイアログ・トースト・エディタのメニューにガラスを使わない。
ガラスの上にガラスを重ねると屈折が二乗になって濁るため、内側の浮きものはすべて不透明な面で置く。

実装仕様は `2026-08-21-avoliq-color-system-design.md` の5節を正とする。
```

- [ ] **Step 2: 受け入れ基準を機械的に検証する**

以下を順に実行し、すべて期待どおりであることを確認する。

```bash
# 旧トークン・旧クラスが残っていない
grep -rn -- "--st-" src ; echo "---"
grep -rniE "\bst-(card|palette|text-[123]|row-selected|border|chip|input|btn-ghost|toggle-off|view-|drill)" src ; echo "---"
# hex文字列連結によるアルファ生成が残っていない
grep -rnE '\$\{[^}]*[Cc]olor[^}]*\}[0-9A-Fa-f]{2}' src ; echo "---"
# backdrop-filter が .av-glass から消えている
grep -n "backdrop-filter" src/index.css ; echo "---"
# @media prefers-color-scheme が消えている
grep -n "prefers-color-scheme" src/index.css ; echo "---"
# usePrefersDark が消えている
grep -rn "usePrefersDark" src ; echo "---"
# 角丸16が3箇所で揃っている
grep -n "PANEL_CORNER_RADIUS" src-tauri/src/panel.rs
grep -n "border-radius: 16px" src/index.css
grep -n '"radius"' src-tauri/tauri.conf.json
```

Expected:
- 最初の6つの grep は**すべて出力なし**（`prefers-color-scheme` は `index.html` にはあるが `index.css` には無い）
- `PANEL_CORNER_RADIUS` が定数定義と `set_corner_radius` の2箇所
- CSS の `border-radius: 16px` が `.av-glass` の1箇所
- `tauri.conf.json` の `"radius": 16` が1箇所
- **3つのファイルの値がすべて 16 であること**

- [ ] **Step 3: 全テストと型検査とビルドを通す**

Run: `npx vitest run && npx tsc --noEmit && npm run build && cd src-tauri && cargo test && cd ..`
Expected: vitest 全 PASS / tsc エラーなし / build 成功 / cargo test 全 PASS

**この出力を実際に確認してから次へ進むこと。「通るはず」で先に進まない。**

- [ ] **Step 4: 手動スモークチェックリストを実施する**

Run: `npm run tauri dev`

設計書 11節のチェックリストを全項目実施する。

- [ ] ライトモード・黒い壁紙の上でレーン名（secondary）が読める
- [ ] ライトモード・白い壁紙でパレットの輪郭が背景に溶けていない
- [ ] ダークモード・白い壁紙の上でカードの文字が読める
- [ ] 派手な壁紙（彩度の高い写真）の上で色被りが許容範囲
- [ ] パレットの角丸が 16px で揃い、効果ビューがはみ出していない
- [ ] 影が丸角に沿っている
- [ ] 他アプリにフォーカスがある状態でパレットを出しても素材が灰色に濁らない
- [ ] ダークのシステムで起動時に白く光らない
- [ ] `data-vibrancy="off"` を手動で付けた状態で UI が読める
- [ ] 選択カードのリングが隣接カードと明確に分離して見える
- [ ] 意図しない枠線が出ていない

- [ ] **Step 5: 合成モデルの実測検証**

Task 3 の Step 8 で残したスクリーンショットから、ガラス面の実際のピクセル色を拾い、
設計書 5.6節の表（ライト・黒壁紙で `#DCDDDE` 等）と比較する。

**大きくズレていた場合**は、設計書 8節のコントラスト検証表を実測値で再計算し、
AA を割る前景色があれば `--av-text-*` の値を調整する。ズレが小さければそのままでよい。

判断結果を設計書 5.6節にコメントとして追記する（実測値と、調整の有無）。

- [ ] **Step 6: コミット**

```bash
git add -A
git commit -m "docs: ブランド設計書にAvoliqでのガラスの適用範囲を追記する

器はガラスにしてよく、内側の浮きものには使わないという解釈を明文化する。"
```

---

## 完了後

すべてのタスクが終わったら `superpowers:finishing-a-development-branch` スキルで統合方法を決める。
**push は承認制**なので、勝手に実行しないこと。
