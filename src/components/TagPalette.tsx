import { Check, Tag as TagIcon } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useAppStore } from "@/store/appStore";
import type { Tag } from "@/types";

/** 1行分の表示データ */
interface TagRow {
  tag: Tag;
  attached: boolean;
  count: number;
}

/**
 * ⌘Kで開くタグ付与・管理オーバーレイ。
 * viewは増やさず、board / detail の上に重ねる。付け外し・作成・改名・削除がこの1枚で完結する。
 */
export function TagPalette() {
  const tasks = useAppStore((s) => s.tasks);
  const allTags = useAppStore((s) => s.tags);
  const selectedTaskId = useAppStore((s) => s.selectedTaskId);
  const closeTagPalette = useAppStore((s) => s.closeTagPalette);
  const toggleTaskTag = useAppStore((s) => s.toggleTaskTag);

  const [query, setQuery] = useState("");
  // ハイライトはindexではなくタグidで持つ。トグルすると付与済み/使用件数で並び替わるため、
  // indexだけで管理すると「押した直後に別の行を指してしまう」事故が起きる
  // (idで持てば、並び替わっても同じタグを指し続ける)。nullは「着地点なし」。
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const task = tasks.find((t) => t.id === selectedTaskId) ?? null;

  const rows = useMemo<TagRow[]>(() => {
    const q = query.trim().toLowerCase();
    const counts = new Map<string, number>();
    for (const t of tasks) {
      for (const id of t.tagIds) counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    const visible = allTags.filter((t) => q === "" || t.name.toLowerCase().includes(q));
    const decorate = (tag: Tag): TagRow => ({
      tag,
      attached: task?.tagIds.includes(tag.id) ?? false,
      count: counts.get(tag.id) ?? 0,
    });
    // 付与済みは task.tagIds の順（= tags.position 昇順）、未付与は使用件数の降順
    const attached = (task?.tagIds ?? [])
      .map((id) => visible.find((t) => t.id === id))
      .filter((t): t is Tag => t !== undefined)
      .map(decorate);
    const rest = visible
      .filter((t) => !(task?.tagIds.includes(t.id) ?? false))
      .map(decorate)
      .sort((a, b) => b.count - a.count || a.tag.position - b.tag.position);
    return [...attached, ...rest];
  }, [allTags, tasks, task, query]);

  // 絞り込み文字列が変わったときは「今どこにいたか」より予測しやすさを優先し、常に先頭へ戻す
  // (候補が0件になったら着地点なしにする)
  useEffect(() => {
    setHighlightId(rows[0]?.tag.id ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  // トグルによる並び替えなど、クエリ以外の理由でrowsが変わった場合は、
  // ハイライト中のタグがまだ候補に残っていればそのまま追随させ、消えたときだけ先頭へ戻す
  useEffect(() => {
    if (highlightId !== null && rows.some((row) => row.tag.id === highlightId)) return;
    setHighlightId(rows[0]?.tag.id ?? null);
  }, [rows, highlightId]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const highlightIndex = highlightId === null ? -1 : rows.findIndex((row) => row.tag.id === highlightId);

  const moveHighlight = (delta: 1 | -1) => {
    if (rows.length === 0) {
      setHighlightId(null);
      return;
    }
    const base = highlightIndex === -1 ? 0 : highlightIndex;
    const next = Math.min(Math.max(base + delta, 0), rows.length - 1);
    setHighlightId(rows[next]?.tag.id ?? null);
  };

  // 行クリック後もタイピングを続けられるよう、フォーカスは常に入力欄に残す。
  // 行のdivはtabIndexを持たないフォーカス不可能な要素なので、クリック(mousedown)の
  // デフォルト動作を止めないと入力欄からフォーカスが外れ、以後キー操作が効かなくなる。
  const handleRowActivate = (tagId: string) => {
    void toggleTaskTag(tagId);
    inputRef.current?.focus();
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    // window側のハンドラへ漏らさない（useKeyboard 側でも tagPaletteOpen で止めているが二重に守る）
    event.stopPropagation();

    if (event.key === "Escape") {
      event.preventDefault();
      closeTagPalette();
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      moveHighlight(1);
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      moveHighlight(-1);
      return;
    }

    if (event.key === "Backspace" && query === "") {
      // トークン入力の慣習に合わせ、入力欄が空のときだけ末尾のタグを外す
      const lastId = task?.tagIds[task.tagIds.length - 1];
      if (lastId === undefined) return;
      event.preventDefault();
      void toggleTaskTag(lastId);
      return;
    }

    if (event.key === "Enter" && !event.metaKey) {
      event.preventDefault();
      const row = rows[highlightIndex];
      if (row === undefined) return;
      // トグルは可逆なので、万一の誤爆でももう一度押せば戻る
      void toggleTaskTag(row.tag.id);
      setQuery("");
      return;
    }
  };

  const activeOptionId = highlightId === null ? undefined : `tag-palette-option-${highlightId}`;

  return (
    <div
      data-testid="tag-palette-scrim"
      className="absolute inset-0 z-30 flex items-start justify-center bg-black/[0.18] pt-16 backdrop-blur-[1px]"
      onClick={closeTagPalette}
    >
      <div
        ref={containerRef}
        role="dialog"
        aria-label="タグ"
        // BoardSwitcher/ConfirmDialogと同じく、コンテナ自体をフォーカス可能にしておく
        // (最終的なフォーカスは入力欄に置くが、何らかの理由でフォーカスが外れても
        // documentまで飛ばさずこの中に留めるための保険)
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
        className="flex max-h-[260px] w-[300px] flex-col overflow-hidden rounded-xl shadow-xl"
        style={{
          backgroundColor: "var(--st-palette-bg)",
          border: "0.5px solid var(--st-palette-border)",
        }}
      >
        <header
          className="flex items-center gap-1.5 border-b px-3 py-2"
          style={{ borderColor: "var(--st-palette-border)" }}
        >
          <TagIcon size={13} style={{ color: "var(--st-text-tertiary)" }} />
          <span
            className="truncate text-[11px]"
            style={{ color: "var(--st-text-secondary)" }}
          >
            {task?.title ?? ""}
          </span>
        </header>

        <input
          ref={inputRef}
          data-testid="tag-palette-input"
          aria-label="タグを検索または作成"
          aria-activedescendant={activeOptionId}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoComplete="off"
          spellCheck={false}
          placeholder="タグ名を入力"
          className="st-input bg-transparent px-3 py-2 text-[13px] outline-none"
          style={{ color: "var(--st-text-primary)" }}
        />

        <div role="listbox" aria-label="タグ候補" className="min-h-0 flex-1 overflow-y-auto px-1.5 pb-1.5">
          {rows.map((row) => {
            const highlighted = row.tag.id === highlightId;
            return (
              <div
                key={row.tag.id}
                id={`tag-palette-option-${row.tag.id}`}
                role="option"
                // aria-selectedはキーボードカーソルの位置(BoardSwitcher等と同じ意味)。
                // 付与済みかどうかはaria-checkedで別途表す。
                aria-selected={highlighted}
                aria-checked={row.attached}
                data-testid="tag-palette-row"
                data-highlighted={highlighted ? "true" : "false"}
                // mousedownのデフォルト動作(フォーカス移動)を止め、入力欄のフォーカスを死守する
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => handleRowActivate(row.tag.id)}
                className={`flex cursor-default items-center gap-2 rounded-md px-2 py-1 text-[12px] ${
                  highlighted ? "st-row-selected" : ""
                }`}
                style={{ color: "var(--st-text-primary)" }}
              >
                <span
                  className="h-1.5 w-1.5 shrink-0 rounded-full"
                  style={{ backgroundColor: row.tag.color }}
                />
                <span className="flex w-3 shrink-0 items-center justify-center">
                  {row.attached && (
                    <Check size={11} style={{ color: "var(--st-text-secondary)" }} />
                  )}
                </span>
                <span className="min-w-0 flex-1 truncate">{row.tag.name}</span>
                <span className="shrink-0 tabular-nums text-[10px]" style={{ color: "var(--st-text-tertiary)" }}>
                  {row.count}
                </span>
              </div>
            );
          })}
        </div>

        <footer
          className="flex flex-wrap gap-x-2.5 gap-y-1 border-t px-3 py-1.5 text-[9.5px]"
          style={{
            borderColor: "var(--st-palette-border)",
            color: "var(--st-text-tertiary)",
          }}
        >
          <span>⏎ 付け外し</span>
          <span>⌘⏎ 作成</span>
          <span>⌘R 改名</span>
          <span>⌘⌫ 削除</span>
          <span>Esc 閉じる</span>
        </footer>
      </div>
    </div>
  );
}
