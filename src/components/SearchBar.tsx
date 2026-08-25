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
    // 修飾キー付きは別の役目を持つので奪わない。⌘↑↓はカードの並び替え、⇧↑↓は
    // 「検索欄からレーンへ入る」操作(useKeyboard側が⇧付きでも拾う仕様)。
    // 特に⌘系は useKeyboard 側のdefaultPreventedガードより前で処理されるため、
    // ここで奪うと「候補が動く」と「カードが並び替わる」が同時に起きてしまう
    if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
    // 候補が出ていないときは何も奪わない。カード移動も「開く / 作成」も従来どおり
    // window のハンドラ(useKeyboard)へ届く
    if (view !== "board" || !isTagToken || suggestions.length === 0) return;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setHighlightIndex(
        activeIndex === null ? 0 : Math.min(activeIndex + 1, suggestions.length - 1),
      );
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
