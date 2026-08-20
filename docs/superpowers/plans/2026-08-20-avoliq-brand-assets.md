# Avoliq Brand Assets Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** AvoliqのLiquid Glassブランドを表す、検証済みのアプリアイコンと横組みロゴPNGを`design/`へ追加する。

**Architecture:** 画像生成ツールで文字を含まないガラスのチェックマークを高解像度で生成し、静的アイコンとして保存する。ロゴは同じマークと正確な`Avoliq`表記を透明背景のPNGへ組み合わせ、名称の文字化けを検査してから採用する。

**Tech Stack:** built-in image generation、PNG、macOS `sips`（寸法・アルファチャンネル検証）

**Spec:** `docs/superpowers/specs/2026-08-20-avoliq-brand-design.md`

## Global Constraints

- 正式名は `Avoliq`、読みはアヴォリックとする。
- ブランドの約束は「直感的に、自然に思考を整え、次へ進める。」である。
- Avoliq Blueは `#0A84FF`、背景はMist `#F5F7FB`、文字はInk `#11213B` とする。
- マークは丸みのある正方形の中の、青い一筆のガラスチェックだけとする。
- 半透明の尾、補助線、複数色のレーン、粒子、絵文字、操作キー、キーキャップ、ショートカット表記を主ビジュアルに含めない。
- Glass Azure `#66BEFF` とGlass Violet `#615EFF` はガラス内部の弱い屈折だけに使い、独立したアクセント色として使わない。
- 既存のTauriアイコン、アプリ実装、設定ファイルを変更しない。
- 生成画像を既存ファイルへ上書きしない。対象ファイルが存在した場合は作業を止めてユーザーへ確認する。

---

### Task 1: アプリアイコンを生成・検証する

**Files:**
- Create: `design/avoliq-app-icon.png`
- Read: `docs/superpowers/specs/2026-08-20-avoliq-brand-design.md`

**Interfaces:**
- Consumes: ブランド設計書の「シンボルマーク」「カラーシステム」「Liquid Glass の使い方」。
- Produces: 1024×1024px、PNG、静的背景を持つアプリアイコン。

- [ ] **Step 1: 出力先が未作成であることを確認する**

Run: `test ! -e design/avoliq-app-icon.png`

Expected: exit code 0。ファイルがある場合は生成を始めず、ユーザーへ上書き確認を求める。

- [ ] **Step 2: 文字を含まないアイコンを生成する**

Use the built-in image generation tool with this prompt:

```text
Use case: logo-brand
Asset type: macOS app icon, 1024px square PNG
Primary request: Create a polished original app icon for Avoliq, a calm macOS task app that helps people intuitively organize thought and move naturally to the next step.
Scene/backdrop: a clean near-white frosted glass square with large rounded corners, with a restrained Apple-inspired Liquid Glass optical depth inside the icon.
Subject: one simple, centered check mark, drawn as a single rounded continuous stroke. It is the sole symbol and represents thought flowing into action, not a celebratory completion badge.
Style/medium: premium contemporary macOS app icon, static glass material, soft internal refraction, subtle specular highlight, restrained inner shadow, crisp silhouette.
Composition/framing: centered mark with generous padding; mark remains immediately legible at 32px.
Lighting/mood: quiet, clear, natural, confident.
Color palette: Avoliq Blue #0A84FF is the main color. Very subtle internal refraction may use pale azure #66BEFF and a trace of pale violet #615EFF. Background base is Mist #F5F7FB.
Text (verbatim): ""
Constraints: no lettering, no wordmark, no keyboard symbols, no keycaps, no command or option symbols, no secondary strokes, no translucent tail ahead of the check, no multicolor lanes, no particles, no emoji, no device mockup, no shadow outside the icon, no watermark.
Avoid: busy glassmorphism, clutter, dark backgrounds, gradients that obscure the check mark, generic check badge styling.
```

- [ ] **Step 3: 生成結果を視覚確認する**

Confirm all of the following before accepting the result:

1. チェック以外の記号、文字、キーキャップがない。
2. チェックが一筆で読め、先端に半透明の尾がない。
3. 青以外の色が主役になっていない。
4. ガラス感が、過剰な装飾ではなく控えめな屈折とハイライトで表現されている。

- [ ] **Step 4: 選んだPNGを`design/avoliq-app-icon.png`へ保存する**

Copy the selected generated image from the tool output directory into `design/avoliq-app-icon.png` without changing any existing application icon file.

- [ ] **Step 5: 寸法とPNG形式を検証する**

Run: `sips -g pixelWidth -g pixelHeight -g format design/avoliq-app-icon.png`

Expected: `pixelWidth: 1024`、`pixelHeight: 1024`、`format: png`。

### Task 2: 正確なワードマークを含む横組みロゴを生成・検証する

**Files:**
- Create: `design/avoliq-logo.png`
- Read: `design/avoliq-app-icon.png`
- Read: `docs/superpowers/specs/2026-08-20-avoliq-brand-design.md`

**Interfaces:**
- Consumes: Task 1の確定マーク、正式表記`Avoliq`、ブランド設計書の書体・配色ルール。
- Produces: 透明背景の横組みロゴPNG。マークと`Avoliq`表記だけを含む。

- [ ] **Step 1: 出力先が未作成であることを確認する**

Run: `test ! -e design/avoliq-logo.png`

Expected: exit code 0。ファイルがある場合は生成を始めず、ユーザーへ上書き確認を求める。

- [ ] **Step 2: 透明背景用のロゴ素材を生成する**

Use the built-in image generation tool with this prompt:

```text
Use case: logo-brand
Asset type: horizontal app logo asset for a macOS productivity application
Primary request: Create a clean horizontal logo for the brand Avoliq. Place a small rounded-square Liquid Glass icon containing one simple blue rounded check mark to the left of the exact wordmark.
Scene/backdrop: perfectly flat solid #00ff00 chroma-key background for removal. The background must be a single uniform color with no shadows, gradients, reflections, or texture.
Subject: the same quiet Avoliq Liquid Glass check icon, paired with the exact wordmark "Avoliq".
Style/medium: premium Apple-inspired system typography, SF Pro-like rounded sans-serif wordmark, medium weight, slightly tight tracking, deep Ink #11213B text. The small icon has Avoliq Blue #0A84FF, restrained white glass highlights, and no extra decoration.
Composition/framing: horizontal lockup with generous transparent-safe padding around all edges; icon and wordmark vertically aligned.
Lighting/mood: calm, precise, natural.
Text (verbatim): "Avoliq"
Constraints: render only the exact text "Avoliq" with capital A and lowercase voliq; no tagline; no keyboard symbols; no keycaps; no secondary mark; no translucent tail; no multicolor lanes; no watermark.
Avoid: misspelled text, alternate words, serif type, black background, generic badge, shadows on the chroma-key background.
```

- [ ] **Step 3: 文字と構図を視覚確認する**

Confirm all of the following before accepting the result:

1. 表記が厳密に `Avoliq` であり、文字の欠落、追加、置換がない。
2. マークはTask 1と同じ一筆チェックの思想を保つ。
3. 操作キー、キーキャップ、タグライン、余計な文言がない。
4. 背景が均一な`#00ff00`で、マークと文字に緑色が含まれない。

- [ ] **Step 4: クロマキーを透明化してPNGを保存する**

Run:

```bash
AVOLIQ_LOGO_SOURCE="/absolute/path/reported-by-the-image-generation-tool.png"
python "${CODEX_HOME:-$HOME/.codex}/skills/.system/imagegen/scripts/remove_chroma_key.py" \
  --input "$AVOLIQ_LOGO_SOURCE" \
  --out design/avoliq-logo.png \
  --auto-key border \
  --soft-matte \
  --transparent-threshold 12 \
  --opaque-threshold 220 \
  --despill
```

Expected: `design/avoliq-logo.png`が作成され、背景だけが透明になる。

- [ ] **Step 5: PNG、アルファチャンネル、透明な四隅を検証する**

Run: `sips -g format -g hasAlpha design/avoliq-logo.png`

Expected: `format: png` と `hasAlpha: yes`。

Inspect the final image and confirm that four corners are transparent, the wordmark remains exact, and no green fringe remains around the mark or characters.

### Task 3: 成果物と設計書の整合を最終確認する

**Files:**
- Read: `design/avoliq-app-icon.png`
- Read: `design/avoliq-logo.png`
- Read: `docs/superpowers/specs/2026-08-20-avoliq-brand-design.md`

**Interfaces:**
- Consumes: Task 1とTask 2の最終PNG、ブランド設計書。
- Produces: ユーザーに渡せる、要件を満たしたデザイン資産セット。

- [ ] **Step 1: アイコンを実寸と縮小表示で確認する**

Inspect `design/avoliq-app-icon.png` at original size and at 32px-equivalent display. Confirm the check silhouette remains understandable and its glass effect does not introduce a second mark.

- [ ] **Step 2: ロゴを明暗の背景で確認する**

Inspect `design/avoliq-logo.png` on a white background and a Mist `#F5F7FB` background. Confirm the Ink wordmark remains readable and transparent edges are clean.

- [ ] **Step 3: 禁止事項を再確認する**

Run: `find design -maxdepth 1 -type f -name 'avoliq-*.png' -print`

Expected: `design/avoliq-app-icon.png` と `design/avoliq-logo.png` の2件が存在する。

Visually confirm that neither file includes operation-key symbols, keycaps, translucent check tails, multicolor lanes, particles, emoji, or unapproved text.

- [ ] **Step 4: 変更範囲を確認する**

Run: `git status --short`

Expected: `design/`の2つのPNGと、承認済みの設計書・この計画書だけが今回の変更として現れる。`src-tauri/icons/`、アプリ実装、設定ファイルには変更がない。
