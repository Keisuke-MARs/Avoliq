# タグ候補選択を ↑↓ + Enter にする 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 検索欄の `#タグ名` 候補を、Tab連打のサイクル送りから `↑` `↓` でのハイライト移動 + `Enter` での確定に置き換え、あわせて検索欄からの新規作成でタイトルとタグを正しく分離する。

**Architecture:** ハイライト位置は `SearchBar` のローカル state（`null` = 着地点なし）。候補表示中の `↓` と、ハイライト有りのときの `↑` `Enter` だけを `preventDefault()` で先に取り、window 側の `handleBoardKey` は冒頭で `defaultPrevented` を見て降りる。検索文字列からタイトルとタグIDを分ける処理は `boardNav.ts` の純関数に切り出し、`createTaskFromSearch` から使う。

**Tech Stack:** React 19 / TypeScript / Zustand / Vitest + @testing-library/react + @testing-library/user-event / Tauri

**設計書:** `docs/superpowers/specs/2026-08-25-tag-suggest-arrow-enter-design.md`

**対象issue:** [#6](https://github.com/Keisuke-MARs/Avoliq/issues/6)

---

## ファイル構成

| ファイル | 変更内容 |
|---|---|
| `src/lib/boardNav.ts` | `TaskDraft` 型と `buildTaskDraftFromQuery` を追加（純関数） |
| `src/lib/boardNav.test.ts` | 上記のテストを追加 |
| `src/store/appStore.ts` | `createTaskFromSearch` が `buildTaskDraftFromQuery` を使い、作成後にタグを付ける |
| `src/store/appStore.test.ts` | タグ付き作成のテストを追加 |
| `src/hooks/useKeyboard.ts` | `handleBoardKey` 冒頭に `defaultPrevented` ガードを追加 |
| `src/hooks/useKeyboard.test.ts` | 上記のテストを追加 |
| `src/components/SearchBar.tsx` | Tab連打の仕組みを削除し、ハイライト state + ↑↓/Enter に置き換え。行末チップを `Tab` → `Enter` に |
| `src/components/SearchBar.test.tsx` | Tab 系のテストを ↑↓/Enter のテストに置き換え |
| `README.md` | 24行目「（補完あり）」を新しい操作の説明に差し替え |

`FooterHints.tsx` は変更しない（board のヒントに `Tab` の記述が無く、`↑↓ 移動` / `Enter 開く / 作成` は新操作でもそのまま正しいため）。

**テストの実行コマンド:** ファイル単位は `npx vitest run <path>`、全体は `npm test`。

**テスト用フィクスチャ**（`src/test/fixtures.ts`、変更しない）:
- タグは `バグ`(tag-bug, position 0) / `緊急`(tag-urgent, position 1) / `設計`(tag-design, position 2)
- 使用件数は バグ=2件、緊急=1件、設計=1件。よって `#` だけを打ったときの候補順は **バグ → 緊急 → 設計**

---

### Task 1: 検索文字列をタイトルとタグに分ける純関数

**Files:**
- Modify: `src/lib/boardNav.ts`（末尾に追加）
- Test: `src/lib/boardNav.test.ts`（末尾に追加）

- [ ] **Step 1: 失敗するテストを書く**

`src/lib/boardNav.test.ts` の末尾に追加する。冒頭の import 行に `buildTaskDraftFromQuery` を足すこと
（例: `import { buildLanes, buildTaskDraftFromQuery, filterTasks, ... } from "./boardNav";`。
既存の import の形に合わせる）。`tags` フィクスチャは既に import 済みのはずなので、
未 import なら `import { tags } from "@/test/fixtures";` を足す。

```ts
describe("buildTaskDraftFromQuery", () => {
  it("完全一致するタグトークンをタグへ移し、タイトルから外す", () => {
    expect(buildTaskDraftFromQuery("#バグ 牛乳を買う", tags)).toEqual({
      title: "牛乳を買う",
      tagIds: ["tag-bug"],
    });
  });

  it("タグトークンが後ろにあってもタイトルから外す", () => {
    expect(buildTaskDraftFromQuery("牛乳を #バグ 買う", tags)).toEqual({
      title: "牛乳を 買う",
      tagIds: ["tag-bug"],
    });
  });

  it("完全一致しないタグトークンはタイトルにそのまま残す", () => {
    expect(buildTaskDraftFromQuery("#バ 牛乳を買う", tags)).toEqual({
      title: "#バ 牛乳を買う",
      tagIds: [],
    });
  });

  it("# だけのトークンもタイトルに残す", () => {
    expect(buildTaskDraftFromQuery("# 牛乳を買う", tags)).toEqual({
      title: "# 牛乳を買う",
      tagIds: [],
    });
  });

  it("全角の＃でもタグとして扱う", () => {
    expect(buildTaskDraftFromQuery("＃バグ 牛乳を買う", tags)).toEqual({
      title: "牛乳を買う",
      tagIds: ["tag-bug"],
    });
  });

  it("英字の大文字小文字は区別しない", () => {
    const withAscii = [
      ...tags,
      { id: "tag-av", boardId: "board-1", name: "Avoliq", color: "#7EA9E8", position: 3 },
    ];
    expect(buildTaskDraftFromQuery("#avoliq 設計する", withAscii)).toEqual({
      title: "設計する",
      tagIds: ["tag-av"],
    });
  });

  it("同じタグを2回書いても1つにまとめる", () => {
    expect(buildTaskDraftFromQuery("#バグ #バグ 牛乳を買う", tags)).toEqual({
      title: "牛乳を買う",
      tagIds: ["tag-bug"],
    });
  });

  it("複数のタグをすべて拾う", () => {
    expect(buildTaskDraftFromQuery("#バグ #緊急 直す", tags)).toEqual({
      title: "直す",
      tagIds: ["tag-bug", "tag-urgent"],
    });
  });

  it("タグしか無ければタイトルは空になる", () => {
    expect(buildTaskDraftFromQuery("#バグ", tags)).toEqual({
      title: "",
      tagIds: ["tag-bug"],
    });
  });

  it("空文字なら何も返さない", () => {
    expect(buildTaskDraftFromQuery("   ", tags)).toEqual({ title: "", tagIds: [] });
  });
});
```

- [ ] **Step 2: テストを走らせて失敗を確認する**

Run: `npx vitest run src/lib/boardNav.test.ts`
Expected: FAIL（`buildTaskDraftFromQuery is not exported` / 型エラー）

- [ ] **Step 3: 実装を書く**

`src/lib/boardNav.ts` の `parseSearchQuery` の直後に追加する。

```ts
/** 検索文字列から作る新規タスクの下書き */
export interface TaskDraft {
  title: string;
  tagIds: string[];
}

/**
 * 検索文字列を「タイトル」と「付与するタグID」に分ける。
 * 既存タグ名と完全一致する `#タグ名` だけをタグとして取り出し、タイトルからは外す。
 * 完全一致しないトークン（`#` 単体を含む）は、そのままタイトルに残す
 * （絞り込みの filterTasks は前方一致でも候補を拾うが、作成は取り消せないので
 *   「打ちかけかもしれない文字列を勝手にタグへ解釈しない」側に倒す。
 *   入力した文字が黙って消えないことも兼ねる）。
 */
export function buildTaskDraftFromQuery(query: string, tags: Tag[]): TaskDraft {
  const normalized = normalizeHash(query);
  const tagIds: string[] = [];
  const rest: string[] = [];

  for (const token of normalized.split(/\s+/)) {
    if (token === "") continue;
    if (!token.startsWith("#")) {
      rest.push(token);
      continue;
    }
    const name = token.slice(1).trim().toLowerCase();
    const matched =
      name === "" ? undefined : tags.find((t) => t.name.trim().toLowerCase() === name);
    if (matched === undefined) {
      // 完全一致しないタグトークンは、打った文字をそのままタイトルへ返す
      rest.push(token);
      continue;
    }
    if (!tagIds.includes(matched.id)) tagIds.push(matched.id);
  }

  return { title: rest.join(" ").trim(), tagIds };
}
```

- [ ] **Step 4: テストを走らせて緑を確認する**

Run: `npx vitest run src/lib/boardNav.test.ts`
Expected: PASS（既存のテストも含めて全て緑）

- [ ] **Step 5: コミット**

```bash
git add src/lib/boardNav.ts src/lib/boardNav.test.ts
git commit -m "feat: 検索文字列をタイトルとタグに分ける関数を追加"
```

---

### Task 2: 検索欄からの作成でタグを付ける

**Files:**
- Modify: `src/store/appStore.ts`（`createTaskFromSearch`。設計書の該当節を参照）
- Test: `src/store/appStore.test.ts`（`describe("appStore: createTaskFromSearch")` の中に追加）

- [ ] **Step 1: 失敗するテストを書く**

`describe("appStore: createTaskFromSearch")` の中（既存の「検索文字列が空なら何もしない」の直前）に追加する。

```ts
  it("タグトークンをタイトルから外し、そのタグを付けて作成する", async () => {
    const created: Task = {
      id: "t-new",
      boardId: "board-1",
      statusId: "st-todo",
      title: "牛乳を買う",
      contentMd: "",
      position: 0,
      createdAt: "2026-08-20T01:00:00Z",
      updatedAt: "2026-08-20T01:00:00Z",
      tagIds: [],
    };
    mocked.taskCreate.mockResolvedValue(created);
    mocked.taskTagToggle.mockResolvedValue(["tag-bug"]);
    mocked.tasksList.mockResolvedValueOnce([...tasks, { ...created, tagIds: ["tag-bug"] }]);

    useAppStore.getState().setSearchQuery("#バグ 牛乳を買う");
    await useAppStore.getState().createTaskFromSearch();

    // タイトルにタグトークンが混ざらない
    expect(mocked.taskCreate).toHaveBeenCalledWith("board-1", "st-todo", "牛乳を買う");
    // 作成したタスクにタグが付く
    expect(mocked.taskTagToggle).toHaveBeenCalledWith("t-new", "tag-bug");
    expect(useAppStore.getState().view).toBe("detail");
  });

  it("完全一致しないタグトークンはタイトルに残したまま作成する", async () => {
    const created: Task = {
      id: "t-new",
      boardId: "board-1",
      statusId: "st-todo",
      title: "#バ 牛乳を買う",
      contentMd: "",
      position: 0,
      createdAt: "2026-08-20T01:00:00Z",
      updatedAt: "2026-08-20T01:00:00Z",
      tagIds: [],
    };
    mocked.taskCreate.mockResolvedValue(created);
    mocked.tasksList.mockResolvedValueOnce([...tasks, created]);

    useAppStore.getState().setSearchQuery("#バ 牛乳を買う");
    await useAppStore.getState().createTaskFromSearch();

    expect(mocked.taskCreate).toHaveBeenCalledWith("board-1", "st-todo", "#バ 牛乳を買う");
    expect(mocked.taskTagToggle).not.toHaveBeenCalled();
  });

  it("タグだけを打った状態では作成しない", async () => {
    useAppStore.getState().setSearchQuery("#バグ");
    await useAppStore.getState().createTaskFromSearch();

    expect(mocked.taskCreate).not.toHaveBeenCalled();
    expect(useAppStore.getState().view).toBe("board");
  });

  it("タグ付けに失敗したらトーストを出す（作成済みのタスクは取り消さない）", async () => {
    const created: Task = {
      id: "t-new",
      boardId: "board-1",
      statusId: "st-todo",
      title: "牛乳を買う",
      contentMd: "",
      position: 0,
      createdAt: "2026-08-20T01:00:00Z",
      updatedAt: "2026-08-20T01:00:00Z",
      tagIds: [],
    };
    mocked.taskCreate.mockResolvedValue(created);
    mocked.taskTagToggle.mockRejectedValue(new Error("DB error"));

    useAppStore.getState().setSearchQuery("#バグ 牛乳を買う");
    await useAppStore.getState().createTaskFromSearch();

    expect(toast.error).toHaveBeenCalled();
    expect(useAppStore.getState().view).toBe("board");
  });
```

`beforeEach` の `loadFixtureBoard()` が `mocked.tasksList` を `mockResolvedValue(tasks)` にしているため、
`mockResolvedValueOnce` を足した回だけ作成後の状態が返る。既存テストと同じ作法。

- [ ] **Step 2: テストを走らせて失敗を確認する**

Run: `npx vitest run src/store/appStore.test.ts`
Expected: FAIL（`taskCreate` が `"#バグ 牛乳を買う"` で呼ばれる / `taskTagToggle` が呼ばれない）

- [ ] **Step 3: 実装を書く**

`src/store/appStore.ts` の import に `buildTaskDraftFromQuery` を足す
（既存の `import { ... } from "@/lib/boardNav";` に追記する。無ければ新規に足す）。
`createTaskFromSearch` の冒頭〜`taskCreate` 前後を次のように差し替える。
`boardLoading` / `taskCreating` のガード、`catch` / `finally` は既存のまま触らない。

```ts
    const { currentBoardId, statuses, searchQuery, tags } = get();
    // 「#タグ名」はタイトルではなく付与するタグとして扱う。
    // 完全一致しないトークンはタイトルに残る（buildTaskDraftFromQuery のコメント参照）
    const draft = buildTaskDraftFromQuery(searchQuery, tags);
    const firstStatus = [...statuses].sort((a, b) => a.position - b.position)[0];
    if (currentBoardId === null || firstStatus === undefined || draft.title === "") return;

    // 応答が返ってきた時点でも同じ切替要求を見ているか確認するため、開始時点のエポックを覚えておく
    const epoch = boardEpoch;

    taskCreating = true;
    // IDはRust側で採番するUUIDなので、ここだけは楽観的更新ではなくAPI先行で作る
    try {
      const created = await api.taskCreate(currentBoardId, firstStatus.id, draft.title);
      // 待っている間にボードが切り替えられていたら、作成自体はDBに済んでいるので
      // 画面には何も反映せず黙って破棄する(別ボードの内容が混ざるのを防ぐ)
      if (epoch !== boardEpoch) return;
      // taskCreate はタグを受け取らないので、作成後に1つずつ付ける。
      // 途中で失敗しても作成済みのタスクは消さず、catchのトーストで知らせる
      for (const tagId of draft.tagIds) {
        await api.taskTagToggle(created.id, tagId);
        if (epoch !== boardEpoch) return;
      }
      const fresh = await api.tasksList(currentBoardId);
```

（`const fresh = ...` 以降は既存のまま。`title` という変数は使わなくなるので消えていることを確認する）

- [ ] **Step 4: テストを走らせて緑を確認する**

Run: `npx vitest run src/store/appStore.test.ts`
Expected: PASS（既存の createTaskFromSearch のテストも含めて全て緑）

- [ ] **Step 5: コミット**

```bash
git add src/store/appStore.ts src/store/appStore.test.ts
git commit -m "feat: 検索欄からの作成でタグトークンをタイトルから外してタグを付ける"
```

---

### Task 3: 先に処理済みのキーを board のキー処理から除く

**Files:**
- Modify: `src/hooks/useKeyboard.ts:100`（`handleBoardKey` の冒頭）
- Test: `src/hooks/useKeyboard.test.ts`（末尾に `describe` を追加）

- [ ] **Step 1: 失敗するテストを書く**

`src/hooks/useKeyboard.test.ts` の末尾に追加する。`statuses` / `tasks` / `tags` / `initialAppState` /
`SEARCH_INPUT_ID` は既に import 済み。

```ts
describe("useKeyboard: 先に処理済みのキー", () => {
  it("defaultPreventedなkeydownでは board のキー処理を走らせない", () => {
    // SearchBar がタグ候補の ↑↓ / Enter を preventDefault して先に処理する経路を再現する。
    // ここでガードしないと、候補を1つ下へ動かした同じキーでカードまで移動してしまう
    const input = document.createElement("input");
    input.id = SEARCH_INPUT_ID;
    document.body.appendChild(input);
    input.addEventListener("keydown", (e) => e.preventDefault());

    useAppStore.setState({ ...initialAppState, statuses, tasks, tags, view: "board" });
    renderHook(() => useKeyboard());

    input.dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true, cancelable: true }),
    );

    expect(useAppStore.getState().selectedTaskId).toBeNull();

    input.remove();
  });

  it("preventDefaultされていなければ従来どおりカードが選ばれる", () => {
    useAppStore.setState({ ...initialAppState, statuses, tasks, tags, view: "board" });
    renderHook(() => useKeyboard());

    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true, cancelable: true }),
    );

    expect(useAppStore.getState().selectedTaskId).toBe("t-a");
  });
});
```

- [ ] **Step 2: テストを走らせて失敗を確認する**

Run: `npx vitest run src/hooks/useKeyboard.test.ts`
Expected: 1つ目が FAIL（`selectedTaskId` が `"t-a"` になる）、2つ目は PASS

- [ ] **Step 3: 実装を書く**

`src/hooks/useKeyboard.ts` の `handleBoardKey` の冒頭（`if (e.metaKey) {` の直前）に追加する。

```ts
function handleBoardKey(e: KeyboardEvent, s: AppState): void {
  // SearchBar のタグ候補選択(↑↓ / Enter)のように、既に処理済みのキーはここでは触らない。
  // 検索欄と board は同じ window の keydown 1本を共有しているので、
  // このガードが無いと「候補を1つ下へ」と「カードを1つ下へ」が同時に起きる。
  // detail側の⌘K(BlockNoteのリンク作成に譲る)と同じ作法。
  if (e.defaultPrevented) return;

  if (e.metaKey) {
```

- [ ] **Step 4: テストを走らせて緑を確認する**

Run: `npx vitest run src/hooks/useKeyboard.test.ts`
Expected: PASS（既存のテストも含めて全て緑）

- [ ] **Step 5: コミット**

```bash
git add src/hooks/useKeyboard.ts src/hooks/useKeyboard.test.ts
git commit -m "fix: 先に処理済みのキーはボードのキー処理を走らせない"
```

---

### Task 4: SearchBar の候補選択を ↑↓ + Enter にする

**Files:**
- Modify: `src/components/SearchBar.tsx`（全面的に書き換え）
- Test: `src/components/SearchBar.test.tsx`（Tab 系のテストを置き換え）

- [ ] **Step 1: 既存の Tab 系テストを新しい操作のテストに置き換える**

`src/components/SearchBar.test.tsx` を次のように直す。**削除するテスト**は以下の4つ:

- `"Tab で候補を補完し、連打で次の候補へ送る"`
- `"Enter は補完に使わない（board の Enter を壊さないため）"`
- `describe("SearchBar: Tab連打サイクルのリセット")` の丸ごと（2テスト）
- `"候補が0件のときはTabのデフォルト動作(フォーカス移動)を邪魔しない"`
- `"ボードを切り替えるとTabの候補送りサイクルがリセットされる"`

**残すテスト**（そのまま）: `"# を打つとタグ候補が出る"` / `"全角の＃でも候補が出る"` /
`"前方一致で候補を絞る"` / `"# が付いていないときは候補を出さない"` /
`"stopPropagationしていないので、Enterなど既存のキー操作はwindowのハンドラに届く"` /
`"view が detail のときはサジェストを表示しない..."`

**追加するテスト**（ファイル末尾に置く。ヘルパはファイル冒頭の import 群の直後に置く）:

```tsx
/** いまハイライトされている候補行のテキスト（ハイライト無しなら null） */
function highlightedText(): string | null {
  const row = screen.getByTestId("tag-suggest").querySelector('[data-highlighted="true"]');
  return row === null ? null : (row.textContent ?? "");
}

describe("SearchBar: ↑↓ でのハイライト移動", () => {
  beforeEach(() => {
    useAppStore.setState({ ...initialAppState, tasks, tags });
  });

  it("候補が出た直後はどれもハイライトされていない", async () => {
    const user = userEvent.setup();
    render(<SearchBar />);
    await user.type(screen.getByTestId("search-input"), "#");

    expect(highlightedText()).toBeNull();
  });

  it("↓ で先頭候補がハイライトされる", async () => {
    const user = userEvent.setup();
    render(<SearchBar />);
    await user.type(screen.getByTestId("search-input"), "#");

    await user.keyboard("{ArrowDown}");

    expect(highlightedText()).toContain("バグ");
  });

  it("↓ を続けると次の候補へ進み、最後の候補で止まる", async () => {
    const user = userEvent.setup();
    render(<SearchBar />);
    await user.type(screen.getByTestId("search-input"), "#");

    await user.keyboard("{ArrowDown}{ArrowDown}");
    expect(highlightedText()).toContain("緊急");

    // 候補は バグ / 緊急 / 設計 の3件。4回目以降は末尾で止まる（折り返さない）
    await user.keyboard("{ArrowDown}{ArrowDown}");
    expect(highlightedText()).toContain("設計");
  });

  it("↑ で1つ上へ戻り、先頭からさらに ↑ でハイライトが消える", async () => {
    const user = userEvent.setup();
    render(<SearchBar />);
    await user.type(screen.getByTestId("search-input"), "#");

    await user.keyboard("{ArrowDown}{ArrowDown}");
    expect(highlightedText()).toContain("緊急");

    await user.keyboard("{ArrowUp}");
    expect(highlightedText()).toContain("バグ");

    await user.keyboard("{ArrowUp}");
    expect(highlightedText()).toBeNull();
  });

  it("入力を打ち直すとハイライトが消える", async () => {
    const user = userEvent.setup();
    render(<SearchBar />);
    const input = screen.getByTestId("search-input");
    await user.type(input, "#");
    await user.keyboard("{ArrowDown}");
    expect(highlightedText()).toContain("バグ");

    await user.type(input, "設");

    expect(highlightedText()).toBeNull();
  });

  it("ボードを切り替えるとハイライトが消える", async () => {
    const user = userEvent.setup();
    useAppStore.setState({ currentBoardId: "board-1" });
    render(<SearchBar />);
    const input = screen.getByTestId("search-input");
    await user.type(input, "#");
    await user.keyboard("{ArrowDown}");
    expect(highlightedText()).toContain("バグ");

    // selectBoardはonChange/onBlurを経由せず、searchQueryとcurrentBoardIdを直接書き換える。
    // その経路をここで再現する
    useAppStore.setState({ currentBoardId: "board-2", searchQuery: "#" });

    // currentBoardId の変化を検知する useEffect は再描画のコミット後に走るので、
    // ハイライトが消えるのを待ってから確認する
    await waitFor(() => {
      expect(highlightedText()).toBeNull();
    });
  });
});

describe("SearchBar: Enter での確定", () => {
  beforeEach(() => {
    useAppStore.setState({ ...initialAppState, tasks, tags });
  });

  it("ハイライトした候補を Enter で確定し、末尾にスペースを付ける", async () => {
    const user = userEvent.setup();
    render(<SearchBar />);
    await user.type(screen.getByTestId("search-input"), "#");

    await user.keyboard("{ArrowDown}{Enter}");

    expect(useAppStore.getState().searchQuery).toBe("#バグ ");
  });

  it("確定すると候補が閉じ、続けて検索語を打てる", async () => {
    const user = userEvent.setup();
    render(<SearchBar />);
    const input = screen.getByTestId("search-input");
    await user.type(input, "#");
    await user.keyboard("{ArrowDown}{Enter}");

    expect(screen.queryByTestId("tag-suggest")).not.toBeInTheDocument();

    await user.type(input, "牛乳");
    expect(useAppStore.getState().searchQuery).toBe("#バグ 牛乳");
  });

  it("打ちかけの文字を候補の名前で置き換える", async () => {
    const user = userEvent.setup();
    render(<SearchBar />);
    await user.type(screen.getByTestId("search-input"), "牛乳 #設");

    await user.keyboard("{ArrowDown}{Enter}");

    expect(useAppStore.getState().searchQuery).toBe("牛乳 #設計 ");
  });
});

describe("SearchBar: 奪ってはいけないキー", () => {
  beforeEach(() => {
    useAppStore.setState({ ...initialAppState, tasks, tags });
  });

  // fireEventはdispatchEventの戻り値を返す。cancelableなイベントでpreventDefault()が
  // 呼ばれているとfalseになるので、これでwindow側のハンドラに渡るかを判定できる
  it("ハイライト無しのときの Enter は preventDefault しない", () => {
    render(<SearchBar />);
    const input = screen.getByTestId("search-input");
    fireEvent.change(input, { target: { value: "#" } });

    expect(fireEvent.keyDown(input, { key: "Enter" })).toBe(true);
  });

  it("ハイライト無しのときの ↑ は preventDefault しない", () => {
    render(<SearchBar />);
    const input = screen.getByTestId("search-input");
    fireEvent.change(input, { target: { value: "#" } });

    expect(fireEvent.keyDown(input, { key: "ArrowUp" })).toBe(true);
  });

  it("候補が0件のときは ↓ を奪わない", () => {
    render(<SearchBar />);
    const input = screen.getByTestId("search-input");
    // 存在しないタグ名なので候補は0件になる
    fireEvent.change(input, { target: { value: "#存在しないタグ名" } });

    expect(fireEvent.keyDown(input, { key: "ArrowDown" })).toBe(true);
  });

  it("タグトークンでないときは ↓ を奪わない", () => {
    render(<SearchBar />);
    const input = screen.getByTestId("search-input");
    fireEvent.change(input, { target: { value: "牛乳" } });

    expect(fireEvent.keyDown(input, { key: "ArrowDown" })).toBe(true);
  });

  it("Tab は奪わない（候補送りは廃止した）", () => {
    render(<SearchBar />);
    const input = screen.getByTestId("search-input");
    fireEvent.change(input, { target: { value: "#" } });

    expect(fireEvent.keyDown(input, { key: "Tab" })).toBe(true);
    expect(useAppStore.getState().searchQuery).toBe("#");
  });
});
```

- [ ] **Step 2: テストを走らせて失敗を確認する**

Run: `npx vitest run src/components/SearchBar.test.tsx`
Expected: FAIL（`data-highlighted` の行が見つからない、`searchQuery` が `#バグ ` にならない など）

- [ ] **Step 3: SearchBar を書き換える**

`src/components/SearchBar.tsx` を丸ごと次の内容にする。

```tsx
import { Search } from "lucide-react";
import { useEffect, useState } from "react";
import { SEARCH_INPUT_ID } from "@/hooks/useKeyboard";
import { normalizeHash } from "@/lib/boardNav";
import { useAppStore } from "@/store/appStore";
import type { Tag } from "@/types";

/** サジェストに出す最大件数 */
const MAX_SUGGESTIONS = 5;

export function SearchBar() {
  const searchQuery = useAppStore((s) => s.searchQuery);
  const setSearchQuery = useAppStore((s) => s.setSearchQuery);
  const tags = useAppStore((s) => s.tags);
  const tasks = useAppStore((s) => s.tasks);
  const view = useAppStore((s) => s.view);
  const currentBoardId = useAppStore((s) => s.currentBoardId);

  /**
   * いま何番目の候補を見ているか。null は「着地点なし」を表す
   * (TagPalette の highlightId: null と同じ意味づけ)。
   * 着地点が無い間は Enter を奪わないので、board の「開く / 作成」も、
   * 日本語入力の変換確定 Enter も、従来どおり素通りする。
   */
  const [highlightIndex, setHighlightIndex] = useState<number | null>(null);

  /**
   * SearchBar は Palette.tsx で view に関係なく常時マウントされたままなので
   * (Board/TaskDetailのようにviewでアンマウントされない)、「今この入力欄を操作中か」を
   * フォーカス状態として別に持っておく。これが無いと、検索欄で#タグを打ってから
   * カードを開いて詳細画面に移っても、ドロップダウンが詳細画面の上に浮いたまま残ってしまう。
   */
  const [focused, setFocused] = useState(false);

  /**
   * ボード切替(selectBoard)はonChange/onBlurを経由せず、searchQueryとcurrentBoardIdを
   * 直接まとめて書き換える。そのためハイライトを放置すると、切替後に前のボードの候補を
   * 指したままになってしまう。currentBoardIdの変化を検知して、そのタイミングでリセットする。
   */
  useEffect(() => {
    setHighlightIndex(null);
  }, [currentBoardId]);

  // 全角＃の正規化はboardNav.normalizeHashに集約している(parseSearchQueryと同じ関数を使う)
  const normalized = normalizeHash(searchQuery);
  const lastToken = normalized.split(/\s+/).pop() ?? "";
  const isTagToken = lastToken.startsWith("#");

  /**
   * 最後のトークンに前方一致するタグを、使用件数の多い順に返す。
   * 描画のたびに作り直すので、常に現在の入力と一致する
   * (件数が少なく計算も軽いため、memo化して状態がズレる危険を持ち込まない)。
   */
  function computeSuggestions(): Tag[] {
    if (!isTagToken) return [];
    const prefix = lastToken.replace(/^#/, "").toLowerCase();
    const counts = new Map<string, number>();
    for (const task of tasks) {
      for (const id of task.tagIds) counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    return tags
      .filter((t) => t.name.toLowerCase().startsWith(prefix))
      .sort(
        (a, b) => (counts.get(b.id) ?? 0) - (counts.get(a.id) ?? 0) || a.position - b.position,
      )
      .slice(0, MAX_SUGGESTIONS);
  }

  const suggestions = computeSuggestions();

  /**
   * 実際に使うハイライト位置。tasks/tags が外から変わって候補が減ったときに、
   * 範囲外の行を指したままにしないためのクランプ。
   */
  const activeIndex =
    highlightIndex !== null && highlightIndex < suggestions.length ? highlightIndex : null;

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    // IMEが処理中のキーには触らない
    if (event.nativeEvent.isComposing || event.keyCode === 229) return;
    // 候補が出ていないときは何も奪わない。カード移動も「開く / 作成」も従来どおり
    // window のハンドラ(useKeyboard)へ届く
    if (view !== "board" || !isTagToken || suggestions.length === 0) return;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setHighlightIndex(activeIndex === null ? 0 : Math.min(activeIndex + 1, suggestions.length - 1));
      return;
    }

    if (event.key === "ArrowUp") {
      // 着地点が無い状態の↑は候補の操作ではないので、window側(カード移動)に譲る
      if (activeIndex === null) return;
      event.preventDefault();
      setHighlightIndex(activeIndex === 0 ? null : activeIndex - 1);
      return;
    }

    if (event.key === "Enter") {
      // 着地点が無いEnterは board の「開く / 作成」の中核キーなので絶対に奪わない
      if (activeIndex === null) return;
      event.preventDefault();
      const picked = suggestions[activeIndex];
      const head = normalized.slice(0, normalized.length - lastToken.length);
      // 末尾のスペースで最後のトークンを空にする。候補が閉じ、そのまま続けて検索語を打てる
      setSearchQuery(`${head}#${picked.name} `);
      setHighlightIndex(null);
    }
  };

  return (
    <div
      // relative: 下のタグ候補ドロップダウン(absolute)をこのバーの範囲だけに重ねるための基準
      className="relative flex h-14 shrink-0 items-center gap-2.5 border-b px-4"
      style={{ borderColor: "var(--av-hairline)" }}
    >
      <Search
        size={18}
        className="shrink-0"
        style={{ color: "var(--av-text-muted)" }}
      />
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
        onChange={(e) => {
          // 打ち直したら着地点も捨てる。IMEの変換中もここを通るので、
          // 変換の途中でハイライトが復活することはない
          setHighlightIndex(null);
          setSearchQuery(e.target.value);
        }}
        onFocus={() => setFocused(true)}
        onBlur={() => {
          // フォーカスが外れたら着地点も一緒に捨てる
          // (例: カード選択でuseKeyboardがblurSearchInputを呼んだあと、再び検索欄へ戻ったとき、
          // 前回のハイライトが残っていると使用者が混乱するため)
          setHighlightIndex(null);
          setFocused(false);
        }}
        onKeyDown={handleKeyDown}
        className="av-input w-full bg-transparent text-[17px] outline-none"
        style={{ color: "var(--av-text-primary)" }}
      />

      {/*
        フォーカスと同時にview==="board"も見ているのは、SearchBar自体はview非依存に
        常時マウントされているため。フォーカスだけだと、詳細画面をマウスクリックで開いた場合など
        入力欄が明示的にblurされない経路が万一あってもドロップダウンが残ってしまう恐れがある。
        boardに戻ってきていない間は「今ここで検索操作中」ではないので出さない。
      */}
      {focused && view === "board" && isTagToken && suggestions.length > 0 && (
        <div
          data-testid="tag-suggest"
          // ガラス(Palette本体)の上に浮くポップオーバーなので、ガラスの二重掛けを避けて
          // ConfirmDialog / BlockNoteメニューと同じ不透明面(av-surface-raised)にする
          className="av-surface-raised absolute left-11 top-[52px] z-20 w-56 overflow-hidden rounded-lg py-1 shadow-lg"
          style={{ border: "0.5px solid var(--av-hairline)" }}
        >
          {suggestions.map((tag, i) => (
            <div
              key={tag.id}
              // 着地点が目で追えることが本機能の目的なので、ハイライト行だけ面を変え、
              // 確定キーの案内もその行にだけ出す
              data-highlighted={i === activeIndex ? "true" : undefined}
              className="flex items-center gap-2 px-2.5 py-1 text-[12px]"
              style={{
                color: "var(--av-text-primary)",
                backgroundColor: i === activeIndex ? "var(--av-surface-hover)" : undefined,
              }}
            >
              <span
                className="h-1.5 w-1.5 shrink-0 rounded-full"
                style={{ backgroundColor: tag.color }}
              />
              <span className="min-w-0 flex-1 truncate">{tag.name}</span>
              {i === activeIndex && (
                <span className="shrink-0 text-[10px]" style={{ color: "var(--av-text-muted)" }}>
                  Enter
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: テストを走らせて緑を確認する**

Run: `npx vitest run src/components/SearchBar.test.tsx`
Expected: PASS（残したテストも含めて全て緑）

- [ ] **Step 5: コミット**

```bash
git add src/components/SearchBar.tsx src/components/SearchBar.test.tsx
git commit -m "feat: タグ候補の選択を↑↓とEnterに変える"
```

---

### Task 5: ドキュメントの更新と全体の確認

**Files:**
- Modify: `README.md:24`

- [ ] **Step 1: README を直す**

24行目を次のように差し替える。

変更前:
```markdown
- **タグ** — `⌘K` のタグパレットで付け外し。検索欄で `#タグ名` と打つと絞り込み（補完あり）
```

変更後:
```markdown
- **タグ** — `⌘K` のタグパレットで付け外し。検索欄で `#タグ名` と打つと絞り込み（候補を `↑` `↓` で選び `Enter` で確定）
```

- [ ] **Step 2: 全テストを走らせる**

Run: `npm test`
Expected: 全ファイル PASS（失敗が1件でもあれば、その内容を報告してから先へ進まないこと）

- [ ] **Step 3: 型チェックを走らせる**

Run: `npx tsc --noEmit`
Expected: エラーなし（出力が空）

- [ ] **Step 4: コミット**

```bash
git add README.md
git commit -m "docs: タグ候補の選択方法の説明を実装に合わせる"
```

---

## 完了条件（issue #6 の受け入れ条件）

- [ ] `#` を打つと候補が出て `↑` `↓` で動く（Task 4 のテストで確認）
- [ ] 確定したあとも続けて検索できる（Task 4 の「確定すると候補が閉じ、続けて検索語を打てる」）
- [ ] 候補が出ていないときは `↑` `↓` が従来どおりカード移動になる（Task 4 の「奪ってはいけないキー」＋ Task 3）
- [ ] タグで絞り込んだ状態から作成したとき、タイトルにタグトークンが混ざらず、そのタグが付く（Task 2）
- [ ] `npm test` と `npx tsc --noEmit` が通る（Task 5）
