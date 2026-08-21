# Avoliq タグ機能 設計書

作成日: 2026-08-21
ステータス: ユーザー承認済み（ブレインストーミングセッションにて各セクション承認）

既存の `2026-08-20-avoliq-palette-design.md`（設計書）と
`2026-08-20-implementation-contract.md`（実装コントラクト）を前提とする。
本書で追加・変更する名前と型は、実装コントラクトへの追記と同じ強さの拘束力を持つ。

## 決定事項サマリ

| 項目 | 決定 |
|---|---|
| タグの範囲 | **ボードごと**（`statuses` と同じく `board_id` を持つ） |
| 1タスクあたり | 複数タグ可（上限なし） |
| 生成 | タグパレット内でその場作成（未登録の名前を打って `⌘Enter`） |
| 管理（改名・削除） | **同じタグパレット内で完結**。`⌘,` のボード設定に新セクションは作らない |
| 付与UI | `⌘K` で開く専用オーバーレイ「タグパレット」 |
| 看板での表示 | **色付きの四角チップ**（角丸5px）。タグ無しのカードは行ごと描画しない |
| タグ色 | 9色から**自動割当・変更不可**。作成時に確定し以後不変 |
| 絞り込み | 検索バーで `#タグ名`。タイトル検索と併用可 |
| スコープ外 | タグの並べ替えUI、タグごとのアイコン、ボード横断のタグ共有 |

### 却下した代替案

- **案B「＃記法主義」**（新ショートカットを作らず `#` の入力だけで完結）:
  発見可能性が低く、日本語入力時の全角「＃」正規化に成否がぶら下がる。
  「文字は検索バーへ」という board の唯一のルールに例外を作る点も却下理由。
- **案C「タグ棚」**（`⌥1〜9` で1打鍵付与＋常設の棚）: 付与速度とIME安全性は最良だが、
  常設バーが画面高の5.4%（26px / 480px）を恒久的に占有する。
  元の設計書が「パレットが巨大化する」を理由に2ペイン案を却下したのと同じ物差しで却下。
  なお `⌥1〜9` のショートカットだけを後から本案の上に足すことは可能（棚を出さない形）。
- **看板のタグをプレーンテキスト（`バグ · 緊急`）にする案**: 幅の効率は最良だが、
  「タグだと一目でわかる囲み」というユーザー要件を満たさないため却下。
- **タグ色をユーザーに選ばせる案**: ステータス色はユーザーが選べるため、
  タグ色も選べるとステータス色と同じ色のタグを作れてしまい、色の意味が壊れる。
  自動割当なら「ステータス＝鮮やか / タグ＝くすんだ色」という彩度の階層が構造的に保証される。

## DBスキーマ（migration v2）

`migrations.rs` の `MIGRATIONS` に `(2, V2)` を追記する。既存のv1は変更しない。

```sql
CREATE TABLE tags (
  id         TEXT PRIMARY KEY,
  board_id   TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  color      TEXT NOT NULL,            -- '#RRGGBB'。作成時に自動決定し以後不変
  position   INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX idx_tags_board_name ON tags(board_id, name);

CREATE TABLE task_tags (
  task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  tag_id  TEXT NOT NULL REFERENCES tags(id)  ON DELETE CASCADE,
  PRIMARY KEY (task_id, tag_id)
);
CREATE INDEX idx_task_tags_tag ON task_tags(tag_id);
```

**色を `position` から導出せず列に持つ理由**: 導出方式だとタグを1つ削除したときに
後続タグの色が全部ずれ、「赤かった『緊急』が緑になる」という記憶の破壊が起きる。
作成時に確定して動かさないほうが安全。

**色の決定アルゴリズム**（`tag_create` 内）: `TAG_COLORS`（後述の9色）を先頭から走査し、
そのボードで**まだ使われていない最初の色**を採用する。9色すべて使用済みなら
`既存タグ数 % 9` 番目の色を採用する（循環）。

**`board_delete` への追記**: 既存実装は FK 違反を避けるため `tasks → statuses → boards` の
順で明示削除している。ここに `task_tags → tags` を差し込み、
**`task_tags → tasks → tags → statuses → boards`** の順にする。

**ソフトデリートとの関係**: `tasks` はソフトデリート（`deleted_at`）で物理削除されないため、
`⌘⌫` で削除したタスクの `task_tags` は残る。`⌘Z` の復元でタグ付きのまま戻る（意図した仕様）。

## Tauriコマンド API

戻り値はすべて `Result<T, String>`。serdeは `#[serde(rename_all = "camelCase")]`。

| コマンド | 引数 | 戻り値 | 備考 |
|---|---|---|---|
| `tags_list` | `board_id` | `Vec<Tag>` | position昇順 |
| `tag_create` | `board_id, name` | `Tag` | 色は自動決定・末尾position。同名（前後trim後・大文字小文字無視）が既にあれば Err |
| `tag_rename` | `id, name` | `Tag` | 同ボード内で同名衝突すれば Err |
| `tag_delete` | `id` | `()` | `task_tags` は ON DELETE CASCADE で消える |
| `task_tag_toggle` | `task_id, tag_id` | `Vec<String>` | 付いていれば外し、無ければ付ける。トグル後の tagIds を返す。**（実装時追加）** `task.board_id != tag.board_id` は Err（`task_create` / `task_move` と同じ作法でボード整合性を検証。別ボードのタグを付けられないようにするため） |

`name` は前後の空白を trim して保存する。空文字は Err。

**同名判定の注意**: `UNIQUE INDEX idx_tags_board_name` は SQLite の既定照合（BINARY）なので、
`Bug` と `bug` を別物として通してしまう。大文字小文字を無視した同名拒否は
**Rust側で `LOWER(name)` による事前チェック**として実装し、INDEX は最後の砦として残す
（日本語には大文字小文字が無いため、実害が出るのは英字タグ名のみ）。

### 既存コマンドへの影響

`Task` を返す**すべての**コマンド（`tasks_list` / `task_create` / `task_update` /
`task_move` / `task_delete` / `task_restore`）が `tagIds` を埋める必要がある。
埋め漏れを防ぐため、行→`Task` の組み立ては `repo.rs` の**1箇所に集約**する。

- 単体取得: `fn load_tag_ids(conn: &Connection, task_id: &str) -> Result<Vec<String>>`
- 一覧取得: `tasks_list` は N+1 を避け、`task_tags` を1クエリでまとめて引いて
  `HashMap<String, Vec<String>>` に畳んでから割り当てる

`tagIds` の順序は `tags.position` 昇順で安定させる（表示順がブレないため）。

## TypeScript 型（`src/types.ts`）

```ts
export interface Tag {
  id: string;
  boardId: string;
  name: string;
  color: string;    // '#RRGGBB'
  position: number;
}

export interface Task {
  // ...既存フィールド
  tagIds: string[];   // tags.position 昇順
}
```

## タグ色パレット（`src/lib/tagPalette.ts` を新規作成）

既存の `src/lib/statusPalette.ts` と同じ作法で置く。

```ts
/** タグ色のプリセット。ステータス色より彩度を落とし、看板の主役を食わないようにする。 */
export const TAG_COLORS = [
  { name: "ブルー",   value: "#7EA9E8", fgLight: "#4A7CC4" },
  { name: "オレンジ", value: "#E8B478", fgLight: "#B07B32" },
  { name: "グリーン", value: "#7FCF9A", fgLight: "#4D9E6D" },
  { name: "レッド",   value: "#E88A85", fgLight: "#C9615B" },
  { name: "パープル", value: "#B98CD8", fgLight: "#8B5FB5" },
  { name: "ピンク",   value: "#E88AA6", fgLight: "#C25A7C" },
  { name: "ティール", value: "#8FC9E0", fgLight: "#4F92AE" },
  { name: "グレー",   value: "#A8A8AE", fgLight: "#7A7A80" },
  { name: "イエロー", value: "#C9B478", fgLight: "#9A8534" },
] as const;
```

チップの配色を返す純関数を同ファイルに置く（テスト対象）:

```ts
export interface ChipStyle { backgroundColor: string; color: string; }

/**
 * @param hex   タグの色（TAG_COLORS の value）
 * @param onStatus 選択中カード（ステータス色ベタ塗り）の上に載せるか
 * @param dark  ダークモードか
 */
export function tagChipStyle(hex: string, onStatus: boolean, dark: boolean): ChipStyle;
```

- `onStatus === true`: **タグ色を捨てて** `{ backgroundColor: "rgba(255,255,255,0.22)", color: "#fff" }` を返す。
  ステータス色ベタ塗りの上ではどんなタグ色も濁るため、白の不透明度に一本化する
- `onStatus === false && !dark`: `{ backgroundColor: hex + "38", color: fgLight }`（`0x38` ≒ 22%）
- `onStatus === false && dark`: `{ backgroundColor: hex + "2E", color: hex }`（`0x2E` ≒ 18%）
- `TAG_COLORS` に無い hex が渡された場合も落ちないこと（`fgLight` が引けなければ `hex` をそのまま文字色に使う）

`+n` の省略チップだけは常に無彩色（`--st-tag-bg` / `--st-tag-fg`、選択時は白系）にする。

## `index.css` に追加するトークン

自作CSSは既存の方針どおり**ファイル末尾のレイヤー外**に置く。

```css
:root {
  --st-tag-fg: #6e6e73;
  --st-tag-bg: rgba(0, 0, 0, 0.055);
}
@media (prefers-color-scheme: dark) {
  :root { --st-tag-fg: #a1a1a6; --st-tag-bg: rgba(255, 255, 255, 0.09); }
}
```

## zustandストアの追加（`src/store/appStore.ts`）

```ts
interface AppState {
  // ...既存
  tags: Tag[];                  // currentBoardの分。position昇順
  tagPaletteOpen: boolean;      // タグパレットの開閉

  openTagPalette(): void;       // selectedTaskId が null なら何もしない
  closeTagPalette(): void;
  toggleTaskTag(tagId: string): Promise<void>;         // 対象は selectedTaskId
  createTagAndAttach(name: string): Promise<void>;     // 作成→即付与
  renameTag(id: string, name: string): Promise<void>;
  deleteTag(id: string): Promise<void>;
}
```

### 非同期競合の防御（既存規約に従う）

- `selectBoard` は `tags` も `api.tagsList(boardId)` で読み込み、**boardEpoch のチェック対象に含める**。
  statuses / tasks と同じく、追い越されていたら set もトーストも黙って破棄する
- `selectBoard` 要求時に `tagPaletteOpen` を同期で `false` にする（ボードが変わればタグ集合も変わるため）
- `boardLoading` 中はタグ系ミューテーションも冒頭で即 return
- タグ系の commit 関数（作成・改名・削除）は `submittingRef` 相当で二重実行を防ぐ

### 使用件数のカウント

タグの使用件数（パレットの右端に出す数・削除確認ダイアログの件数）は**APIを増やさず**、
ストアの `tasks`（現在ボードの生存タスク）から数える:
`tasks.filter((t) => t.tagIds.includes(tag.id)).length`。
削除済みタスクは含まれない ＝ ユーザーが見えている件数と一致する。

## タグパレット（`src/components/TagPalette.tsx` を新規作成）

**実装時に判明した追加ファイル**: 1行分の表示（付け外し表示・インライン改名）を
`src/components/TagPaletteRow.tsx` に分離した（計画時のファイル構成表には無かった）。
`TagPalette.tsx` が絞り込み・キー入力・IME防御を、`TagPaletteRow.tsx` が1行の見た目と
改名入力欄のフォーカス保護を担当する形に責務を分けている。

### 位置づけ

`View` は増やさない。`board` / `detail` の**上に重なるオーバーレイ**として
`Palette.tsx` から `tagPaletteOpen` のときだけ描画する。
背景は `rgba(0,0,0,0.18)` のスクリム（クリックで閉じる）。
本体は幅300px・最大高260px、`.st-palette` と同じ角丸・影・blur を再利用して
「パレットの中のパレット」として見せる。ヘッダーに対象タスクのタイトルを1行で出す
（どのカードに付けているかを見失わせないため）。

### 起動

| スコープ | キー | 条件 |
|---|---|---|
| board | `⌘K` | `selectedTaskId !== null` のときのみ。無選択なら無反応（トーストも出さない） |
| detail | `⌘K` | 常時。開く前に `flushDetail()` で保留中の自動保存を確定する |

BlockNote のリンク作成ボタンが `editorDOMElement` に `⌘K` のリスナを張っており
（`@blocknote/react` の `CreateLinkButton`）、`stopPropagation` していないため
window 側と両方発火してしまう。BlockNote は本文にテキスト選択がある場合だけ
自身のハンドラで先に `preventDefault()` するので、`defaultPrevented` を見れば共存できる。

> **仕様として明記**: 詳細画面で**本文にテキスト選択がある状態の `⌘K` はリンク作成が優先**され、
> タグパレットは開かない。選択が無ければタグパレットが開く。

> **当初案からの変更（実装中に判明）**: 当初は「`useKeyboard` の `onKeyDown` の**先頭**に
> `if (e.defaultPrevented) return;` を無条件で置く」設計だったが、これは既存機能を壊すことが
> 実装中のレビューで判明した。BlockNote の `OverrideEscape` 拡張は、テキスト選択の有無に
> 関わらず**エディタにフォーカスがあるだけで** `Escape` にも `preventDefault()` するため、
> `onKeyDown` の先頭に無条件で置くと、詳細画面の既存機能である「Esc → 盤面へ戻る」まで
> 一緒に潰れてしまう。代わりに、ガードは **`handleDetailKey` の `⌘K` 分岐の中だけ**に置き
> （`if (event.defaultPrevented) return;` の直後で `flushDetail(); store.openTagPalette();`）、
> **board 側には置いていない**（board には BlockNote エディタが存在せず `⌘K` を
> `preventDefault` する相手がいないため、対称性を理由に足す必要がない）。

`tagPaletteOpen === true` の間、`useKeyboard` は `switcher` / `settings` と同様に
**早期 return** し、キーは TagPalette 自身のハンドラだけが処理する（二重発火の防止）。

### キーマップ

```
文字入力      即絞り込み。付与済みが上（✓付き）、未付与は使用件数の降順
↑ ↓          候補移動
Enter        ハイライト中のタグを付け外し（トグル）。入力欄をクリアし、開いたまま次を打てる
⌫（入力欄が空のとき）  付与済みの末尾を1つ外す
⌘Enter       完全一致するタグが無いとき「＋ 『xxx』を作成」を実行 → 作成＋即付与
⌘R           ハイライト中のタグをインライン入力に変えて改名（⌘Enter確定 / Esc取消）
⌘⌫           ハイライト中のタグを削除（ConfirmDialog で確認）
Esc          閉じる（トグル時点で保存済み。保存操作は無い）
```

**実装メモ: ハイライトの管理方法（実装中に判明・当初案から変更）**: 当初は候補配列の
`highlight: number`（index）でハイライト位置を持つ想定だったが、実装中のレビューで
「トグルすると付与済み/使用件数で並び替わるため、index方式だと押した直後に別の行を
指してしまう」事故が起きることが判明した。実装では **`highlightId: string | null`
（ハイライト中のタグid）** で持つ形に変更している。id で持てば、トグルで `rows` の並びが
変わっても同じタグを指し続けられる。`null` は「着地点なし」（IME変換中など）を表す。

各行の左に**タグ色のスウォッチ**（6px円）、右に**使用件数**を出す。
最下部に自前のヒント行を持ち、`FooterHints` を覆う
（`FooterHints` の `Record<View, ...>` を触らずに済ませるため）:
`⏎ 付け外し / ⌘⏎ 作成 / ⌘R 改名 / ⌘⌫ 削除 / Esc 閉じる`

削除の確認文言:
> 「バグ」を削除しますか？ / 8件のタスクからこのタグが外れます。元に戻せません。

### IME防御（本設計の要）

原則: **IMEが原理的に生成できない入力でだけ、不可逆な操作をコミットする。**

1. **不可逆な操作（作成・改名確定・削除）は必ず修飾キー付き**（`⌘Enter` / `⌘⌫`）。
   IMEの変換確定が出せるのは素の `Enter` だけなので、誤爆が構造的に不可能になる
2. **IME変換中（`compositionstart` 〜 `compositionend`）は `highlightId` を `null`** にし、
   `Enter` の着地点そのものを消す（`-1` という数値の着地点は存在しない。上記「ハイライトの
   管理方法」のとおり `highlightId: string | null` で持つため）
3. **`compositionend` で「次の `keydown` が `Enter` なら1回だけ無視する」フラグ**を立てる。
   時間ではなく**次の1イベント**に依存するため確実（WebKitは `compositionend` を
   `keydown` より先に発火するため、`isComposing` だけでは変換確定Enterを取りこぼす）
4. `Enter` を使うのは**可逆なトグルだけ**。誤爆してももう一度押せば戻る

既存 `TaskDetail` の「Enter2回押し」方式より確実で、かつユーザーの打鍵は増えない。

## 看板（`TaskCard.tsx`）でのタグ表示

- タイトルの下に、色付きの四角チップ（角丸5px / フォント9.5px / 行高14px / 左右padding 5px / gap 3px）
- 配色は `tagChipStyle(tag.color, selected, isDark)` で引く
- **タグを1つも持たないカードは、チップ行そのものを描画しない**（高さが1pxも増えない）。
  ウィンドウは720×480でカード領域は約338px、可視カード数が体験の要のため
- **あふれは文字数ではなく実測のはみ出しで折り、残数を `+n` チップにする**
  （「バグ」と「リファクタリング」で挙動が変わらないようにするため）。
  実装は ResizeObserver ではなく、描画後に `offsetTop` が1行目と異なるチップを
  たたむ方式で十分（レーン幅はウィンドウ固定のためほぼ変化しない）。
  **jsdom では `offsetTop` が常に 0 のため、Vitest 上では「全チップが1行目」＝省略なしになる。**
  自動テストでは「タグを全部描画すること」「タグ0個なら行ごと描画しないこと」「配色の切替」までを
  検証し、`+n` の折り返しは手動スモークチェックで確認する（jsdomで測れないものをテストで
  偽装しない）
- 選択中カードはステータス色ベタ塗り＋白文字。チップは白22%地＋白文字に一律で切り替わる

## 詳細画面（`TaskDetail.tsx`）でのタグ表示

- **タイトル入力の直下、本文エディタの上**。左端は `mx-8` でタイトル・本文と揃える
- 幅に余裕があるため**全タグを省略なしで表示**する（`+n` を使わない）
- ステータスバッジはヘッダー行の右端のまま（既存維持）。
  「ステータス＝状態」「タグ＝属性」を**縦位置で分ける**
- タグが0個のときは `⌘K でタグを追加` を `--st-text-tertiary` で置く（発見可能性の担保）

## 検索での `#タグ名`

### パース（`src/lib/boardNav.ts` に追加）

```ts
export interface ParsedQuery {
  text: string;        // タイトル検索に使う残りの文字列
  tagNames: string[];  // '#' を除いたタグ名（重複除去済み・空文字は含まない）
}
export function parseSearchQuery(query: string): ParsedQuery;
```

- 先頭で**全角「＃」を半角「#」に正規化**する（日本語入力ONの `Shift+3` 対策）。
  1箇所でも漏らすと「打っても何も起きない」最悪の体験になるため、正規化は `normalizeHash`
  （`src/lib/boardNav.ts`）に集約し、タグトークンを判定する箇所（`parseSearchQuery` 本体、
  `SearchBar` の直近トークン抽出）は必ずこれ経由で行う。個別に `/＃/g` を書き足さないこと
- 空白区切りのトークンのうち `#` で始まるものを `tagNames` へ（先頭の `#` を除去。
  `#` 単独は無視）、残りを半角空白1つで連結して `text` にする

### 絞り込み（`filterTasks` の拡張）

```ts
export function filterTasks(tasks: Task[], query: string, tags: Tag[]): Task[];
```

- `text` は従来どおりタイトルの部分一致（大文字小文字を区別しない）
- 各 `tagName` について、`tags` から候補集合を決める:
  1. 名前が**完全一致**（前後trim・大文字小文字無視）するタグがあれば、それ1つ
  2. 無ければ**前方一致**する全タグ（打鍵の途中でも絞り込みが効くようにするため）
- タスクは、**すべての `tagName` について**その候補集合の**いずれか**を持っていること
  （tagName 間はAND、候補集合の中はOR）
- 候補集合が空になる `tagName` が1つでもあれば結果は0件（誤って全件を出さない）

### サジェスト（`SearchBar.tsx`）

- `#`（または `＃`）を打った瞬間、検索バーの直下にドロップダウン。ボードのタグを使用件数の降順で表示
- `#ば` のように打つと前方一致で絞り込む
- **確定は `Tab` のみ。`Enter` には一切触らない**。
  board の `Enter` は「詳細を開く / 新規作成」であり、絶対に上書きしてはならない。
  `↑↓` も board ではカード移動に使われているため使わない。候補送りは `Tab` の連打とする
- **絞り込み中のフィードバック**: サジェスト各行に出すタグ色のスウォッチと、
  レーンヘッダーの件数が絞り込み後の値に変わることで伝える。検索バーの文字列は
  プレーンなまま（トークン化しない）にして編集可能性を保つ
- **表示条件（実装中に判明・追加）**: ドロップダウンの表示は `focused && view === "board" && ...`
  とし、`view === "board"` を必須にする。`SearchBar` は `Palette.tsx` から view に関係なく
  常時マウントされたままなので、フォーカスの有無だけで判定すると、検索バーで `#` を打った
  状態からカードを開いて詳細画面に移っても、ドロップダウンが詳細画面の上に浮いたまま
  残ってしまう

> **当初案からの変更（計画作成時に判断）**: 検索バー内の `#バグ` の部分だけを
> Avoliq Blue `#0A84FF` の文字色＋下線にする案を採っていたが、`<input>` のテキストの一部だけを
> 着色するには入力欄の背後に同じフォント・同じパディングのミラー要素を重ねる必要があり、
> 日本語入力と横スクロールの同期で破綻しやすい。**得られる効果に対して実装リスクが高すぎる**ため
> 見送る。必要になったら別タスクとして切り出す。

## `FooterHints.tsx` への追加

board / detail にそれぞれ1つだけ追加する（board は既に11項目あり折り返しているため増やしすぎない）。

```
board:  ... ["⌘N","新規作成"], ["⌘P","検索"], ["⌘K","タグ"], ["⌘B","ボード切替"], ["⌘,","設定"], ["Esc","閉じる"]
detail: ["⌘←→","ステータス"], ["⌘T","タイトル"], ["⌘K","タグ"], ["⌘N","新規作成"], ["⌘P","検索"], ["Esc","ボードに戻る"]
```

タグパレット表示中は、パレット自身が最下部に自前のヒント行を出して `FooterHints` を覆う。

## 影響範囲（実装時に必ず踏むところ）

1. **`Task` 型に `tagIds` が増えるため、既存のフロントテスト全体に波及する。**
   `src/test/fixtures.ts` のタスク生成ヘルパに `tagIds: []` を既定値として持たせ、
   `appStore.test.ts`（995行）ほか既存テストがヘルパ経由になっているかを先に確認する。
   直書きしている箇所は個別に修正が必要
2. **Rust 側で `Task` を返す全コマンドの `tagIds` 埋め漏れ**。`repo.rs` の行→Task 組み立てを
   1箇所に集約して防ぐ
3. **`⌘K` と BlockNote のリンク作成の共存**。`useKeyboard.ts` の `handleDetailKey` の `⌘K` 分岐
   の中だけに置く `defaultPrevented` チェック（`onKeyDown` の先頭ではない。理由は上記
   「起動」節の「当初案からの変更」を参照）
4. **`board_delete` の明示削除順**に `task_tags → tags` を追加
5. **`selectBoard` の boardEpoch チェックに `tags` を含める**（非同期競合の防御規約）
6. **`filterTasks` のシグネチャ変更**（第3引数に `tags` が増える）。呼び出し元は**4箇所**:
   `Board.tsx` / `useKeyboard.ts`（`handleBoardKey` 内の `buildLanes`）/
   `appStore.ts` の `setSearchQuery` と `deleteSelectedTask`。
   カーソル移動のレーン計算・削除後の選択・実際の表示が食い違わないよう、必ず全部同時に直す。
   第3引数は**省略不可**にして、直し忘れをコンパイルエラーで検出させる
7. **`task_tag_toggle` のボード整合性検証**（実装時追加）。`task.board_id != tag.board_id` を
   Err にしないと、別ボードのタグを付けられてしまう
8. **`SearchBar` のサジェスト表示条件に `view === "board"` を含める**（実装時判明）。
   `SearchBar` は `Palette.tsx` から view に関係なく常時マウントされたままなので、
   フォーカス状態だけで判定すると詳細画面に切り替えたあともドロップダウンが浮いたまま
   残ってしまう
9. **`TaskCard` のチップ折返し測定は `src/hooks/useChipOverflow.ts` に切り出した**
   （計画時のファイル構成表には無かった）。「+n」チップの幅見積もりも固定値ではなく、
   非表示件数の桁数に応じて計算する（タグ数に上限が無いため、2桁以上になりうる）

## テスト方針

### Rust（`repo.rs` の `#[cfg(test)]`・インメモリSQLite）

- `tags` の作成・一覧・改名・削除
- 同名タグの拒否（作成時・改名時の両方。前後trim・大文字小文字無視）
- 空文字の名前を拒否
- `task_tag_toggle` の往復（付ける→外す→付ける）
- 色の自動割当: 未使用色から順に選ばれること／9色使い切ったあと循環すること／
  途中のタグを削除しても既存タグの色が変わらないこと
- `board_delete` で `tags` と `task_tags` まで消えること
- タスクをソフトデリートしても `task_tags` が残り、`task_restore` でタグ付きのまま戻ること
- `tasks_list` の `tagIds` が `tags.position` 昇順であること
- migration: v2適用後に `tags` / `task_tags` が存在し、`current_version` が 2 になること／
  v1適用済みDBに対して v2 だけが追加適用されること／`migrate` を二度呼んでも安全なこと

### React（Vitest + Testing Library）

- `parseSearchQuery`: `ログイン #バグ #緊急` の分解／全角 `＃` の正規化／`#` 単独の無視／
  重複タグ名の除去／タグのみ・テキストのみのクエリ
- `filterTasks`: タグAND条件／前方一致でのOR／完全一致の優先／存在しないタグ名で0件
- `tagChipStyle`: 通常時・選択時・ダークモードの3系統／`TAG_COLORS` に無い hex でも落ちないこと
- `TagPalette`: 絞り込み／`↑↓` 移動／`Enter` トグル／空欄 `⌫` で末尾を外す／
  `⌘Enter` 作成／`⌘R` 改名／`⌘⌫` 削除の確認ダイアログ／`Esc` で閉じる
- **IME**: `compositionstart` 中は `highlightId` が `null` になること／
  `compositionend` 直後の `Enter` が1回だけ無視されること／
  その次の `Enter` は通常どおりトグルすること
- `TaskCard`: チップの表示／タグ0個のとき行が描画されないこと／`+n` の省略／
  選択時に白系配色へ切り替わること
- `useKeyboard`: board で無選択のとき `⌘K` が無反応なこと／`defaultPrevented` の `⌘K` を無視すること／
  `tagPaletteOpen` 中は board/detail のキーを処理しないこと
- `appStore`: `selectBoard` で tags が読み込まれること／追い越された応答が破棄されること／
  `boardLoading` 中はタグ系ミューテーションが no-op になること

### 手動スモークチェック

実ウィンドウでの確認項目（E2E自動化はコストが高いため既存方針どおり手動）:

1. 日本語入力ONで「ばぐ」と打ち、変換確定の `Enter` でタグが誤って付かない／作られないこと
2. 日本語入力ONで `Shift+3` を押して `＃` になる環境でも検索の絞り込みが効くこと
3. 詳細画面で本文を選択した状態の `⌘K` がリンク作成になり、選択なしならタグパレットが開くこと
4. タグの多いカードで `+n` が正しく折り返し、カードの高さが揺れないこと
5. ライト／ダーク両方でチップが読めること（未選択・選択中の両方）
