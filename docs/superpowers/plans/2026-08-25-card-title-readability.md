# カードタイトルの可読性 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ボードのカードタイトルが1行で切れて判別できない問題（Issue #3）を、ウィンドウ幅の拡大・タイトルの2行表示・レーンの最小幅と横スクロールの3点で解消する。

**Architecture:** 表示ロジックの追加はなく、すべてTailwindのクラス変更とTauriのウィンドウ設定値の変更で完結する。jsdomは実寸（`clientWidth` / `offsetWidth`）が常に0で文字数を検証できないため、自動テストは**クラスの有無と `scrollIntoView` の呼び出し引数**を回帰テストとして固定し、見た目は手動スモークで確認する。

**Tech Stack:** React 19 / TypeScript / Tailwind CSS v4 / Vitest + Testing Library / Tauri v2

**設計書:** `docs/superpowers/specs/2026-08-25-card-title-readability-design.md`

---

## ファイル構成

| ファイル | 役割 | 変更内容 |
|---|---|---|
| `src/components/TaskCard.tsx` | カード1枚の描画 | タイトルを `line-clamp-2` に、ドットを1行目の中心へ、`scrollIntoView` に `inline` を追加 |
| `src/components/TaskCard.test.tsx` | 上記の回帰テスト | describe を2つ追加 |
| `src/components/Lane.tsx` | レーン1本の描画 | `min-w-0` → `min-w-[160px]` |
| `src/components/Board.tsx` | レーンを並べる器 | `overflow-hidden` → `overflow-x-auto overflow-y-hidden` |
| `src/components/Board.test.tsx` | 上記の回帰テスト | it を2つ追加 |
| `src-tauri/tauri.conf.json` | ウィンドウ設定 | `width` 720 → 880 |

新規作成するファイルはない。

---

### Task 1: カードタイトルを2行まで表示する

**Files:**
- Modify: `src/components/TaskCard.tsx:64-67`
- Test: `src/components/TaskCard.test.tsx`

- [ ] **Step 1: 失敗するテストを書く**

`src/components/TaskCard.test.tsx` の末尾に、次の describe をまるごと追加する。
ファイル先頭の import はすべて既存のものでまかなえる（`initialAppState`・`makeTask`・
`tags as tagFixtures` はすでに import 済み）ので、import 行は増やさない。

```tsx
describe("TaskCard のタイトル表示", () => {
  beforeEach(() => {
    useAppStore.setState({ ...initialAppState, tags: tagFixtures });
  });

  it("長いタイトルは2行まで表示する(回帰テスト: truncateだと1行で切れて何のタスクか判別できない)", () => {
    const task = makeTask("t-long", "st-todo", "認証まわりのリファクタリングをやる", 0);

    render(<TaskCard task={task} statusColor="#007AFF" selected={false} />);

    const title = screen.getByText("認証まわりのリファクタリングをやる");
    expect(title).toHaveClass("line-clamp-2");
    expect(title).not.toHaveClass("truncate");
  });

  it("切れ目の無い文字列でも折り返す(回帰テスト: truncateのwhitespace-nowrapが外れるので折り返し規則を明示する)", () => {
    const task = makeTask("t-url", "st-todo", "https://example.com/very/long/path", 0);

    render(<TaskCard task={task} statusColor="#007AFF" selected={false} />);

    expect(screen.getByText("https://example.com/very/long/path")).toHaveClass(
      "break-words",
    );
  });

  it("ステータスドットは1行目の中心に置く(回帰テスト: items-centerだと2行のとき行間に落ちる)", () => {
    const task = makeTask("t-long2", "st-todo", "認証まわりのリファクタリングをやる", 0);

    const { container } = render(
      <TaskCard task={task} statusColor="#007AFF" selected={false} />,
    );

    const dot = container.querySelector(".av-status-dot") as HTMLElement;
    expect(dot).toHaveClass("mt-[6px]");
    expect(dot.parentElement).toHaveClass("items-start");
  });
});
```

- [ ] **Step 2: テストを走らせて失敗を確認する**

Run: `npm test -- src/components/TaskCard.test.tsx -t "TaskCard のタイトル表示"`

Expected: 3件とも FAIL。
1件目は `expect(element).toHaveClass("line-clamp-2")` で
「Expected the element to have class: line-clamp-2 / Received: min-w-0 truncate」。

- [ ] **Step 3: 最小限の実装を書く**

`src/components/TaskCard.tsx` のタイトル行（現在64〜67行目）を次のように置き換える。

変更前:

```tsx
      <div className="flex items-center gap-2">
        <span className="av-status-dot h-1.5 w-1.5 shrink-0 rounded-full" />
        <span className="min-w-0 truncate">{task.title}</span>
      </div>
```

変更後:

```tsx
      {/* タイトルは line-clamp-2 で最大2行。1レーン約165〜205pxでは1行だと
          10文字前後で切れて何のタスクか判別できないため（Issue #3）。
          短いタイトルは1行のままなので、レーンに収まるカード数はほとんど減らない。
          break-words を併記するのは、truncate が持っていた whitespace-nowrap が
          外れることで、URLのような切れ目の無いタイトルが横にはみ出すのを防ぐため。 */}
      <div className="flex items-start gap-2">
        {/* mt-[6px] はドットを1行目の中心に固定するためのもの。items-start にしないと
            2行のときドットが上下中央（＝行間）に落ちる。
            6px = (13px × leading-snug 1.375 − ドット6px) ÷ 2 */}
        <span className="av-status-dot mt-[6px] h-1.5 w-1.5 shrink-0 rounded-full" />
        <span className="min-w-0 break-words line-clamp-2">{task.title}</span>
      </div>
```

- [ ] **Step 4: テストを走らせて成功を確認する**

Run: `npm test -- src/components/TaskCard.test.tsx`

Expected: 追加した3件を含め、このファイルのテストがすべて PASS。

- [ ] **Step 5: コミットする**

```bash
git add src/components/TaskCard.tsx src/components/TaskCard.test.tsx
git commit -m "fix: カードのタイトルを2行まで表示して判別できるようにする"
```

---

### Task 2: レーン数が増えても読める幅を保つ

**Files:**
- Modify: `src/components/Lane.tsx:16`
- Modify: `src/components/Board.tsx:71`
- Test: `src/components/Board.test.tsx`

- [ ] **Step 1: 失敗するテストを書く**

`src/components/Board.test.tsx` の `describe("Board", ...)` の中に、次の2件を追加する。
`setupBoard` は同ファイル内にすでに定義されているものをそのまま使う。

```tsx
  it("レーンは縮んでも最小幅を保つ(回帰テスト: min-w-0だとステータスを増やすほど潰れて読めなくなる)", () => {
    setupBoard();
    render(<Board />);
    // 880px幅なら5レーンまでは各161.6pxで収まり、6レーン以降はこの幅を保ったまま横スクロールする
    expect(screen.getAllByTestId("lane")[0]).toHaveClass("min-w-[160px]");
  });

  it("レーンが収まらないときはボードを横スクロールさせる", () => {
    setupBoard();
    render(<Board />);
    const board = screen.getByTestId("board");
    expect(board).toHaveClass("overflow-x-auto");
    // 縦は各レーンの内側(Laneのoverflow-y-auto)が持つので、ボード自体は隠したままにする
    expect(board).toHaveClass("overflow-y-hidden");
  });
```

- [ ] **Step 2: テストを走らせて失敗を確認する**

Run: `npm test -- src/components/Board.test.tsx -t "最小幅"`

Expected: FAIL。「Expected the element to have class: min-w-[160px] / Received: flex flex-1 min-w-0 flex-col」。

- [ ] **Step 3: `Lane.tsx` を修正する**

`src/components/Lane.tsx` の `return (` 直前に理由のコメントを置き、
`<section>` の `className`（現在16行目）を差し替える。
JSXの属性の並びの途中にはコメントを書けないため、コメントは `return` の手前に置く。

変更前:

```tsx
export function Lane({ status, tasks, selectedTaskId }: LaneProps) {
  return (
    <section
      data-testid="lane"
      data-status-id={status.id}
      className="flex flex-1 min-w-0 flex-col"
    >
```

変更後:

```tsx
export function Lane({ status, tasks, selectedTaskId }: LaneProps) {
  // レーンの幅は min-w-0 ではなく min-w-[160px]。min-w-0 はコンテンツ幅より
  // 小さく縮めるために置かれていたが、下限が無いためステータスを増やすほど
  // レーンが潰れる（8レーンで約95px＝2〜3文字で折り返し、実質読めない）。
  // 160px は 880px 幅で5レーンまで横スクロールせずに収まる最大の丸い値
  // （160×5 + gap 48 + padding 24 = 872 ≤ 880）。
  // このときタイトル幅は 160 − 24 − 14 = 122px で、2行なら約19文字。
  return (
    <section
      data-testid="lane"
      data-status-id={status.id}
      className="flex flex-1 min-w-[160px] flex-col"
    >
```

- [ ] **Step 4: `Board.tsx` を修正する**

`src/components/Board.tsx` の最後の `<div data-testid="board">`（現在71行目）を
次のように置き換える。

変更前:

```tsx
    <div data-testid="board" className="flex flex-1 gap-3 overflow-hidden px-3 py-3">
```

変更後:

```tsx
    // レーンが最小幅を下回れないため、ステータスが多いとここが横にあふれる。
    // 縦は各レーン(Laneのoverflow-y-auto)が持つので、ボード自体は横だけスクロールさせる。
    <div
      data-testid="board"
      className="flex flex-1 gap-3 overflow-x-auto overflow-y-hidden px-3 py-3"
    >
```

- [ ] **Step 5: テストを走らせて成功を確認する**

Run: `npm test -- src/components/Board.test.tsx`

Expected: 追加した2件を含め、このファイルのテストがすべて PASS。

- [ ] **Step 6: コミットする**

```bash
git add src/components/Lane.tsx src/components/Board.tsx src/components/Board.test.tsx
git commit -m "fix: レーンに最小幅を与えてステータスを増やしても潰れないようにする"
```

---

### Task 3: 横スクロール時に選択カードを画面内へ追従させる

**Files:**
- Modify: `src/components/TaskCard.tsx:25`
- Test: `src/components/TaskCard.test.tsx`

Task 2 でボードが横スクロールするようになったため、`⌘←` `⌘→` でステータスを
変更したとき、移動先のレーンが表示範囲の外にありうる。現在の
`scrollIntoView({ block: "nearest" })` は縦方向しか見ないので、選択カードが
画面外に取り残される。

- [ ] **Step 1: 失敗するテストを書く**

`src/components/TaskCard.test.tsx` の末尾に、次の describe をまるごと追加する。
`vi` はファイル先頭ですでに import 済みなので import 行は増やさない。

```tsx
describe("TaskCard の選択追従", () => {
  beforeEach(() => {
    useAppStore.setState({ ...initialAppState, tags: tagFixtures });
    // setup-vitest.ts が Element.prototype.scrollIntoView を vi.fn() に差し替えている
    vi.mocked(Element.prototype.scrollIntoView).mockClear();
  });

  it("選択されたカードは縦にも横にも画面内へ寄せる(回帰テスト: inlineが無いと横スクロール時に画面外へ残る)", () => {
    const task = makeTask("t-sel", "st-todo", "タスク", 0);

    render(<TaskCard task={task} statusColor="#007AFF" selected />);

    expect(Element.prototype.scrollIntoView).toHaveBeenCalledWith({
      block: "nearest",
      inline: "nearest",
    });
  });

  it("選択されていないカードはスクロールさせない", () => {
    const task = makeTask("t-unsel", "st-todo", "タスク", 0);

    render(<TaskCard task={task} statusColor="#007AFF" selected={false} />);

    expect(Element.prototype.scrollIntoView).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: テストを走らせて失敗を確認する**

Run: `npm test -- src/components/TaskCard.test.tsx -t "TaskCard の選択追従"`

Expected: 1件目が FAIL（「Received: {"block": "nearest"}」）、2件目は PASS。

- [ ] **Step 3: 実装を書く**

`src/components/TaskCard.tsx` の `useEffect`（現在23〜26行目）を次のように置き換える。

変更前:

```tsx
  // キーボードで選択が移動したとき、カードが画面外なら見える位置までスクロールする
  useEffect(() => {
    if (selected) ref.current?.scrollIntoView({ block: "nearest" });
  }, [selected]);
```

変更後:

```tsx
  // キーボードで選択が移動したとき、カードが画面外なら見える位置までスクロールする。
  // inline も見るのは、ステータスが多いとボードが横スクロールするため。
  // block は縦方向しか見ないので、⌘←→ でレーンをまたいだとき選択カードが
  // 横方向の表示範囲外に取り残される。どちらも "nearest" なので、
  // 既に見えている場合はスクロールしない。
  useEffect(() => {
    if (selected) ref.current?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [selected]);
```

- [ ] **Step 4: テストを走らせて成功を確認する**

Run: `npm test -- src/components/TaskCard.test.tsx`

Expected: このファイルのテストがすべて PASS。

- [ ] **Step 5: コミットする**

```bash
git add src/components/TaskCard.tsx src/components/TaskCard.test.tsx
git commit -m "fix: 横スクロール時も選択中のカードが画面内に入るようにする"
```

---

### Task 4: ウィンドウ幅を880pxにする

**Files:**
- Modify: `src-tauri/tauri.conf.json`

このタスクは設定値だけの変更で、jsdom上のテストでは検証できない。
検証は Task 5 の手動スモークで行う。

- [ ] **Step 1: `tauri.conf.json` を修正する**

`app.windows[0].width` の値を `720` から `880` に変更する。`height` の `480` は変更しない。

変更前:

```json
        "width": 720,
        "height": 480,
```

変更後:

```json
        "width": 880,
        "height": 480,
```

- [ ] **Step 2: JSONとして壊れていないことを確認する**

Run: `node -e "console.log(JSON.parse(require('fs').readFileSync('src-tauri/tauri.conf.json','utf8')).app.windows[0].width)"`

Expected: `880`

- [ ] **Step 3: コミットする**

```bash
git add src-tauri/tauri.conf.json
git commit -m "fix: ウィンドウ幅を880pxに広げてレーンあたりの表示幅を確保する"
```

---

### Task 5: 全体の検証

**Files:** なし（検証のみ）

- [ ] **Step 1: テストスイート全体を走らせる**

Run: `npm test`

Expected: 全テスト PASS。落ちるものがあれば、その原因を潰してから次へ進む。

- [ ] **Step 2: 型チェックが通ることを確認する**

Run: `npx tsc --noEmit`

Expected: エラーなしで終了（終了コード0、出力なし）。

- [ ] **Step 3: 手動スモークチェック**

`npm run tauri dev` でアプリを起動し、`Alt + Space` でパレットを出して次を目視する。
（重い処理なので、実行前にユーザーの承認を取ること）

1. 20文字程度のタイトルのタスクを作り、ボードで2行に折り返して読めること
2. 短いタイトルのカードが1行のままで、余計な高さを持たないこと
3. ステータスドットが1行目の中心に並んでいること（2行のカードでも）
4. `⌘,` のボード設定でステータスを5つに増やし、横スクロールが出ないこと
5. さらに6つに増やして横スクロールが出ること、
   かつ `⌘←` `⌘→` で選択カードが画面内に追従すること
6. タグ付きの長いタイトルのカードで、タグ行の「+n」表示が崩れないこと
7. `Enter` でタスク詳細を開き、レイアウトが破綻していないこと
   （幅が広がるので本文欄が816pxになる。読み幅の調整は今回のスコープ外だが、
   崩れていないことだけ確認する）

- [ ] **Step 4: スモークで問題が見つかった場合**

見つかった問題は、数値の微調整ではなく原因のクラス・値まで戻して直す。
特に `mt-[6px]` は `leading-snug` と font-size 13px の組み合わせから導いた値なので、
どちらかを変える場合は再計算する。

---

## 完了条件

- [ ] `npm test` が全件 PASS
- [ ] `npx tsc --noEmit` がエラーなし
- [ ] 手動スモークチェックの7項目すべてを確認
- [ ] Issue #3 の「確認すること」を満たす:
  - 長いタイトルのタスクが判別できる（2行・約25文字）
  - レーン数を増やしても表示が崩れない（最小幅160px + 横スクロール）
