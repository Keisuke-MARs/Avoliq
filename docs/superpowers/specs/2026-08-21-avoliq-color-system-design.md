# Avoliq カラーシステム設計書

作成日: 2026-08-21
ステータス: ユーザー承認済み（ブレインストーミングセッションにて各決定を承認）

関連文書:
- `2026-08-20-avoliq-brand-design.md`（ブランド設計書。本書はその第3節カラーシステムを実装へ落とし込む）
- `2026-08-20-avoliq-palette-design.md`（全体設計）
- `2026-08-20-implementation-contract.md`（実装コントラクト）

---

## 1. 背景と目的

Avoliq のブランド設計書は Avoliq Blue `#0A84FF` を「唯一の行動色」と定めているが、
**実装のどこにもこの色は存在しない**。アプリの配色は Apple systemGray 系の完全な無彩色で構成され、
ブランドの気配がまったく無い状態にある。

同時に、配色の土台そのものに構造的な欠陥がある。

| 欠陥 | 内容 |
|---|---|
| ダークモードの二重機構 | CSS は `@media (prefers-color-scheme: dark)`、JS は `matchMedia`。`.dark` クラスがアプリ本体に付かず、`index.css` の `.dark { … }` は BlockNote のサブツリー以外では死にコード |
| アクセント青の分裂 | `#007AFF` / `#007aff`（大小文字違いで別リテラル）/ shadcn `--primary`（実は `oklch(.205 0 0)` ＝ ほぼ黒）の3系統 |
| 危険色の分裂 | `#FF3B30` 直書き と shadcn `--destructive` の2系統 |
| ガラスが機能していなかった | `backdrop-filter` は透過 WebView ではデスクトップをぼかせず完全な no-op だった。**コミット `c2f9b6c` で `windowEffects` により解消済み**。本設計はその上に重ねる CSS 層を定める |
| コントラストの破綻 | 選択カードの白文字はステータス8色すべてで AA 不合格（1.90〜4.28） |

本書は、これらを一度に解消する配色トークン体系を定義する。

### 本書のスコープ

- 配色トークン体系の全面再設計（`--st-*` → `--av-*`）
- ダークモード基盤の `.dark` クラス一本化
- `windowEffects` の上に重ねる Liquid Glass の CSS 層
- 選択カード・ステータスチップの表現変更
- shadcn / sonner / ConfirmDialog / BlockNote の配色整合
- デッドコードの削除

### スコープ外

- レイアウト・余白・タイポグラフィのスケール変更
- キーボード操作仕様の変更
- 新機能の追加
- アプリ内テーマ切替 UI（**OS 追従のみとする**。キーボードだけで完結する常駐ユーティリティに設定項目を増やすのは、コンセプトの「迷わせない」に反する）

---

## 2. 決定サマリ

| 論点 | 決定 |
|---|---|
| 色空間 | **oklch に統一**。ブランド正典の hex は各行のコメントに残す |
| 命名 | **`--st-*` → `--av-*` へ改名**。ユーティリティクラスも `st-*` → `av-*` |
| 文字色 | **ブランドの Ink / Slate を採用**。完全無彩色をやめる |
| アクセント青 | `#0A84FF` を軸に**3階調**へ分解。正典色は維持 |
| ガラス | `tauri.conf.json` の `windowEffects`（`popover` / `active` / `radius 16`）+ CSS の**二層構成**。外部クレートは使わない |
| ダーク判定 | **`.dark` クラス一本**。`matchMedia` が唯一の源 |
| ステータス8色 | **Apple systemColors を維持**。ただし `#007AFF` をインディゴ `#5856D6` へ差し替え |
| 選択カード | **ベタ塗り＋白文字を廃止**。ブランド青の淡面＋2px リング＋ステータス点（案A） |
| アルファ生成 | hex 文字列連結を廃止し `color-mix(in srgb, …)` へ |
| デッドコード | **削除する**（`ui/button.tsx` / `react.svg` / `vite.svg` / `tauri.svg`） |

---

## 3. トークン体系

### 3.1 色空間: oklch に統一する

**理由**

1. `src/index.css` の shadcn 側（base-nova）は既に全部 oklch。hex と混在すると同一ファイル内に2つの心的モデルが並ぶ。
2. 本設計の中核は「同一色相で明度だけ動かすランプ」。oklch なら `L` の数値がそのまま知覚明度になり、`#52627A` → `#707A89` のような hex では読めない関係がソース上で自明になる。
3. `color-mix()` によるアルファ生成（3.7節）と相性が良い。

**受け入れるコスト**: oklch は WKWebView（Safari 15.4 / macOS 12.3）以降。ただし現状の `:root` が既に oklch なので下限は変わらない。

### 3.2 命名: `--st-*` → `--av-*`

`st` は `smartTask` の遺物。ブランド設計書6節の受け入れ基準は「Rust内部名に `smart-task` が残らない」としており、
CSS 変数だけ旧名が残るのは一貫性を欠く。

**移行コストは実質ゼロ**。`src` 配下の該当は 121 件で、**テストは `--st-*` も `st-*` ユーティリティクラスも一切参照していない**
（`src/components/*.test.tsx` / `src/test` を検証済み）。純粋な機械置換で完了する。

#### 移行表

| 旧 | 新 | 備考 |
|---|---|---|
| `--st-palette-bg` | `--av-glass-tint` + `--av-glass-alpha-top/bottom` | 単色 → ティント色とアルファに分離 |
| `--st-palette-border` | `--av-hairline` | |
| `--st-text-primary` | `--av-text-primary` | 値を Ink へ |
| `--st-text-secondary` | `--av-text-secondary` | 値を Slate へ |
| `--st-text-tertiary` | `--av-text-muted` | 「3段目」でなく「装飾用」と役割を再定義 |
| `--st-surface-hover` | `--av-surface-hover` | |
| `--st-surface-selected` | `--av-surface-selected` | |
| `--st-card-bg` | `--av-surface-card` | 不透明 → 高アルファ半透明 |
| `--st-card-hover-bg` | `--av-surface-card-hover` | |
| `--st-shadow` | `--av-shadow` | |
| `--st-ease` | `--av-ease` | 値は据え置き |

ユーティリティクラスの改名: `st-text-1/2/3` → `av-text-1/2/3`、`st-row-selected` → `av-row-selected`、
`st-border` → `av-border`、`st-chip` → `av-chip`、`st-input` → `av-input`、`st-btn-ghost` → `av-btn-ghost`、
`st-toggle-off` → `av-toggle-off`、`st-card` → `av-card`、`st-palette` → `av-glass`、
`st-view-forward/back` → `av-view-forward/back`。

`.st-search-input::placeholder` と `.st-input::placeholder` は**完全に同じ定義**なので、`av-input` に統一して重複を解消する。

### 3.3 層構造

トークンを **原色層（モード非依存）** と **意味層（モード依存）** に分ける。
意味層は原色層を `var()` で参照するだけにし、色の実値が2箇所に散らないようにする。

### 3.4 原色層（`:root` のみ・`.dark` で上書きしない）

| トークン | oklch | hex | 役割 |
|---|---|---|---|
| `--av-blue-300` | `oklch(0.7748 0.1179 252.36)` | `#7DBAFF` | ダークでの青文字 |
| `--av-blue-500` | `oklch(0.6243 0.2056 255.49)` | `#0A84FF` | **Avoliq Blue（正典）**。文字を載せない塗り |
| `--av-blue-600` | `oklch(0.5615 0.1958 256.54)` | `#0070E4` | 白文字を載せる塗り |
| `--av-blue-700` | `oklch(0.4947 0.1750 256.92)` | `#005DC2` | ライトでの青文字 |
| `--av-azure` | `oklch(0.7730 0.1263 242.75)` | `#66BEFF` | Glass Azure。屈折のみ |
| `--av-violet` | `oklch(0.5818 0.2316 277.23)` | `#615EFF` | Glass Violet。屈折のみ |

#### アクセント青を3階調に分ける理由

`#0A84FF` は **白文字を載せると 3.65:1 で AA に落ちる**（ライト・ダーク共通。白との比は周囲の面に依存しない）。
一方、`#0A84FF` は Apple の systemBlue *ダーク版* そのものであり、ダーク面上の文字色としては十分明るい。
つまり必要な調整は「ダークで明るくする」ではなく「**文字を載せる用途だけ暗くする**」方向である。

- 文字を載せない塗り（選択リング、フォーカスリング、チェック、ステータス点）= `--av-blue-500`（**ブランド正典をそのまま維持**）
- 白文字を載せる塗り（スラッシュメニュー選択行、ホットキー取得中ボタン）= `--av-blue-600`（白文字 4.73 ✓）
- 青い文字そのもの = ライト `--av-blue-700` / ダーク `--av-blue-300`

これでブランド色 `#0A84FF` がアプリ内に**初めて実在**し、かつ AA を割らない。

### 3.5 Ink / Slate を採用する判断

情緒的な理由ではなく、**ガラス越しの最悪ケースで現行トークンが実際に落ちるから**採用する。

新しいガラス面（ライト最悪＝黒壁紙上で `#DCDDDE` 相当）での実測:

| 役割 | 現行（無彩色） | 比 | ブランド寄り | 比 |
|---|---|---|---|---|
| primary | `#1c1c1e` | 12.51 ✓ | Ink `#11213B` | 11.84 ✓ |
| secondary | `#6e6e73` | **3.73 ✗** | Slate `#52627A` | **4.56 ✓** |
| tertiary | `#a1a1a6` | **1.89 ✗** | `#707A89` | 3.19 △ |

Slate は現行 secondary より**暗い**（L .4922 対 .5399）。
**ブランド色へ寄せる行為が、そのまま半透明化で失うコントラストの補填になっている。**
ダーク側も secondary が 5.84 → 7.36 に改善する。

副次的に、hue 258 の寒色キャストは Azure / Violet の屈折光と同族になり、
青く発光するガラスの上に暖色寄りグレーを置いたときの「濁り」を回避できる。

### 3.6 意味層

| トークン | 役割 | ライト | ダーク | 主な使用箇所 |
|---|---|---|---|---|
| `--av-text-primary` | 見出し・本文・タイトル | `oklch(0.2488 0.0542 259.67)` `#11213B` Ink | `oklch(0.9660 0.0062 255.48)` `#F1F4F8` | SearchBar 入力, TaskCard, TaskDetail タイトル, `av-text-1` |
| `--av-text-secondary` | 補助情報・ラベル | `oklch(0.4922 0.0434 258.35)` `#52627A` Slate | `oklch(0.7741 0.0175 259.42)` `#AFB6C1` | Lane ヘッダ名, FooterHints, 戻るボタン, `av-text-2` |
| `--av-text-muted` | **装飾のみ**（3:1 保証、AA 非保証） | `oklch(0.5764 0.0260 258.37)` `#707A89` | `oklch(0.6606 0.0201 258.37)` `#8B939F` | placeholder, アイコン, 無効状態, `av-text-3` |
| `--av-text-on-accent` | 塗りの上の文字 | `oklch(1 0 0)` | `oklch(1 0 0)` | accent-solid / danger-solid 上 |
| `--av-glass-tint` | ガラスの色味 | `oklch(0.9844 0.0045 258.32)` `#F8FAFD` | `oklch(0.2160 0.0200 258.34)` `#141A23` | `.av-glass` |
| `--av-glass-alpha-top` | ガラス上端の不透明度 | `0.64` | `0.68` | 同上 |
| `--av-glass-alpha-bottom` | ガラス下端の不透明度 | `0.56` | `0.58` | 同上 |
| `--av-glass-edge` | 縁の線 | `oklch(0.2488 0.0542 259.67 / 0.10)` | `oklch(1 0 0 / 0.12)` | `.av-glass` border |
| `--av-glass-specular` | 上端スペキュラー | `oklch(1 0 0 / 0.75)` | `oklch(1 0 0 / 0.16)` | inset box-shadow |
| `--av-glass-refract-azure` | 屈折（上／縁） | `oklch(0.7730 0.1263 242.75 / 0.14)` | `oklch(0.7730 0.1263 242.75 / 0.10)` | inset box-shadow |
| `--av-glass-refract-violet` | 屈折（下／奥行き） | `oklch(0.5818 0.2316 277.23 / 0.10)` | `oklch(0.5818 0.2316 277.23 / 0.14)` | inset box-shadow |
| `--av-hairline` | 区切り線・枠 | `oklch(0.2488 0.0542 259.67 / 0.10)` | `oklch(1 0 0 / 0.12)` | SearchBar 下線, Footer 上線, kbd 枠, 空レーン枠 |
| `--av-surface-card` | タスクカード面 | `oklch(1 0 0 / 0.72)` | `oklch(0.3076 0.0199 260.64 / 0.62)` | `.av-card` |
| `--av-surface-card-hover` | カード hover | `oklch(0.9546 0.0087 264.52 / 0.80)` | `oklch(0.3503 0.0214 259.39 / 0.72)` | `.av-card:hover` |
| `--av-surface-raised` | **不透明**な浮きもの | `oklch(0.9909 0.0029 264.54)` `#FBFCFE` | `oklch(0.2790 0.0187 258.37)` `#232932` | ConfirmDialog 本体, トースト, BlockNote メニュー |
| `--av-surface-hover` | 行 hover | `oklch(0.2488 0.0542 259.67 / 0.05)` | `oklch(1 0 0 / 0.07)` | `av-btn-ghost`, kbd 地 |
| `--av-surface-selected` | 行選択 | `oklch(0.2488 0.0542 259.67 / 0.08)` | `oklch(1 0 0 / 0.11)` | BoardSwitcher 行, StatusSettings 行, 設定タブ |
| `--av-accent` | ブランド青（塗り・線） | `var(--av-blue-500)` | `var(--av-blue-500)` | 選択リング, フォーカス, ステータス点 |
| `--av-accent-solid` | 白文字を載せる青 | `var(--av-blue-600)` | `var(--av-blue-600)` | スラッシュメニュー選択行, 取得中ボタン |
| `--av-accent-text` | 青い文字 | `var(--av-blue-700)` | `var(--av-blue-300)` | 選択カードのタイトル |
| `--av-accent-mix` | 選択面の混色比 | `12%` | `16%` | `.av-card[data-selected]` |
| `--av-focus-ring` | フォーカスリング | `var(--av-blue-500)` | `var(--av-blue-500)` | 全フォーカス可視化 |
| `--av-danger` | 危険（文字・アイコン） | `oklch(0.5439 0.2049 28.61)` `#CC211B` | `oklch(0.7073 0.1847 25.94)` `#FF6961` | AlertTriangle, エラー文 |
| `--av-danger-solid` | 危険（白文字の塗り） | `oklch(0.5439 0.2049 28.61)` `#CC211B` | `oklch(0.5439 0.2049 28.61)` `#CC211B` | ConfirmDialog 破棄ボタン |
| `--av-danger-subtle` | 危険の淡面 | `color-mix(in srgb, var(--av-danger) 12%, transparent)` | 同左 | エラーボックス地 |
| `--av-success` | 肯定（白ノブが乗る） | `oklch(0.6000 0.1550 147.50)` `#2B9845` | 同左 | AppSettings 自動起動トグル ON |
| `--av-toggle-off` | トグル OFF トラック | `oklch(0.2488 0.0542 259.67 / 0.20)` | `oklch(1 0 0 / 0.22)` | AppSettings トグル（下記の注意あり） |
| `--av-scrim` | オーバーレイ | `oklch(0.2488 0.0542 259.67 / 0.28)` | `oklch(0 0 0 / 0.50)` | ConfirmDialog 背面 |
| `--av-shadow` | パレットの影 | `0 24px 64px oklch(0.2488 0.0542 259.67/.22), 0 2px 8px oklch(0.2488 0.0542 259.67/.08)` | `0 24px 64px oklch(0 0 0/.55), 0 2px 8px oklch(0 0 0/.35)` | `.av-glass` |
| `--av-status` | ステータス色の受け皿 | （インライン注入） | 同左 | Lane, TaskCard, TaskDetail chip |
| `--av-ease` | イージング | `cubic-bezier(0.32, 0.72, 0, 1)` | 同左 | 据え置き |

### 3.7 アルファ生成を `color-mix` へ

現行は hex 文字列連結でアルファを作っている。

- `TaskCard.tsx:46` `` `0 4px 12px ${statusColor}59` `` → 35%
- `TaskDetail.tsx:163` `` `${status?.color ?? "#8E8E93"}1F` `` → 12%

値がバラバラで、6桁 hex 以外（`#abc` / `rgb()` / `red`）が入ると**無音で壊れる**。
`types.ts:11` は `color: string` なので型では防げない。

**置き換え方針: JS は CSS カスタムプロパティを注入するだけにし、混色は CSS に寄せる。**

```tsx
// TaskCard.tsx — 文字列連結を全廃
<div style={{ "--av-status": statusColor } as React.CSSProperties} …>
```

**`in srgb` を指定する理由**: `in oklab` の方が知覚的には綺麗だが、旧来の hex アルファ連結はブラウザの sRGB アルファ合成そのもの。
`in srgb` にすれば本書の全計算値が**そのまま出荷される値になる**。`in oklab` に変える場合は 8節の検証表を再計算すること。

---

## 4. ダークモード基盤の一本化

現状の二重系統（CSS は `@media`、JS は `usePrefersDark`）を廃し、**`.dark` クラス一本**にする。

1. `index.html` の `<head>` に FOUC 防止のインラインスクリプトを置く。
   ダークのシステムでパレットが一瞬白く光るのは、Spotlight 風の即時表示では致命的に目立つ。

   ```html
   <meta name="color-scheme" content="light dark" />
   <script>
     matchMedia('(prefers-color-scheme: dark)').matches
       && document.documentElement.classList.add('dark');
   </script>
   ```

2. `usePrefersDark` を `useColorScheme` に改め、**唯一の購読者**にする。
   `matchMedia` の変化で `documentElement.classList.toggle('dark', isDark)` を行い、かつ真偽値を返す。
   返り値は `TaskDetail.tsx` の BlockNote `theme` prop と `ui/sonner.tsx` の `theme` prop の両方が使う。

3. `index.css` の `@media (prefers-color-scheme: dark)` ブロックは削除し、`.dark { --av-* }` に統合する。
   既存の `@custom-variant dark (&:is(.dark *))` はそのまま生きる。

4. これで `* { @apply border-border }` の枠線がダークで明るいままになる不具合
   （`--border` が `.dark` に到達していなかったため）が自動的に解消する。

**副作用への注意**: `.dark` が付くようになると、これまで死んでいた `* { @apply border-border }` が**全要素で生き返る**。
`--border` を `--av-hairline` に付け替えたうえで、意図せず枠線が現れる箇所がないか目視スモークが要る。

---

## 5. ガラス（Liquid Glass）の実装

### 5.1 なぜ CSS だけでは届かないか（対応済み）

`index.css` の `.st-palette` にあった `backdrop-filter: saturate(180%) blur(30px)` は、
透過 WebView の下（＝ネイティブ層）には届かず、Web 側スタッキングコンテキストには何も無いため
**完全な no-op** だった。透け感は生アルファで壁紙が素通ししているだけで、
背後の文字がぼけずに読める状態になっていた。これが「ガラスに見えない」原因。

**この点はコミット `c2f9b6c` で既に解消済み**である。`backdrop-filter` は撤去され、
ネイティブのぼかしが導入された。本節の残りは、その上に重ねる CSS 層の仕様を定める。

### 5.2 ネイティブのぼかしは `windowEffects` が担う（実装済み）

Tauri v2 は `tauri.conf.json` の `windowEffects` で `NSVisualEffectView` を宣言的に適用できる。
**外部クレート（`window-vibrancy`）は使わない。** 既に次の設定が入っている。

```jsonc
// src-tauri/tauri.conf.json の windows[0]
"windowEffects": {
  "effects": ["popover"],
  "state": "active",
  "radius": 16
}
```

**`state: "active"` が必須である理由**

既定の `followsWindowActiveState` にすると、パネルがキーウィンドウでない間、
素材が「非アクティブ」表示（彩度が落ちてのっぺりしたグレー）になる。
本アプリは `panel.rs` で `nonactivating_panel` を指定し、**意図的にアプリをアクティブ化しない**ため、
この状態に頻繁に入る。`active` 固定にしないとパレットが出るたび灰色に濁る。

**素材が `popover` である点について**

本設計は当初 `hudWindow` を推していた。理由は「Apple が常時浮かぶユーティリティパネルに使う素材で、
NSPanel という本アプリの形態と用途が一致する」こと。
一方 `popover` を却下した理由は「自前の角丸マスクを持ち、`panel.rs` の `set_corner_radius(16.0)` と
二重マスクになって縁がざらつく」という懸念だった。

**この懸念は机上のものであり、実機で検証していない。**
既に `popover` で動いているため、**実装は `popover` のまま進め、角のざらつきは手動スモーク（11節）で確認する**。
ざらつきが実際に出た場合にのみ `effects` を `["hudWindow"]` に変える（変更は1行）。
どちらの素材でもライト／ダークの appearance には自動追従するため、`.dark` クラスと別管理にはならない。

### 5.3 角丸の値を揃える

角丸 `16` は**3箇所**に散っている。1つでもズレると効果ビューがはみ出すか、影が角丸に沿わなくなる。

| 箇所 | 値 |
|---|---|
| `src-tauri/tauri.conf.json` の `windowEffects.radius` | `16` |
| `src-tauri/src/panel.rs` の `panel.set_corner_radius(…)` | `16.0` |
| `src/index.css` の `.av-glass` の `border-radius` | `16px` |

`panel.rs` 側はマジックナンバーなので `const PANEL_CORNER_RADIUS: f64 = 16.0;` として定数化し、
CSS と `tauri.conf.json` にはコメントで参照元を明示する。

**影の形状**: `panel.rs` の `set_has_shadow(true)` は不透明なコンテンツの輪郭から影を計算する。
効果ビューが入ると輪郭がウィンドウ矩形全体になるため、角丸がズレると**影も四角くなる**。

**既存の `StyleMask` の罠は維持する**: `borderless()` → `nonactivating_panel()` の順序（既存コメントのとおり）。
ガラスまわりを触るときにこの行を動かさない。

### 5.4 CSS レイヤーの具体値

```css
.av-glass {
  border-radius: 16px; /* panel.rs の PANEL_CORNER_RADIUS と揃えること */
  border: 0.5px solid var(--av-glass-edge);
  color: var(--av-text-primary);
  background: linear-gradient(
    180deg,
    color-mix(in srgb, var(--av-glass-tint) calc(var(--av-glass-alpha-top) * 100%), transparent) 0%,
    color-mix(in srgb, var(--av-glass-tint) calc(var(--av-glass-alpha-bottom) * 100%), transparent) 100%
  );
  box-shadow:
    /* 上端の細い白のスペキュラーハイライト */
    inset 0 0.5px 0 0 var(--av-glass-specular),
    /* 縁のごく薄い Glass Azure の屈折 */
    inset 0 1px 12px -6px var(--av-glass-refract-azure),
    /* 底の Glass Violet による奥行き */
    inset 0 -24px 44px -28px var(--av-glass-refract-violet),
    var(--av-shadow);
}
```

上端 0.64 / 下端 0.56（ダーク 0.68 / 0.58）にするのは、**上ほど厚く見えるのが実物のガラスの挙動**であり、
かつ最も可読性が要る検索バーが上端にあるため。
**可読性の床は必ず下端アルファで検証する**（8節はそうしている）。

### 5.5 カードはガラスにしない

ブランド設計書4節「ガラス素材はコンテンツより前面に浮く重要な一要素に限定する」に従い、
**ガラスはパレットの器だけ**とする。ただし完全不透明にすると盤面の大半でガラスが消えるため、**高アルファの面**にする。

```css
.av-card {
  background-color: var(--av-surface-card);   /* light: 白72% / dark: #2A303A 62% */
  transition: background-color 120ms var(--av-ease), color 120ms var(--av-ease),
              transform 120ms var(--av-ease), box-shadow 120ms var(--av-ease);
}
.av-card:hover:not([data-selected="true"]) { background-color: var(--av-surface-card-hover); }
```

ConfirmDialog 本体・トースト・BlockNote のメニューは**不透明** `--av-surface-raised` にする。
ガラスの上にガラスを重ねると屈折が二乗になって濁る。

### 5.6 壁紙別の可読性の担保

**方針: 素材と CSS の合成後の面を「ライト最悪 = 黒壁紙上」「ダーク最悪 = 白壁紙上」の2点で固定し、
その2点で AA を満たす前景色しか primary / secondary に置かない。**

合成モデル（`NSVisualEffectView` を ライト≒白 0.72 相当 / ダーク≒黒 0.78 相当 と近似）での実効背景。
**この近似は素材の実測ではなく机上のもの**なので、11節のスモークで実機のピクセル値と突き合わせる。
`popover` と `hudWindow` では素材の不透明度が異なるため、ズレが大きければ本節と8節を再計算する。

| 壁紙 | ライト・ガラス面 | ライト・カード面 | ダーク・ガラス面 | ダーク・カード面 |
|---|---|---|---|---|
| 黒 `#000000` | `#DCDDDE` | `#F5F5F6` | `#0C1016` | `#1F242C` |
| 白 `#FFFFFF` | `#FBFCFE` | `#FEFEFF` | `#23272C` | `#272C34` |
| 派手（マゼンタ `#C81E64`） | `#F4E0EA` | `#FCF6F9` | `#1D131E` | `#25252F` |
| 派手（ブルー `#1E64C8`） | `#DFE9F7` | `#F6F9FD` | `#0F1826` | `#202733` |

**派手な壁紙は最悪ケースにならない**のが要点。`NSVisualEffectView` は輝度を素材のトーンへ引き寄せたうえで彩度も丸めるため、
合成後は必ず黒壁紙と白壁紙の間に収まる。よって**2点で検証すれば全壁紙をカバーできる**。
派手壁紙で起きるのは可読性の破綻ではなく**色被り**であり、それは `--av-glass-tint` の hue 258 が中和する。

さらに3段の防御を敷く。

1. **AA が必要な文字はガラスに直接置かない**。情報量のある `Lane.tsx` のレーン件数と
   `Board.tsx` の空状態サブ行は **secondary へ格上げ**する。
2. `--av-text-muted` は「最悪面で 3:1」を保証水準とし、AA は保証しない。用途は placeholder・アイコン・無効状態に限定する。
3. **ぼかしが無い状態への退避弁**。素材が無い状態でアルファ 0.56 のままだと、
   黒壁紙上で実効背景が `#818284` になり Slate が **1.61:1** まで落ちて UI が読めなくなる。
   次の CSS を用意し、`<html>` に `data-vibrancy="off"` を付ければ実質不透明へ退避できるようにする。

   ```css
   [data-vibrancy="off"] { --av-glass-alpha-top: 0.96; --av-glass-alpha-bottom: 0.94; }
   ```

   **これは自動フォールバックではない。** `windowEffects` は宣言的な設定であり、
   フロントや Rust が「適用に失敗した」ことを知る戻り値は無い。
   一方 `NSVisualEffectView` は macOS 10.10 以降つねに利用可能で、
   Avoliq は macOS 専用アプリなので、実質的に失敗経路は存在しない。

   したがってこの属性は **手動の退避弁 / デバッグ用**として位置づける。
   将来 `window-vibrancy` クレートへ移行して `Result` を拾えるようになった場合は、
   そこから自動で付けるようにしてよい。
   手動で付けた状態で UI が読めることは、手動スモーク（11節）で確認する。

---

## 6. ステータス色

### 6.1 8色は Apple systemColors を維持する

ブランド調和色に置き換えない。

1. ブランド設計書5節は「カンバンのステータス色はプロダクトUI内でのみ使い、ブランドの主パレットへ持ち出さない」と明記している。
   これは**ステータス色にブランド調和を課さない**という宣言であり、置き換えを支持しない。求められているのは調和ではなく**隔離**。
2. ステータス色は `types.ts` で `color: string`、`StatusSettings.tsx` で任意に変更できる**ユーザーデータ**である。
   プリセット8色は出発点にすぎず、ブランド化しても既存ボードの色は変わらない。
3. Apple systemColors は macOS ユーザーにとって既知の語彙で、8色の色相分離が最適化済み。

### 6.2 `#007AFF` の役割衝突を解消する

**プリセットから「ブルー `#007AFF`」を削除し、「インディゴ `#5856D6`」を追加する。
同時に Rust の `DEFAULT_STATUSES` の「進行中」を `#5AC8FA`（ティール）に変更する。**

- `#007AFF` は `#0A84FF` と**色相差 2°・明度差 0.02** で、視覚的に同一色。
  アプリの唯一の行動色（選択・フォーカス）とステータスの一種が見分けられないのは、
  キーボード駆動で「今どこにいるか」が生命線の UI では致命的。
- ティールは青系の識別性を保ちつつ `#0A84FF` と明確に別。加えて8色中**黒文字とのコントラストが最高（11.08:1）**。
- インディゴは青系の選択肢を1つ残すための補充。Glass Violet `#615EFF` と近いが、
  Violet は 10〜14% アルファの屈折にしか出ないため実用上の混同は起きない。

**データ方針: 変更は `DEFAULT_STATUSES` 経由で新規ボードにのみ適用され、
既存ボードの `statuses.color` 列は一切書き換えない。マイグレーションは行わない。**

### 6.3 選択カードの表現（案A）

現行の「ステータス色ベタ塗り + `color:"#fff"` 固定」は、**8色すべてで AA を割る**。

| | グレー | ティール | オレンジ | グリーン | レッド | ピンク | インディゴ | パープル |
|---|---|---|---|---|---|---|---|---|
| 白文字 | 3.26 ✗ | 1.90 ✗ | 2.20 ✗ | 2.22 ✗ | 3.55 ✗ | 3.65 ✗ | 4.28 ✗ | 4.13 ✗ |

**採用: 案A — ブランド青の淡面 + 濃い青文字 + 2px アクセントリング + ステータス点**

```css
.av-card[data-selected="true"] {
  background-color: color-mix(in srgb, var(--av-accent) var(--av-accent-mix), var(--av-surface-card));
  color: var(--av-accent-text);
  box-shadow: inset 0 0 0 2px var(--av-accent),
              0 4px 12px color-mix(in srgb, var(--av-accent) 30%, transparent);
  transform: translateY(-1px);
}
.av-status-dot {
  background-color: var(--av-status);
  box-shadow: inset 0 0 0 0.5px oklch(0 0 0 / 0.15);
}
```

**設計思想**: 選択は「いま自分がどこにいるか」という**状態**であって、ステータス（データ）ではない。
だから選択の色はブランド青ひとつに固定し、ステータスの識別は**レーンの所属とカード左の小さな点**が担う。

**採用の決め手**: ステータス色は**ユーザー入力**である。案Aだけが**選択表示のコントラストをステータス色から完全に切り離す**ため、
どんな色を入れられても壊れない。

**2px リングは装飾ではなく必須**: 淡面**単独**では隣接カードとの面コントラストが **1.15:1** しかなく、
WCAG 1.4.11（非文字の UI 状態は 3:1）を満たさない。リングは全条件で 3:1 を超える。
ダークの混色比を 22% ではなく **16%** にしたのは、22% だとリングと選択面のコントラストが 2.96 に落ちてリングが埋もれたため。

**ステータス点の輪郭**: ティール `#5AC8FA` / オレンジ `#FF9500` はライトのカード面に対して 1.9〜2.2:1 しかなく、
単独では縁が溶ける。`inset 0 0 0 0.5px oklch(0 0 0 / 0.15)` を必ず添える。同じ処置を `Lane.tsx` の `Circle` にも適用する。

**退避先として残す案B**: 「ステータス色ベタ塗り + 明度から白／黒を自動選択」。
白黒の交差点は相対輝度 `L = 0.1791` にあり、そこでの両者の比が `4.58`。
つまり `max(白, 黒)` は**どんな色でも 4.58 を下回らない**。
将来「選択をもっと強く出したい」という要望が出たときの検証済みの退避先として本書に残す。

| | グレー | ティール | オレンジ | グリーン | レッド | ピンク | インディゴ | パープル |
|---|---|---|---|---|---|---|---|---|
| 案B 採用文字 | 黒 | 黒 | 黒 | 黒 | 黒 | 黒 | 白 | 黒 |
| 比 | 6.44 ✓ | 11.08 ✓ | 9.55 ✓ | 9.46 ✓ | 5.92 ✓ | 5.76 ✓ | 4.99 ✓ | 5.08 ✓ |

### 6.4 ステータスチップ

```css
.av-status-chip {
  background-color: color-mix(in srgb, var(--av-status) 14%, var(--av-surface-card));
  color: color-mix(in srgb, var(--av-status) 45%, var(--av-text-primary));
}
.dark .av-status-chip {
  background-color: color-mix(in srgb, var(--av-status) 22%, var(--av-surface-card));
  color: color-mix(in srgb, var(--av-status) 45%, #fff);
}
```

現行チップ（文字＝生のステータス色、面＝12%）は最小 **1.63:1** で完全に破綻している。
上式なら**ライト最小 4.83 ✓ / ダーク最小 6.00 ✓**。

**前提の明示**: この混色比は固定である。`StatusSettings` の色入力は**プリセット8色からの選択のみ**に留める（現行どおり）。
自由入力を将来開放するなら、その時点で案Bの輝度計算をチップにも適用すること。

### 6.5 Rust / TS の二重管理を解消する

`src-tauri/src/db/repo.rs` の `DEFAULT_STATUSES` と `src/lib/statusPalette.ts` の `STATUS_COLORS` が、
**先頭4色が一致していることに暗黙依存**している。
`StatusSettings.tsx` は `STATUS_COLORS` から現在色を引くため、Rust 側だけ色を変えるとピッカーの初期選択が黙って 0 番に落ちる。

**解消策: リポジトリ直下に単一の JSON を置き、両言語がそれを読む。**

```jsonc
// design/status-presets.json（実際のファイルにコメントは書かない）
[
  { "name": "グレー",     "value": "#8E8E93" },
  { "name": "ティール",   "value": "#5AC8FA" },
  { "name": "オレンジ",   "value": "#FF9500" },
  { "name": "グリーン",   "value": "#34C759" },
  { "name": "レッド",     "value": "#FF3B30" },
  { "name": "インディゴ", "value": "#5856D6" },
  { "name": "パープル",   "value": "#AF52DE" },
  { "name": "ピンク",     "value": "#FF2D55" }
]
```

- Rust: `repo.rs`（`src-tauri/src/db/`）から見たリポジトリ直下は3階層上なので
  **`include_str!("../../../design/status-presets.json")`**。`serde_json` でパースし、先頭4件をデフォルトステータスに使う。
  コンパイル時に埋め込まれるため実行時の I/O は発生しない。JSON が壊れていればビルドが落ちる。
- TS: `statusPalette.ts` のハードコード配列を、この JSON の import で置換する。
  **パス解決は実装時に確認する**: `tsconfig.json` の `resolveJsonModule` が有効か、
  `src` の外を import できるか（`vite.config.ts` の `resolve.alias` か相対パス `../../design/status-presets.json`）。
  `src` 外の import が通らない場合は、JSON を `src/lib/statusPresets.json` に置き、
  Rust 側の `include_str!` をそちらへ向ける（**単一ソースであることが要件であり、置き場所は要件ではない**）。
- ビルド時に両者が同じファイルを読むので、ズレが**構造的に起きなくなる**。

**プリセット外の色を持つステータスの扱い**: 既存ボードには、プリセットから外す `#007AFF` が残る。
`StatusSettings.tsx` の現在色の逆引きは既に `found >= 0 ? found : 0` でフォールバック済みであり、
`colorIndex` が `-1` になる経路は存在しない（初期値も `0`）。**データが壊れる不具合ではない。**

実際に起きるのは「色ピッカーを開いたとき、現在色ではなくグレー（0番）が選択された状態で開く」という表示上の挙動のみ。
プリセット外の色は「変更しなければ保持され、変更しようとすると現在色が起点にならない」。
本設計ではこれを**許容する**（プリセットを差し替える以上、旧色を指し示す手段はもともと無い）。
回帰テストでは「プリセット外の色を持つステータスで色ピッカーを開いても例外が出ず、
変更せずに閉じれば色が保持されること」を固定する。

---

## 7. 周辺の整合

### 7.1 shadcn テーマ変数

**shadcn 変数を独立に定義するのをやめ、すべて `--av-*` への `var()` 参照にする。**
これで色の実値は `--av-*` にしか存在しなくなり、二重管理が構造的に消える。

| shadcn 変数 | 対応 | 備考 |
|---|---|---|
| `--background` | `transparent` | ウィンドウが透過なので背景は器（`.av-glass`）が持つ |
| `--foreground` | `var(--av-text-primary)` | |
| `--card` / `--popover` | `var(--av-surface-raised)` | BlockNote のメニュー類が使う |
| `--card-foreground` / `--popover-foreground` | `var(--av-text-primary)` | |
| `--primary` | `var(--av-accent-solid)` | **現行の `oklch(.205 0 0)`（ほぼ黒）を廃止** |
| `--primary-foreground` | `var(--av-text-on-accent)` | |
| `--secondary` / `--accent` / `--muted` | `var(--av-surface-selected)` | |
| `--secondary-foreground` / `--accent-foreground` | `var(--av-text-primary)` | |
| `--muted-foreground` | `var(--av-text-secondary)` | |
| `--destructive` | `var(--av-danger)` | 一本化 |
| `--border` / `--input` | `var(--av-hairline)` | `* { @apply border-border }` がこれで正しく効く |
| `--ring` | `var(--av-focus-ring)` | |
| `--radius` | `0.625rem` | 据え置き |
| `--sidebar*` | 対応する `--av-*` へ | 未使用だが shadcn CLI が再生成しうるので定義は残す |
| `--chart-1〜5` | **削除** | グラフは無く、ブランド設計書5節も「生産性を誇張するグラフを使わない」としている |

`@theme inline` ブロックはそのまま維持する。Tailwind のユーティリティ生成に必要。

### 7.2 sonner トースト

現行は `theme="light"` 固定 + `bg-white` 固定で、ダークのガラスの上に真っ白な板が乗る。
`useColorScheme` の値で `theme` を駆動し、面は `--av-surface-raised`（**不透明**）にする。
Ink 16.10 ✓ / `#F1F4F8` 12.03 ✓。

### 7.3 ConfirmDialog

| 箇所 | 現状 | 修正 |
|---|---|---|
| オーバーレイ | `bg-black/20`（分岐なし） | `var(--av-scrim)`。ライトは黒ではなく Ink を薄めた膜にしてガラスの寒色と喧嘩させない。ダークは 0.50（0.20 のままだと背面のガラスと区別がつかない） |
| 併記の `backdrop-blur-[2px]` | — | **残す**。これは Web 側スタッキングコンテキスト内をぼかすので 5.1節の no-op とは別物 |
| 本体 | `var(--st-palette-bg)` | `var(--av-surface-raised)`（不透明） |
| 警告アイコン | `text-[#FF3B30]` | `var(--av-danger)` |
| 破棄ボタン | `bg-[#FF3B30] text-white`（**3.55 ✗**） | `var(--av-danger-solid)`（`#CC211B`）→ **5.53 ✓** |

### 7.4 危険色の一本化

危険色の実値は `--av-danger` / `--av-danger-solid` / `--av-danger-subtle` の3つだけに集約する。
`#FF3B30` 直書き（ConfirmDialog 2箇所 / AppSettings 1箇所）を撤去し、shadcn `--destructive` も `var(--av-danger)` を指すだけにする。

`AppSettings.tsx` のエラーボックス `bg-[#FF3B30]/10 text-[#FF3B30]` → 面 `var(--av-danger-subtle)` / 文字 `var(--av-danger)`。
ライト `#CC211B` はカード面で **5.07 ✓**（現行 `#FF3B30` は 4.05 △）。

なお `#FF3B30` は**ステータス色プリセットの「レッド」としては残す**。ステータス色と危険色は別レイヤー。

### 7.5 BlockNote

`.bn-root` のスコープに `--bn-colors-*` をトークンから流し込む。
`data-color-scheme` は `useColorScheme` が返す値で駆動する。

```css
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

スラッシュメニュー選択行は `var(--av-accent-solid)` にする。
現行 `#007aff` は白文字 **4.02 △**、`#0070E4` なら **4.73 ✓**。
あわせて `#007aff` と `#007AFF` の**大文字小文字違いで別リテラルになっていた**問題も消える。

選択行の白文字統一と kbd バッジの `rgba(255,255,255,0.22)` は青地の上での処理としてそのまま有効なので維持する。
ただし `#ffffff` は `var(--av-text-on-accent)` に置き換える。

### 7.6 個別修正

| 箇所 | 現状 | 修正 |
|---|---|---|
| `StatusSettings.tsx` 色ピッカー | `ring-offset-2`（オフセット色が Tailwind 既定＝白。ダークで白い輪） | `outline` + `outline-offset-2` へ。または `ring-offset-[var(--av-surface-raised)]` |
| 同上 | `ring-[var(--st-text-secondary)]` | `ring-[var(--av-focus-ring)]`（選択の指示にアクセント青を使う） |
| `AppSettings.tsx` 自動起動トグル ON | `bg-[#34C759]`（白ノブが **2.22 ✗**） | `var(--av-success)`（`#2B9845`、白ノブ **3.70 ✓**） |
| `AppSettings.tsx` ホットキー取得中 | `bg-[#007AFF]`（**4.02 △**） | `var(--av-accent-solid)`（**4.73 ✓**） |
| `Lane.tsx` 件数 | tertiary | **secondary へ格上げ**（情報であって装飾ではない） |
| `Board.tsx` 空状態サブ行 | tertiary | **secondary へ格上げ** |
| `.st-toggle-off` | `rgba(120,120,128,.32)` 分岐なし | `--av-toggle-off` としてトークン化し、ライト／ダークで分ける |
| トグル OFF の白ノブ | 輪郭なし | **OFF トラックは意図的に低コントラストな面のため、白ノブとの比は 3:1 に届かない**（Apple の純正トグルも同様）。ノブに `box-shadow: 0 1px 2px oklch(0 0 0 / 0.22)` を添えて輪郭で分離する。ON 状態（`--av-success` 上 3.70 ✓）とは扱いが異なる |
| `.st-palette` の `backdrop-filter` | — | **削除**（5.1節・no-op） |

### 7.7 デッドコードの削除

**ユーザー承認済み。以下をすべて削除する。**

- `src/components/ui/button.tsx` — 全体が未使用（`<Button` の参照 0 件）。
  本アプリは全ボタンを手書きしており、残すと `--primary` / `--destructive` の変更に追随できているか誰も検証しないゾーンが残り続ける。
- `src/assets/react.svg` — Vite テンプレートの残骸。参照 0 件。`src/assets/` が空になるならディレクトリごと。
- `public/vite.svg` / `public/tauri.svg` — `index.html` はどちらも読んでいない。ブランド設計書7節の資産一覧にも無い。

**注意**: `components.json` があるため `npx shadcn add` を実行すると `ui/button.tsx` も `:root` の shadcn 変数も再生成されうる。
CLI 実行後は必ず差分を確認する運用とし、README に一行足す。

---

## 8. コントラスト検証表

すべて 5.6節の合成モデルで実測した値。判定は AA本文 4.5:1 / AA大文字・非文字 3:1。
**太字は最悪ケース**。

### 8.1 ライトモード

| 前景 | ガラス面（黒壁紙 `#DCDDDE`） | ガラス面（白壁紙 `#FBFCFE`） | カード面（黒壁紙 `#F5F5F6`） | カード面（白壁紙 `#FEFEFF`） | 判定 |
|---|---|---|---|---|---|
| `--av-text-primary` Ink `#11213B` | **11.84** ✓ | 15.71 ✓ | 14.79 ✓ | 15.99 ✓ | AA |
| `--av-text-secondary` Slate `#52627A` | **4.56** ✓ | 6.05 ✓ | 5.70 ✓ | 6.16 ✓ | AA |
| `--av-text-muted` `#707A89` | **3.19** △ | 4.03 △ | 3.99 △ | 4.09 △ | 3:1 のみ（装飾限定） |
| `--av-accent-text` `#005DC2` | **4.58** ✓ | 6.10 ✓ | 5.76 ✓ | 6.23 ✓ | AA |
| `--av-danger` `#CC211B` | **4.03** △ | 5.36 △ | 5.07 ✓ | 5.48 ✓ | カード面で AA |
| 白 on `--av-accent-solid` `#0070E4` | 4.73 ✓ | 4.73 ✓ | 4.73 ✓ | 4.73 ✓ | AA（面非依存） |
| 白 on `--av-danger-solid` `#CC211B` | 5.53 ✓ | 5.53 ✓ | 5.53 ✓ | 5.53 ✓ | AA |
| 白ノブ on `--av-success` `#2B9845` | 3.70 △ | 3.70 △ | 3.70 △ | 3.70 △ | 非文字 3:1 |

`--av-danger` はガラス面直置きで 4.03 と AA に届かない。**エラー文はカード面／`--av-danger-subtle` の上に置く**こと。

### 8.2 ダークモード

| 前景 | ガラス面（黒壁紙 `#0C1016`） | ガラス面（白壁紙 `#23272C`） | カード面（黒壁紙 `#1F242C`） | カード面（白壁紙 `#272C34`） | 判定 |
|---|---|---|---|---|---|
| `--av-text-primary` `#F1F4F8` | 17.27 ✓ | **13.62** ✓ | 14.13 ✓ | 12.72 ✓ | AA |
| `--av-text-secondary` `#AFB6C1` | 9.36 ✓ | **7.36** ✓ | 7.63 ✓ | 6.87 ✓ | AA |
| `--av-text-muted` `#8B939F` | 6.16 ✓ | **4.84** ✓ | 5.03 ✓ | 4.53 ✓ | AA |
| `--av-accent-text` `#7DBAFF` | 9.38 ✓ | **7.48** ✓ | 7.69 ✓ | 6.91 ✓ | AA |
| `--av-danger` `#FF6961` | 6.75 ✓ | **5.39** ✓ | 5.53 ✓ | 4.98 ✓ | AA |
| 白 on `--av-accent-solid` | 4.73 ✓ | 4.73 ✓ | 4.73 ✓ | 4.73 ✓ | AA |

### 8.3 選択カード（案A）

| 条件 | 選択面 | 文字（accent-text） | リング vs 隣接カード | リング vs 選択面 | 判定 |
|---|---|---|---|---|---|
| ライト・黒壁紙 | `#D9E7F7` | 5.00 ✓ | 4.34 ✓ | 3.77 ✓ | AA + 3:1 |
| ライト・白壁紙 | `#E1EFFF` | 5.38 ✓ | 4.69 ✓ | 4.05 ✓ | AA + 3:1 |
| ダーク・黒壁紙 | `#1C334E` | 6.33 ✓ | 4.27 ✓ | 3.53 ✓ | AA + 3:1 |
| ダーク・白壁紙 | `#223A54` | 5.74 ✓ | 3.85 ✓ | 3.20 ✓ | AA + 3:1 |

### 8.4 ステータスチップ（8色すべて・最悪面）

| モード | 式 | 最小 | グレー | ティール | オレンジ | グリーン | レッド | インディゴ | パープル | ピンク |
|---|---|---|---|---|---|---|---|---|---|---|
| ライト | `mix(status 45%, Ink)` on `mix(status 14%, card)` | **4.83 ✓** | 6.36 | 4.83 | 5.48 | 5.26 | 7.03 | 6.90 | 7.09 | 7.15 |
| ダーク | `mix(status 45%, #fff)` on `mix(status 22%, card)` | **6.00 ✓** | 6.30 | 6.56 | 6.50 | 6.46 | 6.08 | 6.00 | 6.12 | 6.02 |
| （参考）現行 | 生の status 色 on `status 12%` | **1.63 ✗** | — | — | — | — | — | — | — | — |

### 8.5 現行実装の失格一覧（before）

| 箇所 | 組み合わせ | 比 | 結果 |
|---|---|---|---|
| `TaskCard.tsx` | 白 on ステータス色 ×8 | 1.90〜4.28 | **8/8 失格** |
| `TaskDetail.tsx` チップ | ステータス色 on 同色12% | 最小 1.63 | **失格** |
| `ConfirmDialog.tsx` 破棄ボタン | 白 on `#FF3B30` | 3.55 | 失格 |
| `AppSettings.tsx` 取得中ボタン | 白 on `#007AFF` | 4.02 | 失格 |
| `AppSettings.tsx` トグル | 白ノブ on `#34C759` | 2.22 | 失格（非文字 3:1 も割る） |
| `index.css` スラッシュメニュー | 白 on `#007aff` | 4.02 | 失格 |
| `--st-text-tertiary` `#a1a1a6` | 新ガラス面上 | 1.89 | 失格 |
| `--st-text-secondary` `#6e6e73` | 新ガラス面上 | 3.73 | 失格 |

---

## 9. ブランド設計書への追記

本設計は、ブランド設計書4節「Liquid Glass の使い方」の解釈を確定させる。
字面の「ガラスを背景全面に多用しない」と本設計の「パレットの器をガラスにする」が衝突して見えるため、
`2026-08-20-avoliq-brand-design.md` の第4節に以下を追記する。

> ### Avoliq アプリにおける適用
>
> Avoliq のパレットはデスクトップの上に浮く単一の面であり、これ自体が「前面に浮く重要な一要素」にあたる。
> したがって**パレットの器はガラスとして表現してよい**。
> 禁じるのはその内側での多用であり、タスクカード・ダイアログ・トースト・エディタのメニューにガラスを使わない。
> ガラスの上にガラスを重ねると屈折が二乗になって濁るため、内側の浮きものはすべて不透明な面で置く。

---

## 10. テスト方針

- **既存テストへの影響**: テストは `--st-*` も `st-*` クラスも参照していないため、トークン改名だけでは1件も壊れない。
- **Rust**: `DEFAULT_STATUSES` の「進行中」を `#5AC8FA` に変えるため、`repo.rs` のユニットテストの期待値更新が必要。
  `design/status-presets.json` からの読み込みに変えるため、JSON のパース失敗が起きないことを検証するテストを足す。
- **TS**: `src/test/fixtures.ts` と各 `*.test.tsx` に4色が手書きで再掲されている。
  プリセット差し替えに伴い、`#007AFF` を使っているテストの期待値を更新する。
- **プリセット外の色**: 既存ボードに残る `#007AFF` を持つステータスで色ピッカーを開いても例外が出ず、
  変更せずに閉じれば色が保持されることを回帰テストで固定する（6.5節）。
- **`useColorScheme`**: `matchMedia` の変化で `documentElement` の `.dark` がトグルすることを検証する。
- **ガラスの見た目**: 自動テストの対象外。手動スモークで確認する（11節）。

---

## 11. 手動スモークチェックリスト

**本設計で唯一「計算では詰めきれない」のが vibrancy の実機での見えである。**
5.6節の合成モデル（ライト白 0.72 / ダーク黒 0.78 相当）が実測とズレた場合、8節の検証表を再計算すること。

- [ ] ライトモード・黒い壁紙の上でパレットを開き、レーン名（secondary）が読めるか
- [ ] ライトモード・白い壁紙で、パレットの輪郭が背景に溶けていないか
- [ ] ダークモード・白い壁紙の上で、カードの文字が読めるか
- [ ] 派手な壁紙（彩度の高い写真）の上で色被りが許容範囲か
- [ ] パレットの角丸が 16px で揃い、効果ビューがはみ出していないか
- [ ] **角の縁がざらついていないか**（`popover` 素材の二重マスク懸念の検証。5.2節。
      ざらついていたら `windowEffects.effects` を `["hudWindow"]` に変えて再確認する）
- [ ] 影が丸角に沿っているか（四角くなっていないか）
- [ ] 他アプリにフォーカスがある状態でパレットを出し、素材が灰色に濁らないか（`Active` の検証）
- [ ] ダークのシステムで起動時に白く光らないか（FOUC の検証）
- [ ] `data-vibrancy="off"` を手動で付けた状態で UI が読めるか（フォールバックの検証）
- [ ] 選択カードのリングが隣接カードと明確に分離して見えるか
- [ ] `* { @apply border-border }` の復活で意図しない枠線が出ていないか

---

## 12. 実装順序

配色は相互依存が強く、部分適用すると中間状態が現行より悪化する。以下の順で1つずつ検証する。

1. **`.dark` クラス基盤の一本化**（4節）— 先にこれを入れないと以降の値が検証できない
2. **`--av-*` トークン定義の追加と shadcn 変数の付け替え**（3節 / 7.1節）。`--st-*` は当面 `--av-*` のエイリアスとして残す
3. **ガラスの CSS 層と退避弁**（5節）。ネイティブ側は `windowEffects` で実装済みなので、
   角丸の定数化と CSS の作り込みが対象 — **実機スクリーンショットで 5.6節の合成モデルを検証する**
4. **コンポーネント側の `--st-*` → `--av-*` 機械置換とエイリアス撤去**
5. **選択カード案A・ステータスチップ・`color-mix` 化**（6.3 / 6.4節）
6. **sonner / ConfirmDialog / BlockNote**（7.2〜7.5節）
7. **ステータスプリセット差し替えと JSON 共有**（6.2 / 6.5節）— Rust / TS 両方のテスト期待値更新が要る
8. **デッドコード整理**（7.7節）
9. **ブランド設計書への追記**（9節）

---

## 13. リスクと落とし穴

1. **ぼかしは可読性の土台であり、装飾ではない（最重要）**
   CSS 層だけ（ぼかしなし・アルファ 0.56）で黒壁紙に置くと、実効背景は `#818284` になり
   **Slate が 1.61:1**、Ink ですら 4.18。**UI が読めなくなる。**
   `windowEffects` を外す・無効化する変更を入れるときは、必ず 5.6節の退避弁とセットで行うこと。

2. **`16` を3箇所で揃える**
   `tauri.conf.json` の `windowEffects.radius` / `panel.set_corner_radius(…)` / CSS `border-radius: 16px`。
   1つでもズレると角がはみ出るか影が四角くなる。

3. **`state` の既定値が罠**
   `followsWindowActiveState` のままだと `nonactivating_panel` との組み合わせでパレットが出るたび灰色に濁る。
   `"active"` を明示する（設定済み）。この行を消さないこと。

4. **`StyleMask` の適用順序（既存の罠・維持すること）**
   `borderless()` → `nonactivating_panel()` の順。vibrancy を足すときにこの行を触らない。

5. **`color-mix` の色空間指定**
   本書の全数値は `in srgb` 前提。`in oklab` に変えると値が動くので、変更するなら 8節を再計算すること。

6. **`* { @apply border-border }` の副作用**
   `.dark` が付くと、これまで死んでいたこの一行が全要素で生き返る。目視スモークが要る。

7. **`shadcn add` による再生成**
   `components.json` が残っているため CLI 実行で `:root` の shadcn 変数が上書きされ、7.1節の `var()` 参照が直値に戻る。

8. **`#007aff` と `#007AFF` の大小文字**
   移行中に grep で色を追うときは `-i` を付けること。

9. **oklch の下限**
   WKWebView は macOS 12.3+ が必要。既に `:root` が oklch なので新たなリスクではないが、
   `tauri.conf.json` に最低 OS バージョンを明記していない点は別途の課題とする。

---

## 14. 却下した代替案

| 案 | 却下理由 |
|---|---|
| `--st-*` を名前ごと維持 | 改名が済んだ他レイヤーと不整合。移行コストが実質ゼロ（テスト参照 0 件）と確認できたので、残す理由が無くなった |
| 色値を hex で統一 | shadcn 側が oklch のため必ず混在する。同一色相ランプの関係が hex では読めない |
| `sidebar` 素材 | 最も「ガラスらしい」が透過が強く、派手壁紙で Slate が 3:1 を割る。可読性の土台にならない |
| `underWindowBackground` 素材 | ウィンドウ背後のコンテンツ向け素材。前面に浮くパネルでは意図した見えにならない |
| `window-vibrancy` クレートの導入 | Tauri v2 が `windowEffects` を組み込みで持っており、外部クレートは冗長。既に `windowEffects` で動いているものを置き換える理由がない。`Result` を拾って自動フォールバックできる利点はあるが、macOS 専用アプリでは失敗経路が実質存在しない（5.6節） |
| `hudWindow` 素材（当初の推奨） | NSPanel との相性という論拠は妥当だが、既に `popover` で動いている。素材差し替えの根拠は実機での角のざらつきの有無であり、机上では決着しない。11節のスモークで確認し、問題が出た場合にのみ切り替える |
| CSS `backdrop-filter` でデスクトップをぼかす | 透過 WebView の下（ネイティブ層）には届かない。完全な no-op |
| タスクカードもガラスにする | ガラス×ガラスで屈折が二乗になり濁る。ブランド設計書4節に反する |
| ステータス8色をブランド調和色に置換 | ブランド設計書5節が「主パレットへ持ち出さない」＝隔離を求めており、調和は要求されていない。既存ボードの色は変わらないので効果も無い |
| 選択カード案C（ステータス色の淡面＋暗い同系色文字） | プリセット8色では AA を通る（最小 4.83）が、ステータス色は**ユーザー入力**。Ink 近傍の暗色を入れられると文字と面が同化する。固定混色比では保証不能 |
| 選択カード案B を第一候補にする | 任意色で 4.58:1 が数学的に保証される点は優秀だが、4レーンの盤面で原色ベタ塗りは騒がしく、ブランド人格「静かで、上質だが見せびらかさない」に反する。検証済みの退避先として 6.3節に残す |
| `#0A84FF` に白文字を載せる（Apple 準拠） | 3.65:1 で AA 不合格。Apple 自身のコントラスト妥協を踏襲しない。塗り用は `#0070E4` へ分離し、`#0A84FF` は文字を載せない用途でブランド正典として維持する |
| ダークで `#0A84FF` を明るく振る | `#0A84FF` は systemBlue のダーク版そのもので、ダーク面上では十分明るい。問題は白文字の側にあった |
| Tauri コマンド `status_presets()` で Rust を唯一の源にする | 二重管理は解消できるがピッカー描画に非同期ロードが挟まる。JSON 共有の方が安く同じ保証が得られる |
| `--chart-1〜5` を残す | グラフが無く、ブランド設計書5節も生産性グラフを禁じている。死に変数は将来の色監査のノイズになる |
| アプリ内テーマ切替 UI を持つ | キーボードだけで完結する常駐ユーティリティに設定項目を増やすのは、コンセプトの「迷わせない」に反する。OS 追従のみとする |

---

## 15. 受け入れ基準

- [ ] `--st-*` および `st-*` ユーティリティクラスがコードベースに 1件も残っていない
- [ ] 色の実値（hex / oklch リテラル）が `--av-*` の定義ブロック以外に存在しない（ステータスプリセット JSON を除く）
- [ ] Avoliq Blue `#0A84FF` が `--av-blue-500` として実在し、選択リング・フォーカスリングに使われている
- [ ] `.dark` クラスが `documentElement` に付き、`@media (prefers-color-scheme: dark)` ブロックが `index.css` から消えている
- [ ] `usePrefersDark` が `useColorScheme` に統合され、`matchMedia` の購読者が 1箇所だけになっている
- [ ] `windowEffects` が `state: "active"` と `radius: 16` を保ったまま残っている
- [ ] `data-vibrancy="off"` を手で付けるとガラスが実質不透明へ退避する
- [ ] `backdrop-filter` が `.av-glass` から削除されている
- [ ] 角丸 16 が `tauri.conf.json` / `panel.rs` の定数 / CSS の3箇所で揃っている
- [ ] 選択カードがステータス色でベタ塗りされておらず、白文字固定が消えている
- [ ] hex 文字列連結によるアルファ生成（`${color}59` 形式）がコードベースに残っていない
- [ ] ステータスプリセットが `design/status-presets.json` 単一ソースになり、Rust / TS の二重管理が消えている
- [ ] 新規ボードの「進行中」の既定色が `#5AC8FA` になっている
- [ ] 既存ボードの `statuses.color` を書き換えるマイグレーションが存在しない
- [ ] sonner トーストがダークモードで暗い面になる
- [ ] `ui/button.tsx` / `react.svg` / `vite.svg` / `tauri.svg` が削除されている
- [ ] ブランド設計書4節に Avoliq における適用の追記がある
- [ ] 8節の検証表にある組み合わせが、実装後の実測値と一致する
- [ ] vitest / cargo test / `npm run build` / `tsc` がすべて通る
- [ ] 11節の手動スモークチェックリストが全項目クリアしている
