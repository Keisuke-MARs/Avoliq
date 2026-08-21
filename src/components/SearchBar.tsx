import { Search } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { SEARCH_INPUT_ID } from "@/hooks/useKeyboard";
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
   * Tab連打で候補を送るための状態。
   * base = ユーザーが実際に打った文字（補完で置き換わる前の値）、cycle = 何番目の候補を出しているか。
   * 補完自体が searchQuery を書き換えるので、打った文字を別に覚えておかないと候補が固定されてしまう。
   */
  const tabBaseRef = useRef<string | null>(null);
  const tabCycleRef = useRef(0);

  /**
   * SearchBar は Palette.tsx で view に関係なく常時マウントされたままなので
   * (Board/TaskDetailのようにviewでアンマウントされない)、「今この入力欄を操作中か」を
   * フォーカス状態として別に持っておく。これが無いと、検索欄で#タグを打ってから
   * カードを開いて詳細画面に移っても、ドロップダウンが詳細画面の上に浮いたまま残ってしまう。
   */
  const [focused, setFocused] = useState(false);

  /**
   * ボード切替(selectBoard)はonChange/onBlurを経由せず、searchQueryとcurrentBoardIdを
   * 直接まとめて書き換える。そのため候補送りの状態(tabBaseRef/tabCycleRef)を放置すると、
   * 切替後に前のボードの続きの位置からTab補完が始まってしまう。currentBoardIdの変化を
   * 検知して、そのタイミングで必ずリセットする。
   */
  useEffect(() => {
    tabBaseRef.current = null;
    tabCycleRef.current = 0;
  }, [currentBoardId]);

  // 全角＃は日本語入力ONのShift+3で出る。boardNav.parseSearchQuery と同じく必ず正規化する
  const normalized = searchQuery.replace(/＃/g, "#");
  const lastToken = normalized.split(/\s+/).pop() ?? "";
  const isTagToken = lastToken.startsWith("#");

  /**
   * トークン文字列から候補タグを計算する。
   * useMemo にすると tabBaseRef(ref)の変化では再計算されず、
   * 「Tab以外のキーで参照だけリセットして再描画は起きない」ケースで前回描画時の
   * 古い候補配列を使ってしまう(候補送りが1周目に巻き戻るバグになる)。
   * そのためTab押下時は毎回このまま呼び出して候補を作り直す。
   */
  function computeSuggestions(tokenSource: string): Tag[] {
    if (!isTagToken) return [];
    const prefix = tokenSource.replace(/^#/, "").toLowerCase();
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

  // ドロップダウン表示用。描画のたびに計算するので常に現在の入力と一致する
  const suggestions = computeSuggestions(tabBaseRef.current ?? lastToken);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    // IMEが処理中のキーには触らない
    if (event.nativeEvent.isComposing || event.keyCode === 229) return;

    if (event.key !== "Tab") {
      // Tab以外が来たら補完のサイクルはリセットする
      tabBaseRef.current = null;
      tabCycleRef.current = 0;
      return;
    }
    if (!isTagToken) return;

    // tabBaseRef はまだ書き換えず、今回使う base だけ先に確定する。
    // 直前のTab以外のキーで参照だけリセットされ再描画が起きていない場合に備え、
    // 描画時のsuggestionsを使い回さずここで確定した base から作り直す
    const base = tabBaseRef.current ?? lastToken;
    const freshSuggestions = computeSuggestions(base);
    // 候補が0件ならここで抜ける。tabBaseRef/tabCycleRefはまだ何も書き換えていないので
    // 状態は汚れない(次に候補が出たとき、変な位置から候補送りが始まらない)。
    // ここで preventDefault していないので、Tabのネイティブなフォーカス移動も邪魔しない
    if (freshSuggestions.length === 0) return;

    // 候補が1件以上あるときだけ preventDefault する。補完は Tab だけで行う。
    // Enter は board の「詳細を開く / 新規作成」の中核キーなので、ここで奪うと
    // board のゴールデンパスが壊れる。Tab はIMEの変換確定を生成せず、
    // board でも未割当(default: break)なので安全に奪える
    event.preventDefault();
    if (tabBaseRef.current === null) {
      tabBaseRef.current = base;
      tabCycleRef.current = 0;
    }
    const picked = freshSuggestions[tabCycleRef.current % freshSuggestions.length];
    tabCycleRef.current += 1;

    const head = normalized.slice(0, normalized.length - lastToken.length);
    setSearchQuery(`${head}#${picked.name}`);
  };

  return (
    <div
      className="relative flex h-14 shrink-0 items-center gap-2.5 border-b px-4"
      style={{ borderColor: "var(--st-palette-border)" }}
    >
      <Search size={18} className="shrink-0" style={{ color: "var(--st-text-tertiary)" }} />
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
          // 打ち直したら補完のサイクルもリセットする
          tabBaseRef.current = null;
          tabCycleRef.current = 0;
          setSearchQuery(e.target.value);
        }}
        onFocus={() => setFocused(true)}
        onBlur={() => {
          // フォーカスが外れたら候補送りの状態も一緒に捨てる。
          // (例: カード選択でuseKeyboardがblurSearchInputを呼んだあと、再び検索欄へ戻って
          // Tabを押したとき、前回の続きの位置から補完されると使用者が混乱するため)
          tabBaseRef.current = null;
          tabCycleRef.current = 0;
          setFocused(false);
        }}
        onKeyDown={handleKeyDown}
        className="st-search-input w-full bg-transparent text-[17px] outline-none"
        style={{ color: "var(--st-text-primary)" }}
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
          className="absolute left-11 top-[52px] z-20 w-56 overflow-hidden rounded-lg py-1 shadow-lg"
          style={{
            backgroundColor: "var(--st-palette-bg)",
            border: "0.5px solid var(--st-palette-border)",
          }}
        >
          {suggestions.map((tag) => (
            <div
              key={tag.id}
              className="flex items-center gap-2 px-2.5 py-1 text-[12px]"
              style={{ color: "var(--st-text-primary)" }}
            >
              <span
                className="h-1.5 w-1.5 shrink-0 rounded-full"
                style={{ backgroundColor: tag.color }}
              />
              <span className="min-w-0 flex-1 truncate">{tag.name}</span>
              <span className="shrink-0 text-[10px]" style={{ color: "var(--st-text-tertiary)" }}>
                Tab
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
