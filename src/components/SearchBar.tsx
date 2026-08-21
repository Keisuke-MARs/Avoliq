import { Search } from "lucide-react";
import { useRef } from "react";
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

  /**
   * Tab連打で候補を送るための状態。
   * base = ユーザーが実際に打った文字（補完で置き換わる前の値）、cycle = 何番目の候補を出しているか。
   * 補完自体が searchQuery を書き換えるので、打った文字を別に覚えておかないと候補が固定されてしまう。
   */
  const tabBaseRef = useRef<string | null>(null);
  const tabCycleRef = useRef(0);

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

    // 補完は Tab だけで行う。Enter は board の「詳細を開く / 新規作成」の中核キーなので
    // ここで奪うと board のゴールデンパスが壊れる。Tab はIMEの変換確定を生成せず、
    // board でも未割当(default: break)なので安全に奪える
    event.preventDefault();
    if (tabBaseRef.current === null) {
      tabBaseRef.current = lastToken;
      tabCycleRef.current = 0;
    }
    // 直前のTab以外のキーで参照だけリセットされ再描画が起きていない場合に備え、
    // 描画時のsuggestionsを使い回さずここで確定した base から作り直す
    const freshSuggestions = computeSuggestions(tabBaseRef.current);
    if (freshSuggestions.length === 0) return;
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
        onKeyDown={handleKeyDown}
        className="st-search-input w-full bg-transparent text-[17px] outline-none"
        style={{ color: "var(--st-text-primary)" }}
      />

      {isTagToken && suggestions.length > 0 && (
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
