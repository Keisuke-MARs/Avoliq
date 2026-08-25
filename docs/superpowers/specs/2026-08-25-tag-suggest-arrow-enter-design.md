# タグ検索の候補選択を ↑↓ + Enter にする 設計書

作成日: 2026-08-25
ステータス: ユーザー承認済み（ブレインストーミングセッションにて承認）
対象issue: [#6 タグ検索の候補選択を Tab連打から ↑↓ + Enter に変える](https://github.com/Keisuke-MARs/Avoliq/issues/6)

既存の `2026-08-21-tag-feature-design.md`（タグ機能設計書）と
`2026-08-20-implementation-contract.md`（実装コントラクト）を前提とする。
本書は、そのうち「検索バーで `#タグ名`」の候補選択手段だけを差し替える。

## 決定事項サマリ

| 項目 | 決定 |
|---|---|
| 候補の選択 | `↑` `↓` でハイライトを移動し、`Enter` で確定 |
| 初期ハイライト | **無し**（`↓` で候補に降りて初めて確定できる） |
| Tab連打の候補送り | **廃止**（`tabBaseRef` / `tabCycleRef` ごと削除） |
| キーの奪い方 | SearchBar が `preventDefault()` し、`handleBoardKey` 冒頭で `defaultPrevented` を見て降りる |
| ハイライト状態の置き場 | SearchBar のローカル state（ストアには持たせない） |
| 確定時の書き換え | `#タグ名` + 末尾スペース。候補は自然に閉じ、続けて検索語を打てる |
| 作成時のタグ解決 | 既存タグと**完全一致**するトークンだけタグとして付与し、タイトルから外す |
| FooterHints | **変更なし**（board のヒントに `Tab` は元々無く、`↑↓` `Enter` の記述は新操作でも正しい） |
| スコープ外 | 検索欄の Enter 2回化（issue #5）、候補のマウス操作、候補の複数選択 |

### 却下した代替案

- **先頭を常にハイライトする案（Twitter寄り）**: 打鍵は最短だが、候補表示中の `Enter` が
  必ず確定になるため、日本語のタグ名を打っている最中の**変換確定 Enter が誤確定になる**。
  TagPalette の `swallowEnterRef` と同じガードを別途持ち込む必要があり、
  issue #5（Enter 2回化）との整合も一段複雑になる。
  「`↓` で降りて初めて確定」なら、この衝突が構造的に消える。
- **ハイライト状態を `appStore` に持ち、`useKeyboard` 側で処理する案**（`tagPaletteOpen` と同じ作法）:
  キーマップは1箇所に集まるが、UI都合の状態がストアに増え、SearchBar⇄ストアの往復も増える。
  今回奪うキーは候補表示中の3キーだけなので、その代償に見合わない。
- **`event.nativeEvent.stopPropagation()` で window に届かせない案**: 記述量は最小だが、
  React のリスナ取り付け位置に依存する暗黙の仕掛けになる。
  既存テスト「stopPropagation していないので、Enterなど既存のキー操作は window のハンドラに届く」
  （`SearchBar.test.tsx`）が守っている前提とも真っ向から衝突する。
- **タグ名が完全一致しないとき、前方一致1件なら付与する案**: 絞り込み（`filterTasks`）の
  前方一致の振る舞いには揃うが、候補が2件以上あるときの結果が説明しにくい。
- **タグ名が完全一致しないとき、新規タグを作って付与する案**: 打ち間違いがそのままゴミタグになる。
  タグの新規作成は `⌘K` のタグパレットに既にあり、役割が重複する。

## アーキテクチャ

### キーの受け渡し

Avoliq のキー処理は `useKeyboard` が window に張る keydown 1本に集約されている。
検索欄にフォーカスがあってもこの経路を通るため、SearchBar が先に取ったキーを
window のハンドラに渡さない仕組みが要る。

```
keydown
  └─ React の onKeyDown（SearchBar の input）
       ├─ 候補表示中の ↓ / ハイライト有りの ↑ Enter → preventDefault() して処理
       └─ それ以外 → 何もしない
  └─ window の keydown（useKeyboard）
       └─ handleBoardKey 冒頭: if (e.defaultPrevented) return;
```

`handleDetailKey` は既に ⌘K で `event.defaultPrevented` を見て BlockNote に譲っており、
同じ作法を board 側にも置く形になる。

ただし置き場所は **`e.metaKey` の分岐より後**でなければならない。board の ⌘K は
「`defaultPrevented` でも横取りする」ことが既存テスト
（`useKeyboard.test.ts` の「board で ⌘K は defaultPrevented でも横取りする」）で
意図的に担保されており、`handleBoardKey` の冒頭に置くとそれを壊してしまう。
SearchBar が奪うのは修飾キーなしの `↑` `↓` `Enter` だけなので、⌘系より後で足りる。

### 責務の分割

| 単位 | 責務 | 依存 |
|---|---|---|
| `SearchBar`（`src/components/SearchBar.tsx`） | 候補の算出・表示、ハイライトの保持と移動、確定時の検索文字列の書き換え | `boardNav.normalizeHash`, `appStore` |
| `handleBoardKey`（`src/hooks/useKeyboard.ts`） | 先に処理済みのキーには触らない | なし（`defaultPrevented` を見るだけ） |
| `buildTaskDraftFromQuery`（`src/lib/boardNav.ts`） | 検索文字列を「タイトル」と「付与するタグID」に分ける純関数 | `types` のみ |
| `createTaskFromSearch`（`src/store/appStore.ts`） | 上記の結果でタスクを作り、タグを付ける | `api`, `boardNav` |

## SearchBar の変更

### 状態

```ts
const [highlightIndex, setHighlightIndex] = useState<number | null>(null);
```

- `null` は「着地点なし」を表す（TagPalette の `highlightId: null` と同じ意味づけ）。
- 削除するもの: `tabBaseRef` / `tabCycleRef` と、それらをリセットするための
  `onChange` / `onBlur` / `currentBoardId` の `useEffect` の各処理。
  候補の算出は `lastToken` から直接行えばよくなるため、`computeSuggestions` の引数も不要になる。
- リセットする契機:
  - `onChange`（入力が変わったら常に `null`）。IME の変換中も `onChange` は走るので、
    変換中に着地点が残ることはない。TagPalette の `composingRef` に相当する仕掛けは要らない。
  - `onBlur`
  - `currentBoardId` の変化（ボード切替は `onChange` / `onBlur` を経由せず
    `searchQuery` と `currentBoardId` を直接書き換えるため、`useEffect` でのリセットは残す）
- 描画時のクランプ: `highlightIndex !== null && highlightIndex >= suggestions.length` の場合は
  `null` として扱う。`tasks` / `tags` が外から変わって候補が減った場合に、
  範囲外の行を指したままにしないため。

### キーマップ（`focused && view === "board" && isTagToken && suggestions.length > 0` のときだけ）

| キー | ハイライト無し | ハイライト有り（index = i） |
|---|---|---|
| `↓` | 0 にする（奪う） | `min(i + 1, len - 1)`。最下段では止まる（奪う） |
| `↑` | **奪わない** | `i > 0` なら `i - 1`、`i === 0` なら `null`（いずれも奪う） |
| `Enter` | **奪わない** | 確定する（奪う） |
| `Esc` | 奪わない | 奪わない |

- 端で折り返さない（wrap しない）。「いま何番目を見ているか」が分かることが本issueの目的なので、
  端で止まる方が位置を見失いにくい。
- IME 処理中（`event.nativeEvent.isComposing || event.keyCode === 229`）は従来どおり何もしない。
- 奪わないキーでは `preventDefault()` を呼ばない。呼んでしまうと window 側のガードに
  引っかかり、カード移動や「開く / 作成」が黙って死ぬ。

### 確定時の書き換え

```ts
const head = normalized.slice(0, normalized.length - lastToken.length);
setSearchQuery(`${head}#${picked.name} `);   // 末尾スペース
setHighlightIndex(null);
```

末尾スペースにより最後のトークンが空になり、`isTagToken` が false になって候補が閉じる。
そのまま検索語や次の `#` を続けて打てる。フォーカスは入力欄に留まる。

### 見た目

- 行末の `Tab` チップを廃止する。
- ハイライト行のみ背景 `var(--av-surface-hover)`、行末に `Enter` チップを出す。
- ハイライト行に `data-highlighted="true"` を付け、テストから参照できるようにする。

## `buildTaskDraftFromQuery`（`src/lib/boardNav.ts` に追加）

```ts
export interface TaskDraft {
  title: string;
  tagIds: string[];
}

export function buildTaskDraftFromQuery(query: string, tags: Tag[]): TaskDraft
```

手順:

1. `normalizeHash` を通し、`/\s+/` で分割する（`parseSearchQuery` と同じ正規化を使う）。
2. `#` で始まるトークンは、`#` を除いた名前を trim + 小文字化して既存タグ名と突き合わせる。
   完全一致するタグがあれば `tagIds` に積み（重複は除く）、そのトークンはタイトルから除く。
3. 完全一致しないトークン（`#` 単体を含む）は、そのままタイトル側に残す。
4. 残ったトークンを半角スペースで join し、trim してタイトルにする。

例:

| 入力 | タイトル | タグ |
|---|---|---|
| `#Avoliq 設計` | `設計` | Avoliq |
| `#Avo 設計`（`Avo` というタグは無い） | `#Avo 設計` | なし |
| `#Avoliq` | `` （空） | Avoliq |
| `設計 #Avoliq メモ` | `設計 メモ` | Avoliq |

タイトルが空になる場合、`createTaskFromSearch` は従来どおり何もしない（作成しない）。

## `createTaskFromSearch` の変更

```
draft = buildTaskDraftFromQuery(searchQuery, tags)
draft.title === "" なら return（従来の title === "" と同じ位置）
created = await api.taskCreate(boardId, firstStatus.id, draft.title)
epoch チェック
draft.tagIds を順に await api.taskTagToggle(created.id, tagId)
epoch チェック
fresh = await api.tasksList(boardId)
epoch チェック
set({ tasks: fresh, searchQuery: "", selectedTaskId: created.id, view: "detail" })
```

- `boardEpoch` の確認は既存方針どおり、各 `await` の後に置く。
  タグ付与のループを跨いだ後にも1回入れる。
- タグ付与に失敗した場合、タスク自体は作成済みなので**作成は取り消さない**。
  タグ付与のループだけを独立した `try` / `catch` で囲み、
  `タグの付与に失敗しました` というタグ専用のトーストを出したうえで、
  そのまま成功経路（`tasksList` での正引き → 画面反映 → 詳細画面へ）まで進める。
  ここで打ち切ると、DBにあるタスクが画面に出ないまま検索欄も残るため、
  もう一度 `Enter` を押した使用者が同じタスクを二重に作ってしまう。
- `taskCreating` フラグ、`boardLoading` ガードは従来どおり。

## ドキュメントの変更

- `README.md` 24行目: 「（補完あり）」→「（`↑↓` と `Enter` で候補を選べる）」
- `FooterHints.tsx`: **変更しない**。board のヒントに `Tab` の記述は元々無く、
  `↑↓ 移動` / `Enter 開く / 作成` は新しい操作でもそのまま正しい。
  候補の操作はドロップダウン内の `Enter` チップで示す。
  （issue #6 は FooterHints も直す想定だったが、実物に直すべき記述が無いためこの判断とした）

## issue #5（Enter 2回化）との関係

本設計は「ハイライト無しの `Enter` を奪わない」ため、`Enter` が
「開く / 作成」へ流れる経路には一切手を入れない。issue #5 がその経路を2回化しても、
本設計の確定（ハイライト有りの `Enter`）は SearchBar 側で先に `preventDefault` されて
window に届かないので、2回化の対象にならない。両者は独立して実装・変更できる。

## テスト

| ファイル | 内容 |
|---|---|
| `src/lib/boardNav.test.ts` | `buildTaskDraftFromQuery` の純関数テスト（上の例の表を網羅、重複タグ、`#` 単体、大文字小文字違い） |
| `src/components/SearchBar.test.tsx` | Tab 系のテスト群を置き換え。`↓` で先頭がハイライト、`↓↓` で2番目、最下段で止まる、`↑` で先頭からハイライト無しへ戻る、`Enter` で `#タグ名 `（末尾スペース付き）になる、確定後に候補が閉じる |
| 同上 | 奪わないことの確認: ハイライト無しの `Enter` と `↑` は `defaultPrevented === false` |
| `src/hooks/useKeyboard.test.ts` | `defaultPrevented` が立った keydown では board のキー処理が走らないこと |
| `src/store/appStore.test.ts` | `#Avoliq 設計` からの作成でタイトルが `設計` になり、Avoliq タグが付くこと。完全一致しないタグトークンはタイトルに残ること |

## 確認すること（issue の受け入れ条件）

- `#` を打つと候補が出て `↑` `↓` で動く
- 確定したあとも続けて検索できる
- 候補が出ていないときは `↑` `↓` が従来どおりカード移動になる
- タグで絞り込んだ状態から作成したとき、タイトルにタグトークンが混ざらず、そのタグが付く
