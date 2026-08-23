# Avoliq ランディングページ 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `Avoliq/landing/` に、Apple の製品ページに倣った1ページ完結のダークなランディングページを作る。

**Architecture:** スクロール駆動の演出は「進捗値 `p`(0→1) を純粋関数でスタイルに変換する」という一本道に落とし込む。計算は `src/lib/motion.ts` に隔離してユニットテストで固め、React コンポーネントは値を受け取って描画するだけにする。01〜03 のセクションは1つの sticky ステージを共有し、パレットのモックは LP 全体で1インスタンスしか存在させない。

**Tech Stack:** Vite 7 / React 19 / TypeScript / Tailwind CSS v4 / Vitest（アニメーションライブラリは使わない）

**設計書:** `docs/superpowers/specs/2026-08-23-avoliq-landing-page-design.md`

---

## ファイル構成

| ファイル | 責務 |
| --- | --- |
| `landing/package.json` | LP 単体の依存とスクリプト（本体とは独立） |
| `landing/vite.config.ts` | Vite ＋ React ＋ Tailwind ＋ Vitest 設定 |
| `landing/tsconfig.json` | 型設定 |
| `landing/index.html` | メタ情報、OGP、`lang="ja"` |
| `landing/src/index.css` | 色トークン（`@theme`）とベーススタイル |
| `landing/src/main.tsx` | エントリ |
| `landing/src/App.tsx` | セクションの縦並び |
| `landing/src/lib/motion.ts` | **進捗 → スタイル値の純粋関数群**（テスト対象） |
| `landing/src/lib/motion.test.ts` | 上記のユニットテスト |
| `landing/src/hooks/useTrackProgress.ts` | sticky トラックの進捗を返す |
| `landing/src/hooks/useReveal.ts` | IntersectionObserver の一度きりフェードアップ |
| `landing/src/hooks/usePrefersReducedMotion.ts` | 動き低減の検出 |
| `landing/src/components/PaletteMock.tsx` | 抽象パレット（LP 全体で1インスタンス） |
| `landing/src/components/Keycap.tsx` | キーキャップ |
| `landing/src/components/Shot.tsx` | スクリーンショットの枠と影 |
| `landing/src/components/Reveal.tsx` | フェードアップの汎用ラッパー |
| `landing/src/sections/StickyStage.tsx` | 01〜03 を包み、進捗を配る |
| `landing/src/sections/Hero.tsx` | 01 |
| `landing/src/sections/Statement.tsx` | 02 |
| `landing/src/sections/KeyboardSection.tsx` | 03 |
| `landing/src/sections/FeatureSearch.tsx` | 04 |
| `landing/src/sections/FeatureBoard.tsx` | 05 |
| `landing/src/sections/FeatureLocal.tsx` | 06 |
| `landing/src/sections/FeatureGrid.tsx` | 07 |
| `landing/src/sections/DesignNotes.tsx` | 08 |
| `landing/src/sections/TechSpecs.tsx` | 09 |
| `landing/src/sections/Footer.tsx` | 10 |

`StickyStage` だけがスクロールを監視する。他のセクションは値を受け取るだけで、スクロールを直接見ない。

---

## Task 1: landing プロジェクトの骨格を作る

**Files:**
- Create: `landing/package.json`
- Create: `landing/vite.config.ts`
- Create: `landing/tsconfig.json`
- Create: `landing/index.html`
- Create: `landing/src/main.tsx`
- Create: `landing/src/App.tsx`
- Create: `landing/src/index.css`
- Create: `landing/src/vite-env.d.ts`
- Create: `landing/.gitignore`

- [ ] **Step 1: `landing/package.json` を作る**

```json
{
  "name": "avoliq-landing",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "react": "^19.1.0",
    "react-dom": "^19.1.0"
  },
  "devDependencies": {
    "@tailwindcss/vite": "^4.3.3",
    "@types/react": "^19.1.8",
    "@types/react-dom": "^19.1.6",
    "@vitejs/plugin-react": "^4.6.0",
    "jsdom": "^30.0.1",
    "tailwindcss": "^4.3.3",
    "typescript": "~5.8.3",
    "vite": "^7.0.4",
    "vitest": "^4.1.11"
  }
}
```

- [ ] **Step 2: `landing/vite.config.ts` を作る**

`base` は GitHub Pages のプロジェクトページ（`https://<user>.github.io/Avoliq/`）で配信する前提のため `/Avoliq/` にする。

```ts
/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  base: "/Avoliq/",
  plugins: [react(), tailwindcss()],
  test: {
    globals: false,
    environment: "jsdom",
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
  },
});
```

- [ ] **Step 3: `landing/tsconfig.json` を作る**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "types": ["vite/client"]
  },
  "include": ["src"]
}
```

- [ ] **Step 4: `landing/src/vite-env.d.ts` を作る**

```ts
/// <reference types="vite/client" />
```

- [ ] **Step 5: `landing/.gitignore` を作る**

```
node_modules
dist
*.local
```

- [ ] **Step 6: `landing/index.html` を作る**

OGP 画像は Task 15 で差し替える。ここでは参照だけ置く。

```html
<!doctype html>
<html lang="ja">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="color-scheme" content="dark" />
    <title>Avoliq — 直感的に、自然に思考を整え、次へ進める。</title>
    <meta
      name="description"
      content="macOS 向けの Spotlight 風タスクパレット。Alt + Space で開き、キーボードだけでタスクを片づける。データはすべてローカルに保存される。"
    />
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 7: `landing/src/index.css` を作る**

`source(none)` を付けて自動検出を切り、`@source "./"` で走査対象を `landing/src` に限定する。これをやらないと Tailwind が本体の `src/` まで走査してしまう。

```css
@import "tailwindcss" source(none);
@source "./";

@theme {
  --color-av-deep: #080b11;
  --color-av-bg: #0c1017;
  --color-av-surface: #10151f;
  --color-av-ink: #f1f4f8;
  --color-av-body: #afb6c1;
  --color-av-muted: #8b939f;
  --color-av-blue: #0a84ff;
  --color-av-azure: #66beff;
  --color-av-violet: #615eff;

  --ease-av: cubic-bezier(0.32, 0.72, 0, 1);
}

@layer base {
  html {
    color-scheme: dark;
    scroll-behavior: smooth;
  }

  body {
    background-color: var(--color-av-deep);
    color: var(--color-av-ink);
    font-family:
      -apple-system, BlinkMacSystemFont, "Segoe UI", "Hiragino Sans",
      "Noto Sans JP", "Helvetica Neue", Arial, sans-serif;
    /* 日本語の字間を詰める。Apple の日本語ページと同じ扱い */
    font-feature-settings: "palt";
    -webkit-font-smoothing: antialiased;
  }

  /* 動きを減らす設定のときは、演出を一切かけずに最終状態で静止させる */
  @media (prefers-reduced-motion: reduce) {
    html {
      scroll-behavior: auto;
    }
    *,
    *::before,
    *::after {
      animation-duration: 0.01ms !important;
      animation-iteration-count: 1 !important;
      transition-duration: 0.01ms !important;
    }
  }
}
```

- [ ] **Step 8: `landing/src/main.tsx` を作る**

```tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

- [ ] **Step 9: `landing/src/App.tsx` を仮で作る**

セクションは後続タスクで足す。この時点では骨組みだけ。

```tsx
export default function App() {
  return (
    <main className="bg-av-deep text-av-ink">
      <section className="flex min-h-screen items-center justify-center">
        <h1 className="text-6xl font-semibold tracking-tight">Avoliq</h1>
      </section>
    </main>
  );
}
```

- [ ] **Step 10: 依存をインストールしてビルドが通ることを確認する**

```bash
cd landing && npm install && npm run build
```

期待する結果: `tsc` がエラーを出さず、`dist/` が生成される。

- [ ] **Step 11: 本体のビルドが壊れていないことを確認する**

```bash
cd /Users/kei06/dev/Avoliq && npm run build
```

期待する結果: これまでと同じく成功する（`landing/` の追加は本体に影響しない）。

- [ ] **Step 12: コミット**

```bash
cd /Users/kei06/dev/Avoliq
git add landing docs/superpowers/plans/2026-08-23-avoliq-landing-page.md
git commit -m "feat: ランディングページ用のViteプロジェクトを追加"
```

---

## Task 2: モーション計算モジュール（テストから書く）

スクロール進捗からスタイル値を導く計算をすべてここに閉じ込める。React に依存しない純粋関数なので、テストで挙動を固定できる。

**Files:**
- Create: `landing/src/lib/motion.ts`
- Test: `landing/src/lib/motion.test.ts`

- [ ] **Step 1: 失敗するテストを書く**

`landing/src/lib/motion.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  clamp,
  demoState,
  range,
  stageState,
  trackProgress,
} from "./motion";

describe("clamp", () => {
  it("範囲内はそのまま返す", () => {
    expect(clamp(0.5, 0, 1)).toBe(0.5);
  });

  it("範囲外は端に丸める", () => {
    expect(clamp(-3, 0, 1)).toBe(0);
    expect(clamp(9, 0, 1)).toBe(1);
  });
});

describe("range", () => {
  it("区間の始点で0、終点で1になる", () => {
    expect(range(0.2, 0.2, 0.4)).toBe(0);
    expect(range(0.4, 0.2, 0.4)).toBe(1);
  });

  it("区間の中央で0.5になる", () => {
    expect(range(0.3, 0.2, 0.4)).toBeCloseTo(0.5);
  });

  it("区間外は0または1に丸める", () => {
    expect(range(0, 0.2, 0.4)).toBe(0);
    expect(range(1, 0.2, 0.4)).toBe(1);
  });

  it("幅ゼロの区間でもNaNを返さない", () => {
    expect(range(0.5, 0.3, 0.3)).toBe(1);
    expect(range(0.1, 0.3, 0.3)).toBe(0);
  });
});

describe("trackProgress", () => {
  it("トラックの先頭で0、末尾で1になる", () => {
    // トラック高さ3000、ビューポート600 → 移動量2400
    expect(trackProgress(0, 0, 3000, 600)).toBe(0);
    expect(trackProgress(2400, 0, 3000, 600)).toBe(1);
  });

  it("トラックの開始位置を差し引く", () => {
    expect(trackProgress(1200, 1200, 3000, 600)).toBe(0);
    expect(trackProgress(2400, 1200, 3000, 600)).toBeCloseTo(0.5);
  });

  it("トラックがビューポートより低いときは0を返す", () => {
    expect(trackProgress(100, 0, 400, 600)).toBe(0);
  });
});

describe("stageState", () => {
  it("先頭ではパレットがぼけて縮んでいる", () => {
    const s = stageState(0);
    expect(s.palette.blur).toBeGreaterThan(6);
    expect(s.palette.scale).toBeLessThan(1);
    expect(s.palette.opacity).toBe(0);
  });

  it("開き終えた直後はぼけが取れて等倍になる", () => {
    const s = stageState(0.12);
    expect(s.palette.blur).toBeCloseTo(0, 1);
    expect(s.palette.scale).toBeCloseTo(1, 2);
    expect(s.palette.opacity).toBeCloseTo(1, 2);
  });

  it("Statement区間ではパレットが縮んで減光する", () => {
    const open = stageState(0.12);
    const back = stageState(0.3);
    expect(back.palette.scale).toBeLessThan(open.palette.scale);
    expect(back.palette.opacity).toBeLessThan(open.palette.opacity);
    expect(back.statement.opacity).toBe(1);
  });

  it("Keyboard区間ではパレットが拡大して戻る", () => {
    const back = stageState(0.3);
    const fore = stageState(0.48);
    expect(fore.palette.scale).toBeGreaterThan(back.palette.scale);
    expect(fore.palette.opacity).toBeGreaterThan(back.palette.opacity);
    expect(fore.keyboard.opacity).toBe(1);
  });

  it("Heroのテキストは開いた直後に出て、Statementの前に消える", () => {
    expect(stageState(0.1).hero.opacity).toBeCloseTo(1, 2);
    expect(stageState(0.2).hero.opacity).toBe(0);
  });

  it("実演の進捗は0.50から始まり0.92で終わる", () => {
    expect(stageState(0.49).demo).toBe(0);
    expect(stageState(0.92).demo).toBe(1);
    expect(stageState(1).demo).toBe(1);
  });

  it("不透明度は常に0以上1以下に収まる", () => {
    for (let p = 0; p <= 1.0001; p += 0.01) {
      const s = stageState(p);
      for (const v of [
        s.palette.opacity,
        s.glowOpacity,
        s.hero.opacity,
        s.statement.opacity,
        s.keyboard.opacity,
      ]) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
      }
    }
  });
});

describe("demoState", () => {
  it("実演が始まる前は何も光らず、何も選ばれていない", () => {
    const d = demoState(0);
    expect(d.litKey).toBe(-1);
    expect(d.selectedCard).toBe(-1);
    expect(d.chipOn).toBe(false);
    expect(d.cardMoved).toBe(false);
  });

  it("キーが順番に光る", () => {
    expect(demoState(0.05).litKey).toBe(0);
    expect(demoState(0.3).litKey).toBe(1);
    expect(demoState(0.5).litKey).toBe(2);
    expect(demoState(0.7).litKey).toBe(3);
  });

  it("選択枠が上から順に移る", () => {
    expect(demoState(0.1).selectedCard).toBe(0);
    expect(demoState(0.3).selectedCard).toBe(1);
    expect(demoState(0.5).selectedCard).toBe(2);
  });

  it("タグが付いたあとにカードが移動する", () => {
    expect(demoState(0.55).chipOn).toBe(true);
    expect(demoState(0.55).cardMoved).toBe(false);
    expect(demoState(0.8).cardMoved).toBe(true);
  });
});
```

- [ ] **Step 2: テストを実行して失敗を確認する**

```bash
cd landing && npm test
```

期待する結果: FAIL。`Failed to resolve import "./motion"` が出る。

- [ ] **Step 3: `landing/src/lib/motion.ts` を実装する**

```ts
/**
 * スクロール進捗（0→1）から演出用のスタイル値を導く純粋関数群。
 * React には依存させない。ここを固めておけば、見た目の調整が数値の調整だけで済む。
 *
 * 設計書: docs/superpowers/specs/2026-08-23-avoliq-landing-page-design.md
 */

/** アプリ本体と揃えた減速カーブ */
export const EASE = "cubic-bezier(0.32, 0.72, 0, 1)";

export function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

/** p を区間 [a, b] の中で 0→1 に正規化する。区間外は端に丸める */
export function range(p: number, a: number, b: number): number {
  if (b === a) return p >= b ? 1 : 0;
  return clamp((p - a) / (b - a), 0, 1);
}

/**
 * sticky トラックのスクロール進捗を返す。
 * トラックがビューポートより低い場合は進捗を持てないので 0 を返す。
 */
export function trackProgress(
  scrollY: number,
  trackTop: number,
  trackHeight: number,
  viewportHeight: number,
): number {
  const travel = trackHeight - viewportHeight;
  if (travel <= 0) return 0;
  return clamp((scrollY - trackTop) / travel, 0, 1);
}

export interface PaletteStyle {
  /** px。下方向が正 */
  y: number;
  scale: number;
  /** px */
  blur: number;
  opacity: number;
}

export interface StageState {
  palette: PaletteStyle;
  glowOpacity: number;
  hero: { opacity: number; y: number };
  statement: { opacity: number; y: number };
  keyboard: { opacity: number };
  /** 操作実演のタイムライン 0→1 */
  demo: number;
}

export function stageState(p: number): StageState {
  // 01 開く / 02 背景へ退く / 03 前へ出る
  const open = range(p, 0.0, 0.1);
  const back = range(p, 0.16, 0.3);
  const fore = range(p, 0.36, 0.48);

  return {
    palette: {
      y: (24 - 24 * open) + 70 * back - 64 * fore,
      scale: (0.92 + 0.08 * open) * (1 - 0.3 * back) * (1 + 0.34 * fore),
      blur: (1 - open) * 12 + back * (1 - fore) * 3,
      opacity: clamp(open * (1 - 0.45 * back * (1 - fore)), 0, 1),
    },
    glowOpacity: clamp(
      0.35 + 0.35 * open + 0.3 * fore - 0.25 * back * (1 - fore),
      0,
      1,
    ),
    hero: {
      opacity: clamp(open * (1 - range(p, 0.12, 0.2)), 0, 1),
      y: -40 * range(p, 0.12, 0.22),
    },
    statement: {
      opacity: clamp(range(p, 0.17, 0.24) * (1 - range(p, 0.31, 0.38)), 0, 1),
      y: 20 * (1 - range(p, 0.17, 0.26)),
    },
    keyboard: {
      opacity: range(p, 0.37, 0.44),
    },
    demo: range(p, 0.5, 0.92),
  };
}

export interface DemoState {
  /** 光っているキーの添字。光っていなければ -1 */
  litKey: number;
  /** 選択枠が乗っているカードの添字。乗っていなければ -1 */
  selectedCard: number;
  chipOn: boolean;
  cardMoved: boolean;
}

/** 実演の進捗 d(0→1) を、パレット内で起きる出来事に変換する */
export function demoState(d: number): DemoState {
  if (d <= 0) {
    return { litKey: -1, selectedCard: -1, chipOn: false, cardMoved: false };
  }

  let litKey = -1;
  for (let i = 0; i < 4; i += 1) {
    const from = i * 0.22;
    if (d >= from && d < from + 0.24) {
      litKey = i;
      break;
    }
  }

  let selectedCard = -1;
  if (d < 0.24) selectedCard = 0;
  else if (d < 0.46) selectedCard = 1;
  else selectedCard = 2;

  return {
    litKey,
    selectedCard,
    chipOn: d >= 0.52,
    cardMoved: d >= 0.74,
  };
}
```

- [ ] **Step 4: テストを実行して通ることを確認する**

```bash
cd landing && npm test
```

期待する結果: PASS（`motion.test.ts` の全ケースが緑）。

- [ ] **Step 5: コミット**

```bash
cd /Users/kei06/dev/Avoliq
git add landing/src/lib
git commit -m "feat: スクロール進捗から演出値を導く計算モジュールを追加"
```

---

## Task 3: スクロール系フックを作る

**Files:**
- Create: `landing/src/hooks/usePrefersReducedMotion.ts`
- Create: `landing/src/hooks/useTrackProgress.ts`
- Create: `landing/src/hooks/useReveal.ts`
- Test: `landing/src/hooks/usePrefersReducedMotion.test.ts`

- [ ] **Step 1: テスト用の依存を追加する**

```bash
cd landing && npm install -D @testing-library/react@^16.3.2 @testing-library/dom@^10.4.1
```

- [ ] **Step 2: 失敗するテストを書く**

`landing/src/hooks/usePrefersReducedMotion.test.ts`:

```ts
import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { usePrefersReducedMotion } from "./usePrefersReducedMotion";

function mockMatchMedia(matches: boolean) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockImplementation((query: string) => ({
      matches,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("usePrefersReducedMotion", () => {
  it("動き低減が有効なら true を返す", () => {
    mockMatchMedia(true);
    const { result } = renderHook(() => usePrefersReducedMotion());
    expect(result.current).toBe(true);
  });

  it("動き低減が無効なら false を返す", () => {
    mockMatchMedia(false);
    const { result } = renderHook(() => usePrefersReducedMotion());
    expect(result.current).toBe(false);
  });
});
```

- [ ] **Step 3: テストを実行して失敗を確認する**

```bash
cd landing && npm test
```

期待する結果: FAIL。`Failed to resolve import "./usePrefersReducedMotion"` が出る。

- [ ] **Step 4: `landing/src/hooks/usePrefersReducedMotion.ts` を実装する**

```ts
import { useEffect, useState } from "react";

const QUERY = "(prefers-reduced-motion: reduce)";

/** OS の「視差効果を減らす」設定を見て、演出を切るかどうかを返す */
export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia(QUERY).matches;
  });

  useEffect(() => {
    const mql = window.matchMedia(QUERY);
    const onChange = (e: MediaQueryListEvent) => setReduced(e.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  return reduced;
}
```

- [ ] **Step 5: テストを実行して通ることを確認する**

```bash
cd landing && npm test
```

期待する結果: PASS。

- [ ] **Step 6: `landing/src/hooks/useTrackProgress.ts` を実装する**

スクロールの監視はこのフックだけが行う。`requestAnimationFrame` で束ね、`passive: true` で登録する。

```ts
import { useEffect, useRef, useState, type RefObject } from "react";
import { trackProgress } from "../lib/motion";

/**
 * 対象要素（sticky トラック）のスクロール進捗 0→1 を返す。
 * disabled が true のときは計算せず、常に終端の 1 を返す。
 * これは動き低減時に「最終状態で静止させる」ための逃げ道になっている。
 */
export function useTrackProgress(
  ref: RefObject<HTMLElement | null>,
  disabled = false,
): number {
  const [progress, setProgress] = useState(disabled ? 1 : 0);
  const frame = useRef(0);

  useEffect(() => {
    if (disabled) {
      setProgress(1);
      return;
    }

    const measure = () => {
      const el = ref.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      // 文書先頭からのトラック上端。offsetTop は offsetParent 依存で壊れやすいので使わない
      const top = rect.top + window.scrollY;
      setProgress(
        trackProgress(window.scrollY, top, rect.height, window.innerHeight),
      );
    };

    const onScroll = () => {
      cancelAnimationFrame(frame.current);
      frame.current = requestAnimationFrame(measure);
    };

    measure();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      cancelAnimationFrame(frame.current);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [ref, disabled]);

  return progress;
}
```

- [ ] **Step 7: `landing/src/hooks/useReveal.ts` を実装する**

```ts
import { useEffect, useRef, useState, type RefObject } from "react";

/**
 * 要素が画面に入ったら一度だけ true になる。以降は監視を外す。
 * 04 以降のセクションのフェードアップに使う。
 */
export function useReveal<T extends HTMLElement>(): [RefObject<T | null>, boolean] {
  const ref = useRef<T>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setShown(true);
            io.unobserve(entry.target);
          }
        }
      },
      { threshold: 0.2, rootMargin: "0px 0px -10% 0px" },
    );

    io.observe(el);
    return () => io.disconnect();
  }, []);

  return [ref, shown];
}
```

- [ ] **Step 8: 型チェックが通ることを確認する**

```bash
cd landing && npx tsc --noEmit
```

期待する結果: エラーなし。

- [ ] **Step 9: コミット**

```bash
cd /Users/kei06/dev/Avoliq
git add landing/src/hooks landing/package.json landing/package-lock.json
git commit -m "feat: スクロール進捗と表示検知のフックを追加"
```

---

## Task 4: 抽象パレットのモックを作る

LP 全体で1インスタンスしか存在しないコンポーネント。実演の状態を props で受け取るだけで、自分ではスクロールを見ない。

**Files:**
- Create: `landing/src/components/PaletteMock.tsx`
- Create: `landing/src/components/Keycap.tsx`

- [ ] **Step 1: `landing/src/components/Keycap.tsx` を作る**

```tsx
interface KeycapProps {
  label: string;
  lit: boolean;
}

export function Keycap({ label, lit }: KeycapProps) {
  return (
    <span
      className={[
        "rounded-lg border px-3.5 py-2 text-sm transition-[background-color,border-color,transform] duration-200 ease-av",
        lit
          ? "-translate-y-0.5 border-av-azure/60 bg-av-blue/30"
          : "border-white/15 bg-white/[0.07]",
      ].join(" ")}
    >
      {label}
    </span>
  );
}
```

- [ ] **Step 2: `landing/src/components/PaletteMock.tsx` を作る**

カードの配列とレーンは定数として持つ。`selectedCard` は Inbox の1枚目・2枚目・Doing の1枚目を 0/1/2 で指す。

```tsx
import type { ReactNode } from "react";
import type { DemoState } from "../lib/motion";

const INBOX = ["LPの構成を決める", "配色トークンを整理"];
const DOING = ["ヒーローを実装する"];
const DONE = ["ブランド資産を作る", "タグ機能"];

interface PaletteMockProps {
  demo: DemoState;
}

function Card({
  label,
  selected,
  children,
  className = "",
}: {
  label: string;
  selected: boolean;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={[
        "relative flex h-8 items-center rounded-md px-2.5 text-[11px] text-av-body",
        "transition-[background-color,box-shadow,transform] duration-500 ease-av",
        selected
          ? "bg-av-blue/30 shadow-[0_0_0_1px_var(--color-av-azure)]"
          : "bg-white/10",
        className,
      ].join(" ")}
    >
      <span className="truncate">{label}</span>
      {children}
    </div>
  );
}

function Lane({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex flex-1 flex-col gap-1.5">
      <div className="text-[9px] uppercase tracking-[0.09em] text-av-muted">
        {title}
      </div>
      {children}
    </div>
  );
}

export function PaletteMock({ demo }: PaletteMockProps) {
  return (
    <div
      className={[
        "w-[min(92vw,460px)] rounded-2xl border border-white/[0.13] p-3",
        "bg-[#141a23]/70 backdrop-blur-2xl",
        "shadow-[0_34px_80px_rgba(0,0,0,0.7),inset_0_1px_0_rgba(255,255,255,0.16)]",
      ].join(" ")}
    >
      <div className="flex h-7 items-center rounded-lg bg-white/[0.08] px-2.5 text-[11px] text-av-muted">
        タスクを検索、または入力して作成
      </div>

      <div className="mt-2.5 flex gap-2">
        <Lane title="Inbox">
          <Card label={INBOX[0]} selected={demo.selectedCard === 0} />
          <Card label={INBOX[1]} selected={demo.selectedCard === 1} />
        </Lane>

        <Lane title="Doing">
          <Card
            label={DOING[0]}
            selected={demo.selectedCard === 2}
            className={demo.cardMoved ? "translate-x-[104%]" : ""}
          >
            <span
              className={[
                "absolute right-2 h-3 w-7 rounded bg-av-azure/45",
                "transition-[opacity,transform] duration-300 ease-av",
                demo.chipOn ? "scale-100 opacity-100" : "scale-50 opacity-0",
              ].join(" ")}
            />
          </Card>
        </Lane>

        <Lane title="Done">
          <Card label={DONE[0]} selected={false} />
          <Card label={DONE[1]} selected={false} />
        </Lane>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: 型チェックが通ることを確認する**

```bash
cd landing && npx tsc --noEmit
```

期待する結果: エラーなし。

- [ ] **Step 4: コミット**

```bash
cd /Users/kei06/dev/Avoliq
git add landing/src/components
git commit -m "feat: 抽象パレットのモックとキーキャップを追加"
```

---

## Task 5: sticky ステージと Hero を組む

**Files:**
- Create: `landing/src/sections/Hero.tsx`
- Create: `landing/src/sections/StickyStage.tsx`
- Modify: `landing/src/App.tsx`

- [ ] **Step 1: `landing/src/sections/Hero.tsx` を作る**

```tsx
interface HeroProps {
  opacity: number;
  y: number;
}

export function Hero({ opacity, y }: HeroProps) {
  return (
    <div
      className="pointer-events-none absolute inset-x-0 top-[14vh] px-6 text-center"
      style={{ opacity, transform: `translateY(${y}px)` }}
    >
      <div className="text-[11px] uppercase tracking-[0.14em] text-av-azure">
        for macOS
      </div>
      <h1 className="mt-3 text-[clamp(3rem,9vw,4.5rem)] font-semibold leading-none tracking-[-0.03em]">
        Avoliq
      </h1>
      <p className="mt-4 text-[clamp(1rem,2.4vw,1.25rem)] font-medium tracking-[-0.01em]">
        直感的に、自然に思考を整え、次へ進める。
      </p>
      <p className="mx-auto mt-3.5 max-w-[34rem] text-sm leading-[1.9] text-av-body">
        Alt + Space。画面の中央にパレットが開いて、キーボードだけでタスクが片づく。
        <br className="hidden sm:inline" />
        用が済んだら Esc で消える。
      </p>
      <div className="pointer-events-auto mt-7 flex justify-center gap-2.5">
        <a
          href="https://github.com/Keisuke-MARs/Avoliq"
          className="rounded-full bg-av-blue px-5 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-85"
        >
          GitHub で見る
        </a>
        <a
          href="#design-notes"
          className="rounded-full border border-white/20 px-5 py-2.5 text-sm transition-colors hover:bg-white/10"
        >
          設計を読む
        </a>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: `landing/src/sections/StickyStage.tsx` を作る**

トラック高さは `400vh`。ビューポート1つ分を引いた `300vh` が進捗0→1に対応する。

```tsx
import { useRef } from "react";
import { PaletteMock } from "../components/PaletteMock";
import { useTrackProgress } from "../hooks/useTrackProgress";
import { usePrefersReducedMotion } from "../hooks/usePrefersReducedMotion";
import { demoState, stageState } from "../lib/motion";
import { Hero } from "./Hero";

export function StickyStage() {
  const trackRef = useRef<HTMLDivElement>(null);
  const reduced = usePrefersReducedMotion();
  const p = useTrackProgress(trackRef, reduced);
  const s = stageState(p);
  const demo = demoState(s.demo);

  return (
    <div ref={trackRef} className="relative h-[400vh]">
      <div className="sticky top-0 flex h-screen items-center justify-center overflow-hidden">
        {/* 背後の発光 */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            opacity: s.glowOpacity,
            background:
              "radial-gradient(60% 70% at 50% 78%, rgba(10,132,255,0.34), transparent 62%), radial-gradient(50% 70% at 12% 0%, rgba(97,94,255,0.22), transparent 62%)",
          }}
        />

        <div
          style={{
            opacity: s.palette.opacity,
            filter: `blur(${s.palette.blur}px)`,
            transform: `translateY(${s.palette.y}px) scale(${s.palette.scale})`,
            willChange: "transform, opacity, filter",
          }}
        >
          <PaletteMock demo={demo} />
        </div>

        <Hero opacity={s.hero.opacity} y={s.hero.y} />
      </div>
    </div>
  );
}
```

- [ ] **Step 3: `landing/src/App.tsx` を書き換える**

```tsx
import { StickyStage } from "./sections/StickyStage";

export default function App() {
  return (
    <main className="bg-av-deep text-av-ink">
      <StickyStage />
    </main>
  );
}
```

- [ ] **Step 4: ブラウザで確認する**

```bash
cd landing && npm run dev
```

`http://localhost:5173/Avoliq/` を開き、次を目視で確認する。

- ページ先頭でパレットがぼけており、少しスクロールすると鮮明になって等倍で止まる
- Hero のテキストがパレットと同時に現れ、さらにスクロールすると上へ抜ける
- コンソールにエラーが出ていない

- [ ] **Step 5: ビルドが通ることを確認する**

```bash
cd landing && npm run build
```

期待する結果: 成功。

- [ ] **Step 6: コミット**

```bash
cd /Users/kei06/dev/Avoliq
git add landing/src
git commit -m "feat: ヒーローとスクロール連動のステージを実装"
```

---

## Task 6: Statement と Keyboard を同じステージに載せる

**Files:**
- Create: `landing/src/sections/Statement.tsx`
- Create: `landing/src/sections/KeyboardSection.tsx`
- Modify: `landing/src/sections/StickyStage.tsx`

- [ ] **Step 1: `landing/src/sections/Statement.tsx` を作る**

```tsx
interface StatementProps {
  opacity: number;
  y: number;
}

export function Statement({ opacity, y }: StatementProps) {
  return (
    <div
      className="pointer-events-none absolute inset-x-0 top-[26vh] px-6 text-center"
      style={{ opacity, transform: `translateY(${y}px)` }}
    >
      <h2 className="mx-auto max-w-[40rem] text-[clamp(1.75rem,5vw,2.5rem)] font-semibold leading-[1.4] tracking-[-0.03em]">
        タスクを増やさない。
        <br />
        迷いを減らす。
      </h2>
      <p className="mx-auto mt-5 max-w-[35rem] text-sm leading-[2] text-av-body">
        管理するために書くのではなく、次の一歩を選ぶために書く。
        <br className="hidden sm:inline" />
        だから Avoliq には、溜めるための機能がありません。
      </p>
    </div>
  );
}
```

- [ ] **Step 2: `landing/src/sections/KeyboardSection.tsx` を作る**

```tsx
import { Keycap } from "../components/Keycap";

const KEYS = ["↓", "↓", "⌘K", "⌘→"];

interface KeyboardSectionProps {
  opacity: number;
  litKey: number;
}

export function KeyboardSection({ opacity, litKey }: KeyboardSectionProps) {
  return (
    <div className="pointer-events-none absolute inset-0" style={{ opacity }}>
      <div className="absolute inset-x-0 top-[10vh] px-6 text-center">
        <div className="text-[11px] uppercase tracking-[0.14em] text-av-azure">
          Keyboard
        </div>
        <h2 className="mt-3 text-[clamp(1.6rem,4.4vw,2.25rem)] font-semibold tracking-[-0.03em]">
          手は、ホームポジションから離れない。
        </h2>
        <p className="mx-auto mt-3.5 max-w-[33rem] text-sm leading-[1.9] text-av-body">
          矢印で選び、⌘K でタグを付け、⌘→ で次のステータスへ。
          <br className="hidden sm:inline" />
          マウスに持ち替える瞬間が、そもそも要りません。
        </p>
      </div>

      <div className="absolute inset-x-0 bottom-[10vh] flex justify-center gap-2">
        {KEYS.map((k, i) => (
          <Keycap key={`${k}-${i}`} label={k} lit={litKey === i} />
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: `StickyStage.tsx` に2つを差し込む**

`import { Hero } from "./Hero";` の下に次を足す。

```tsx
import { KeyboardSection } from "./KeyboardSection";
import { Statement } from "./Statement";
```

`<Hero ... />` の直後に次を足す。

```tsx
        <Statement opacity={s.statement.opacity} y={s.statement.y} />
        <KeyboardSection opacity={s.keyboard.opacity} litKey={demo.litKey} />
```

- [ ] **Step 4: ブラウザで通しで確認する**

```bash
cd landing && npm run dev
```

`http://localhost:5173/Avoliq/` をゆっくりスクロールし、次の順で起きることを確認する。

1. パレットが開く
2. Hero が上へ抜け、パレットが縮んで背景へ退き、Statement が出る
3. Statement が消え、パレットが拡大して前へ出て、Keyboard の見出しとキーが出る
4. キーが順に光り、選択枠が移動し、タグが付き、カードが右のレーンへ移る

- [ ] **Step 5: コミット**

```bash
cd /Users/kei06/dev/Avoliq
git add landing/src/sections
git commit -m "feat: 思想セクションとキーボード実演をステージに追加"
```

---

## Task 7: 動き低減時のフォールバックを整える

`useTrackProgress` は動き低減時に進捗を常に 1 にするが、それだと Hero と Statement が消えたままになってしまう。動き低減時は sticky をやめ、3セクションを普通に縦へ並べる。

**Files:**
- Modify: `landing/src/sections/StickyStage.tsx`

- [ ] **Step 1: `StickyStage.tsx` に静止版の分岐を足す**

`export function StickyStage() {` の中、`const demo = demoState(s.demo);` の直後に次を挿入する。

```tsx
  // 動きを減らす設定のときは、演出をやめて3セクションを普通に縦へ並べる。
  // 進捗に依存する表示が全部消えてしまい、情報が欠けるのを防ぐため。
  if (reduced) {
    return (
      <div>
        {/* Hero / Statement / KeyboardSection は absolute で置かれる作りなので、
            それぞれを relative min-h-screen のセクションで受けて位置を成立させる */}
        <section className="relative min-h-screen">
          <Hero opacity={1} y={0} />
        </section>
        <section className="relative min-h-screen">
          <Statement opacity={1} y={0} />
        </section>
        <section className="relative min-h-screen">
          <div className="absolute inset-x-0 top-1/2 flex -translate-y-1/2 justify-center px-6">
            {/* 実演の途中経過（タグが付いた状態）で静止させる。
                終端(1)にするとカードが移動後の位置で止まり、文脈なしでは意味が読めない */}
            <PaletteMock demo={demoState(0.6)} />
          </div>
          <KeyboardSection opacity={1} litKey={-1} />
        </section>
      </div>
    );
  }
```

- [ ] **Step 2: 動き低減を有効にして確認する**

macOS の「システム設定 → アクセシビリティ → ディスプレイ → 視差効果を減らす」を有効にしてページを再読み込みする。
または Chrome DevTools の Rendering パネルで `prefers-reduced-motion: reduce` をエミュレートする。

確認すること:

- Hero・Statement・Keyboard のテキストがすべて読める
- パレットが1つ表示されており、ぼけていない
- スクロールしても要素が動かない

- [ ] **Step 3: 設定を元に戻し、通常表示が壊れていないことを確認する**

- [ ] **Step 4: コミット**

```bash
cd /Users/kei06/dev/Avoliq
git add landing/src/sections/StickyStage.tsx
git commit -m "feat: 動き低減時は演出をやめて縦並びにする"
```

---

## Task 8: スクリーンショットを撮る

**Files:**
- Create: `landing/public/shots/search.png`
- Create: `landing/public/shots/board.png`

- [ ] **Step 1: 撮影用にデスクトップを整える**

パレットは半透明で背後が写り込むため、無地の暗い背景を敷く。

```bash
# 単色の壁紙を作って一時的に設定する
cd /Users/kei06/dev/Avoliq
mkdir -p /tmp/avoliq-shot
```

デスクトップに他アプリのウィンドウが写り込まないよう、最前面のウィンドウをすべて隠す。

- [ ] **Step 2: 本体をダークモードで起動する**

```bash
cd /Users/kei06/dev/Avoliq && npm run tauri dev
```

デバッグビルドが残っているため増分ビルドで済む。macOS の外観をダークにしておく。

- [ ] **Step 3: 撮りたい状態を作る**

`Alt + Space` でパレットを開き、次の2つの状態を作る。

1. **検索即作成**: 検索欄に未登録の文字列を打ち、「Enter で作成」の状態が見えている
2. **ボードとタグ**: カードにタグが付いており、レーンが3つ並んでいる

タスクは実際の内容にする。空のボードや `test` のようなダミーは避ける。

- [ ] **Step 4: ウィンドウを撮影する**

`computer-use` skill でウィンドウ単位のスクリーンショットを取得する。取得できない場合は全画面を撮ってから切り出す。

```bash
# 全画面を撮る（シャッター音とカーソルなし）
screencapture -x -o /tmp/avoliq-shot/full.png
# 寸法を確認する
sips -g pixelWidth -g pixelHeight /tmp/avoliq-shot/full.png
```

パレットの位置を確認して切り出す。`X Y` は左上座標、`W H` は幅と高さ。

```bash
# 例: 左上(1200,800) から 1600x1000 を切り出す。実測値に置き換えること
sips -c 1000 1600 --cropOffset 800 1200 /tmp/avoliq-shot/full.png \
  --out landing/public/shots/search.png
```

- [ ] **Step 5: 撮れた画像を目視で確認する**

確認すること:

- パレットの四辺に余白があり、切れていない
- 背後に他アプリのウィンドウや個人情報が写っていない
- Retina 解像度（実寸の2倍）になっている

**綺麗に撮れない場合:** 実スクリーンショットを諦め、`Shot.tsx` の中に HTML/CSS で UI を再現する。その場合はウィンドウの枠・影・データ量で抽象パレットと差をつける（設計書 7章の代替案）。

- [ ] **Step 6: 本体を終了し、壁紙とデスクトップの設定を元に戻す**

- [ ] **Step 7: コミット**

```bash
cd /Users/kei06/dev/Avoliq
git add landing/public/shots
git commit -m "chore: LP用のスクリーンショットを追加"
```

---

## Task 9: 機能セクション 01・02 を作る

**Files:**
- Create: `landing/src/components/Reveal.tsx`
- Create: `landing/src/components/Shot.tsx`
- Create: `landing/src/sections/FeatureSearch.tsx`
- Create: `landing/src/sections/FeatureBoard.tsx`
- Modify: `landing/src/App.tsx`

- [ ] **Step 1: `landing/src/components/Reveal.tsx` を作る**

```tsx
import type { ReactNode } from "react";
import { useReveal } from "../hooks/useReveal";

interface RevealProps {
  children: ReactNode;
  /** 秒。複数要素をずらして出すときに使う */
  delay?: number;
  className?: string;
}

export function Reveal({ children, delay = 0, className = "" }: RevealProps) {
  const [ref, shown] = useReveal<HTMLDivElement>();

  return (
    <div
      ref={ref}
      className={[
        "transition-[opacity,transform] duration-700 ease-av motion-reduce:transition-none",
        shown ? "translate-y-0 opacity-100" : "translate-y-[18px] opacity-0",
        "motion-reduce:translate-y-0 motion-reduce:opacity-100",
        className,
      ].join(" ")}
      style={{ transitionDelay: `${delay}s` }}
    >
      {children}
    </div>
  );
}
```

- [ ] **Step 2: `landing/src/components/Shot.tsx` を作る**

```tsx
interface ShotProps {
  src: string;
  alt: string;
}

export function Shot({ src, alt }: ShotProps) {
  return (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      decoding="async"
      className="w-full rounded-2xl border border-white/10 shadow-[0_40px_90px_rgba(0,0,0,0.6)]"
    />
  );
}
```

- [ ] **Step 3: `landing/src/sections/FeatureSearch.tsx` を作る**

```tsx
import { Reveal } from "../components/Reveal";
import { Shot } from "../components/Shot";

export function FeatureSearch() {
  return (
    <section className="bg-av-surface px-6 py-28">
      <div className="mx-auto max-w-[64rem]">
        <Reveal>
          <div className="text-[11px] uppercase tracking-[0.14em] text-av-azure">
            Capture
          </div>
          <h2 className="mt-3 max-w-[28rem] text-[clamp(1.6rem,4vw,2.25rem)] font-semibold leading-[1.45] tracking-[-0.03em]">
            その場で検索、
            <br />
            その場で作成。
          </h2>
          <p className="mt-4 max-w-[32rem] text-sm leading-[1.95] text-av-body">
            検索欄に打った文字が、そのままタスク名になります。
            探して見つからなければ、Enter を押すだけでそれが新しいタスクになる。
            「あとで書こう」と思って忘れる余地がありません。
          </p>
        </Reveal>

        <Reveal delay={0.08} className="mt-12">
          <Shot
            src={`${import.meta.env.BASE_URL}shots/search.png`}
            alt="検索欄に入力した文字列がそのまま新規タスクの候補として表示されている画面"
          />
        </Reveal>
      </div>
    </section>
  );
}
```

- [ ] **Step 4: `landing/src/sections/FeatureBoard.tsx` を作る**

```tsx
import { Reveal } from "../components/Reveal";
import { Shot } from "../components/Shot";

export function FeatureBoard() {
  return (
    <section className="bg-av-surface px-6 pb-28">
      <div className="mx-auto max-w-[64rem]">
        <Reveal>
          <div className="text-[11px] uppercase tracking-[0.14em] text-av-azure">
            Organize
          </div>
          <h2 className="mt-3 max-w-[28rem] text-[clamp(1.6rem,4vw,2.25rem)] font-semibold leading-[1.45] tracking-[-0.03em]">
            ボードとタグで、
            <br />
            並べ替えずに整える。
          </h2>
          <p className="mt-4 max-w-[32rem] text-sm leading-[1.95] text-av-body">
            ステータスごとにレーンが並び、⌘K でタグを付け外しします。
            検索欄に # と打てば候補が出て、そのまま絞り込めます。
            レーンの名前も色も並び順も、あとから変えられます。
          </p>
        </Reveal>

        <Reveal delay={0.08} className="mt-12">
          <Shot
            src={`${import.meta.env.BASE_URL}shots/board.png`}
            alt="3つのレーンにカードが並び、カードにタグが付いているボード画面"
          />
        </Reveal>
      </div>
    </section>
  );
}
```

- [ ] **Step 5: `landing/src/App.tsx` に追加する**

```tsx
import { FeatureBoard } from "./sections/FeatureBoard";
import { FeatureSearch } from "./sections/FeatureSearch";
import { StickyStage } from "./sections/StickyStage";

export default function App() {
  return (
    <main className="bg-av-deep text-av-ink">
      <StickyStage />
      <FeatureSearch />
      <FeatureBoard />
    </main>
  );
}
```

- [ ] **Step 6: ブラウザで確認する**

スクロールして、2つの機能セクションが下からふわっと現れることと、画像が読み込まれることを確認する。

- [ ] **Step 7: コミット**

```bash
cd /Users/kei06/dev/Avoliq
git add landing/src
git commit -m "feat: 機能セクション(検索即作成・ボードとタグ)を追加"
```

---

## Task 10: 機能セクション 03「ローカル完結」の帯を作る

対応する画面が存在しないため、スクリーンショットではなく大タイポと図で見せる。ここでページのリズムを変える。

**Files:**
- Create: `landing/src/sections/FeatureLocal.tsx`
- Modify: `landing/src/App.tsx`

- [ ] **Step 1: `landing/src/sections/FeatureLocal.tsx` を作る**

```tsx
import { Reveal } from "../components/Reveal";

const FACTS = [
  {
    head: "ファイル1つ",
    body: "~/Library/Application Support/Avoliq/avoliq.db",
  },
  {
    head: "通信ゼロ",
    body: "外部への送信も、外部からの取得もありません",
  },
  {
    head: "バックアップは複製",
    body: "そのファイルをコピーするだけで完了します",
  },
];

export function FeatureLocal() {
  return (
    <section className="relative overflow-hidden bg-av-deep px-6 py-32">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(45% 55% at 50% 50%, rgba(97,94,255,0.16), transparent 70%)",
        }}
      />

      <div className="relative mx-auto max-w-[56rem] text-center">
        <Reveal>
          <div className="text-[11px] uppercase tracking-[0.14em] text-av-azure">
            Local only
          </div>
          <h2 className="mx-auto mt-4 max-w-[36rem] text-[clamp(1.9rem,5.2vw,2.9rem)] font-semibold leading-[1.4] tracking-[-0.03em]">
            書いたものは、
            <br />
            この端末から出ません。
          </h2>
          <p className="mx-auto mt-5 max-w-[34rem] text-sm leading-[2] text-av-body">
            アカウントも同期もありません。そのかわり、誰にも見せない
            考えごとを、そのまま書き留められます。
          </p>
        </Reveal>

        <Reveal delay={0.1} className="mt-14">
          <dl className="grid gap-4 sm:grid-cols-3">
            {FACTS.map((f) => (
              <div
                key={f.head}
                className="rounded-2xl border border-white/10 bg-av-surface/70 px-5 py-6 text-left"
              >
                <dt className="text-sm font-semibold">{f.head}</dt>
                <dd className="mt-2 break-all text-xs leading-[1.8] text-av-body">
                  {f.body}
                </dd>
              </div>
            ))}
          </dl>
        </Reveal>
      </div>
    </section>
  );
}
```

- [ ] **Step 2: `landing/src/App.tsx` に追加する**

`<FeatureBoard />` の直後に `<FeatureLocal />` を足し、import を追加する。

```tsx
import { FeatureLocal } from "./sections/FeatureLocal";
```

- [ ] **Step 3: ブラウザで確認する**

前後の機能セクション（`bg-av-surface`）との間で背景が `bg-av-deep` に落ち、帯として区切られて見えることを確認する。

- [ ] **Step 4: コミット**

```bash
cd /Users/kei06/dev/Avoliq
git add landing/src
git commit -m "feat: ローカル完結を伝える帯セクションを追加"
```

---

## Task 11: その他の機能グリッドを作る

**Files:**
- Create: `landing/src/sections/FeatureGrid.tsx`
- Modify: `landing/src/App.tsx`

- [ ] **Step 1: `landing/src/sections/FeatureGrid.tsx` を作る**

```tsx
import { Reveal } from "../components/Reveal";

const ITEMS = [
  {
    title: "Markdown の詳細エディタ",
    body: "本文は BlockNote で編集します。入力は自動保存され、パレットを閉じるときに確実に書き出されます。",
  },
  {
    title: "複数ボードの切り替え",
    body: "用途ごとにボードを分けて、⌘B で行き来します。仕事と私用を混ぜずに済みます。",
  },
  {
    title: "削除の取り消し",
    body: "削除はソフトデリートです。⌘Z を押せば、消す前と同じ位置に戻ります。",
  },
  {
    title: "メニューバー常駐",
    body: "Dock を占有せず、メニューバーに置いておけます。ログイン時の自動起動も設定から選べます。",
  },
  {
    title: "ライト・ダークの両対応",
    body: "システムの外観に追従します。コントラストは両方のモードで WCAG AA 基準を満たすよう検証しています。",
  },
  {
    title: "常に出ているキーのヒント",
    body: "画面下部に、いまの画面で使えるキーが常時表示されます。覚える前から使えます。",
  },
];

export function FeatureGrid() {
  return (
    <section className="bg-av-bg px-6 py-28">
      <div className="mx-auto max-w-[64rem]">
        <Reveal>
          <h2 className="text-[clamp(1.5rem,3.6vw,2rem)] font-semibold tracking-[-0.03em]">
            そのほかの機能
          </h2>
        </Reveal>

        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {ITEMS.map((item, i) => (
            <Reveal key={item.title} delay={0.04 * i}>
              <div className="h-full rounded-2xl border border-white/10 bg-av-surface/60 px-6 py-7">
                <h3 className="text-[15px] font-semibold">{item.title}</h3>
                <p className="mt-3 text-[13px] leading-[1.85] text-av-body">
                  {item.body}
                </p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 2: `landing/src/App.tsx` に追加する**

`<FeatureLocal />` の直後に `<FeatureGrid />` を足し、import を追加する。

- [ ] **Step 3: ブラウザで確認する**

幅を狭めて、1列 → 2列 → 3列と切り替わることを確認する。

- [ ] **Step 4: コミット**

```bash
cd /Users/kei06/dev/Avoliq
git add landing/src
git commit -m "feat: そのほかの機能グリッドを追加"
```

---

## Task 12: Design Notes を作る

LP で最も読まれる想定のセクション。3つの判断を「課題 → 選んだもの → なぜ → 結果」の型で書く。

**Files:**
- Create: `landing/src/sections/DesignNotes.tsx`
- Modify: `landing/src/App.tsx`

- [ ] **Step 1: `landing/src/sections/DesignNotes.tsx` を作る**

```tsx
import { Reveal } from "../components/Reveal";

interface Note {
  index: string;
  title: string;
  problem: string;
  choice: string;
  why: string;
  result: string;
}

const NOTES: Note[] = [
  {
    index: "01",
    title: "ウィンドウの作法",
    problem:
      "普通のウィンドウとして出すと、開いた瞬間に作業中のアプリからフォーカスを奪ってしまう。Cmd+Tab の循環にも並んでしまい、「ちょっと見るだけ」の道具にならない。",
    choice: "Tauri v2 と tauri-nspanel による NSPanel 化",
    why: "NSPanel は macOS が Spotlight などに使っているウィンドウ種別で、キー入力は受け取りながら、背後のアプリのアクティブ状態を保てる。同じ振る舞いを通常ウィンドウで再現しようとすると、フォーカス制御を手で組むことになり破綻しやすい。",
    result:
      "Alt + Space で最前面に出て、Esc で消える。背後のエディタはアクティブなままで、閉じた瞬間にカーソルが戻る。",
  },
  {
    index: "02",
    title: "データを閉じる",
    problem:
      "タスクには、他人に見せる前提のない書きかけの考えが入る。同期を前提にすると、置き場所と権限の設計が必要になり、書く手前にためらいが生まれる。",
    choice: "Rust と rusqlite によるローカル SQLite",
    why: "同期を捨てる代わりに、外部通信をゼロにできる。SQLite なら単一ファイルで完結し、バックアップも移行もファイル操作だけで済む。SQLite 自体をビルドに同梱しているので、実行環境に依存しない。",
    result:
      "データは ~/Library/Application Support/Avoliq/avoliq.db ひとつ。壊れてもコピーを戻せば済む。",
  },
  {
    index: "03",
    title: "色を一元管理する",
    problem:
      "shadcn/ui と BlockNote という2つのライブラリがそれぞれ独自の CSS 変数を持っており、放っておくと色の実値が3か所に散る。ライトとダークで別々にずれていき、コントラストの担保もできなくなる。",
    choice: "色の実値を --av-* にだけ置き、他はすべてそこを参照させる",
    why: "実値の置き場所を1か所に決めておけば、モードの追加もコントラストの検証もその1か所を見れば済む。shadcn の CLI が生成する直値をそのまま残すと、この前提が静かに壊れる。",
    result:
      "ライト・ダーク両方の文字色と背景色の組み合わせを WCAG AA 基準で検証済み。色を変えるときに触るファイルは1つ。",
  },
];

export function DesignNotes() {
  return (
    <section id="design-notes" className="bg-av-surface px-6 py-28">
      <div className="mx-auto max-w-[52rem]">
        <Reveal>
          <div className="text-[11px] uppercase tracking-[0.14em] text-av-azure">
            Design Notes
          </div>
          <h2 className="mt-3 text-[clamp(1.6rem,4vw,2.25rem)] font-semibold tracking-[-0.03em]">
            なぜ、この設計にしたか。
          </h2>
        </Reveal>

        <div className="mt-14 flex flex-col gap-16">
          {NOTES.map((note) => (
            <Reveal key={note.index}>
              <article>
                <div className="flex items-baseline gap-4">
                  <span className="text-sm tabular-nums text-av-muted">
                    {note.index}
                  </span>
                  <h3 className="text-xl font-semibold tracking-[-0.02em]">
                    {note.title}
                  </h3>
                </div>

                <dl className="mt-6 flex flex-col gap-5 border-l border-white/10 pl-6">
                  <div>
                    <dt className="text-[11px] uppercase tracking-[0.12em] text-av-muted">
                      課題
                    </dt>
                    <dd className="mt-1.5 text-sm leading-[1.95] text-av-body">
                      {note.problem}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[11px] uppercase tracking-[0.12em] text-av-muted">
                      選んだもの
                    </dt>
                    <dd className="mt-1.5 text-sm leading-[1.95] text-av-ink">
                      {note.choice}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[11px] uppercase tracking-[0.12em] text-av-muted">
                      なぜ
                    </dt>
                    <dd className="mt-1.5 text-sm leading-[1.95] text-av-body">
                      {note.why}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[11px] uppercase tracking-[0.12em] text-av-muted">
                      結果
                    </dt>
                    <dd className="mt-1.5 text-sm leading-[1.95] text-av-body">
                      {note.result}
                    </dd>
                  </div>
                </dl>
              </article>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 2: `landing/src/App.tsx` に追加する**

`<FeatureGrid />` の直後に `<DesignNotes />` を足し、import を追加する。

- [ ] **Step 3: Hero の「設計を読む」がここへ飛ぶことを確認する**

ページ先頭の「設計を読む」を押して、Design Notes まで移動することを確認する。
`section` に `id="design-notes"` が付いていることが条件。

- [ ] **Step 4: コミット**

```bash
cd /Users/kei06/dev/Avoliq
git add landing/src
git commit -m "feat: 設計判断を書くDesign Notesセクションを追加"
```

---

## Task 13: Tech Specs を作る

**Files:**
- Create: `landing/src/sections/TechSpecs.tsx`
- Modify: `landing/src/App.tsx`

- [ ] **Step 1: `landing/src/sections/TechSpecs.tsx` を作る**

```tsx
import { Reveal } from "../components/Reveal";

const SPECS: { area: string; value: string }[] = [
  { area: "アプリ基盤", value: "Tauri v2（macOS 専用 / tauri-nspanel で NSPanel 化）" },
  { area: "フロントエンド", value: "React 19 + TypeScript + Vite" },
  { area: "スタイル", value: "Tailwind CSS v4 + shadcn/ui（Base UI ベース）+ lucide-react" },
  { area: "状態管理", value: "zustand" },
  { area: "エディタ", value: "BlockNote 0.54.0（バージョン固定）" },
  { area: "バックエンド", value: "Rust + rusqlite（SQLite 同梱ビルド）" },
  { area: "テスト", value: "Vitest + Testing Library / cargo test" },
  { area: "動作要件", value: "macOS 専用。NSPanel などのプライベート API に依存" },
];

export function TechSpecs() {
  return (
    <section className="bg-av-surface px-6 pb-28">
      <div className="mx-auto max-w-[52rem]">
        <Reveal>
          <div className="text-[11px] uppercase tracking-[0.14em] text-av-azure">
            Tech Specs
          </div>
          <h2 className="mt-3 text-[clamp(1.6rem,4vw,2.25rem)] font-semibold tracking-[-0.03em]">
            技術仕様
          </h2>
        </Reveal>

        <Reveal delay={0.06} className="mt-10">
          <dl className="divide-y divide-white/10 border-y border-white/10">
            {SPECS.map((s) => (
              <div
                key={s.area}
                className="grid gap-1 py-5 sm:grid-cols-[10rem_1fr] sm:gap-6"
              >
                <dt className="text-[13px] text-av-muted">{s.area}</dt>
                <dd className="text-sm leading-[1.8]">{s.value}</dd>
              </div>
            ))}
          </dl>
        </Reveal>
      </div>
    </section>
  );
}
```

- [ ] **Step 2: `landing/src/App.tsx` に追加する**

`<DesignNotes />` の直後に `<TechSpecs />` を足し、import を追加する。

- [ ] **Step 3: ブラウザで確認する**

幅 375px で、`dt` と `dd` が縦に積まれることを確認する。

- [ ] **Step 4: コミット**

```bash
cd /Users/kei06/dev/Avoliq
git add landing/src
git commit -m "feat: 技術仕様セクションを追加"
```

---

## Task 14: CTA とフッターを作る

**Files:**
- Create: `landing/src/sections/Footer.tsx`
- Modify: `landing/src/App.tsx`
- Create: `landing/public/avoliq-logo.png`（本体からコピー）

- [ ] **Step 1: ロゴをコピーする**

```bash
cd /Users/kei06/dev/Avoliq
cp design/avoliq-logo.png landing/public/avoliq-logo.png
```

- [ ] **Step 2: `landing/src/sections/Footer.tsx` を作る**

```tsx
import { Reveal } from "../components/Reveal";

const REPO = "https://github.com/Keisuke-MARs/Avoliq";

export function Footer() {
  return (
    <footer className="relative overflow-hidden bg-av-deep px-6 pb-16 pt-32">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(50% 60% at 50% 0%, rgba(10,132,255,0.20), transparent 70%)",
        }}
      />

      <div className="relative mx-auto max-w-[52rem] text-center">
        <Reveal>
          <h2 className="text-[clamp(1.7rem,4.6vw,2.5rem)] font-semibold leading-[1.4] tracking-[-0.03em]">
            コードは、すべて公開しています。
          </h2>
          <p className="mx-auto mt-4 max-w-[32rem] text-sm leading-[1.95] text-av-body">
            ここに書いた判断が実際にどう実装されているかは、リポジトリで確かめられます。
          </p>
          <div className="mt-8">
            <a
              href={REPO}
              className="inline-block rounded-full bg-av-blue px-6 py-3 text-sm font-medium text-white transition-opacity hover:opacity-85"
            >
              GitHub で見る
            </a>
          </div>
        </Reveal>

        <div className="mt-24 flex flex-col items-center gap-4 border-t border-white/10 pt-10">
          <img
            src={`${import.meta.env.BASE_URL}avoliq-logo.png`}
            alt="Avoliq"
            width={132}
            className="opacity-70"
          />
          <p className="text-xs text-av-muted">
            Avoliq — 直感的に、自然に思考を整え、次へ進める。
          </p>
        </div>
      </div>
    </footer>
  );
}
```

- [ ] **Step 3: `landing/src/App.tsx` を最終形にする**

```tsx
import { DesignNotes } from "./sections/DesignNotes";
import { FeatureBoard } from "./sections/FeatureBoard";
import { FeatureGrid } from "./sections/FeatureGrid";
import { FeatureLocal } from "./sections/FeatureLocal";
import { FeatureSearch } from "./sections/FeatureSearch";
import { Footer } from "./sections/Footer";
import { StickyStage } from "./sections/StickyStage";
import { TechSpecs } from "./sections/TechSpecs";

export default function App() {
  return (
    <main className="bg-av-deep text-av-ink">
      <StickyStage />
      <FeatureSearch />
      <FeatureBoard />
      <FeatureLocal />
      <FeatureGrid />
      <DesignNotes />
      <TechSpecs />
      <Footer />
    </main>
  );
}
```

- [ ] **Step 4: ロゴが暗背景で見えることを確認する**

`design/avoliq-logo.png` は黒文字なので、暗背景では読めない可能性がある。
読めない場合は、ロゴのアイコン部分だけを使うか、`invert` を当てる。

```tsx
            className="opacity-70 invert"
```

- [ ] **Step 5: ビルドが通ることを確認する**

```bash
cd landing && npm run build
```

- [ ] **Step 6: コミット**

```bash
cd /Users/kei06/dev/Avoliq
git add landing
git commit -m "feat: CTAとフッターを追加してLPの全セクションを揃える"
```

---

## Task 15: メタ情報と OGP を整える

**Files:**
- Modify: `landing/index.html`
- Create: `landing/public/ogp.png`
- Create: `landing/public/favicon.png`

- [ ] **Step 1: favicon を作る**

```bash
cd /Users/kei06/dev/Avoliq
sips -Z 512 design/avoliq-app-icon.png --out landing/public/favicon.png
```

- [ ] **Step 2: OGP 画像を作る**

ヒーローを 1200x630 で書き出す。ブラウザで LP を開き、ウィンドウ幅を 1200px にしてヒーローを撮影し、`sips` で 1200x630 に切り出す。

```bash
sips -c 630 1200 /tmp/avoliq-shot/hero.png --out landing/public/ogp.png
sips -g pixelWidth -g pixelHeight landing/public/ogp.png
```

期待する結果: `pixelWidth: 1200` / `pixelHeight: 630`。

- [ ] **Step 3: `landing/index.html` の `<head>` を差し替える**

`<title>` の下に次を追加する。URL は GitHub Pages のプロジェクトページを前提にする。

```html
    <link rel="icon" type="image/png" href="/Avoliq/favicon.png" />
    <meta property="og:type" content="website" />
    <meta property="og:title" content="Avoliq — 直感的に、自然に思考を整え、次へ進める。" />
    <meta
      property="og:description"
      content="macOS 向けの Spotlight 風タスクパレット。Alt + Space で開き、キーボードだけでタスクを片づける。データはすべてローカルに保存される。"
    />
    <meta property="og:url" content="https://keisuke-mars.github.io/Avoliq/" />
    <meta property="og:image" content="https://keisuke-mars.github.io/Avoliq/ogp.png" />
    <meta name="twitter:card" content="summary_large_image" />
```

- [ ] **Step 4: ビルドして生成物に画像が含まれることを確認する**

```bash
cd landing && npm run build && ls dist
```

期待する結果: `dist/favicon.png` と `dist/ogp.png` が存在する。

- [ ] **Step 5: コミット**

```bash
cd /Users/kei06/dev/Avoliq
git add landing
git commit -m "feat: favicon・OGP画像・メタ情報を追加"
```

---

## Task 16: 最終検証

設計書 9章の検証項目をすべて実施する。

**Files:**
- Modify: 検証で見つかった問題に応じて該当ファイル

- [ ] **Step 1: テストとビルドを通す**

```bash
cd landing && npm test && npm run build
```

期待する結果: テストが全件 PASS、ビルドが成功。

- [ ] **Step 2: 本体が壊れていないことを確認する**

```bash
cd /Users/kei06/dev/Avoliq && npm test && npm run build
```

期待する結果: これまでと同じく成功する。

- [ ] **Step 3: 本文のコントラストを実測する**

`npm run dev` で開き、DevTools のコンソールで次を実行する。

```js
// 本文色 #AFB6C1 と各背景のコントラスト比を出す
const lum = (hex) => {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const ratio = (a, b) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};
for (const bg of ["#080b11", "#0c1017", "#10151f"]) {
  console.log(bg, "body", ratio("#afb6c1", bg).toFixed(2), "ink", ratio("#f1f4f8", bg).toFixed(2));
}
```

期待する結果: `body` の比が全背景で **4.5 以上**。下回る場合は `--color-av-body` を明るくして再測定する。

- [ ] **Step 4: 動き低減で全セクションが読めることを確認する**

DevTools の Rendering パネルで `prefers-reduced-motion: reduce` をエミュレートし、先頭から末尾までスクロールする。

確認すること: どのセクションのテキストも透明のまま隠れていない。

- [ ] **Step 5: 幅を変えて崩れないことを確認する**

DevTools のデバイスツールバーで 375px / 768px / 1440px を順に確認する。

確認すること: 横スクロールバーが出ない。テキストがはみ出さない。パレットが画面幅を超えない。

- [ ] **Step 6: キーボードだけで操作できることを確認する**

`Tab` を押していき、Hero の2つのリンク・フッターのリンクにフォーカスが当たり、
フォーカスリングが見えることを確認する。`Enter` でリンクが動くことを確認する。

- [ ] **Step 7: スクロールがなめらかであることを確認する**

DevTools の Performance パネルで記録しながら sticky ステージ区間をスクロールし、
フレームが 60fps 付近を保つことを確認する。落ちる場合は `PaletteMock` の
`backdrop-blur-2xl` を弱めるか、`will-change` の指定を見直す。

- [ ] **Step 8: コンソールにエラーが出ていないことを確認する**

- [ ] **Step 9: 見つかった問題を直してコミット**

```bash
cd /Users/kei06/dev/Avoliq
git add landing
git commit -m "fix: LPの検証で見つかった表示とコントラストの問題を直す"
```

- [ ] **Step 10: README に LP の項を足す**

`README.md` の「ディレクトリ構成」のコードブロックに次の行を追加する。

```
landing/                  # ランディングページ（独立したViteプロジェクト）
```

```bash
cd /Users/kei06/dev/Avoliq
git add README.md
git commit -m "docs: READMEのディレクトリ構成にlandingを追加"
```

---

## 完了条件

- `cd landing && npm test && npm run build` が通る
- 本体の `npm test && npm run build` が通る
- 設計書 9章の検証項目がすべて確認済み
- 10 セクションすべてが実装され、絵柄の重複がない（抽象パレットは1インスタンスのみ）
