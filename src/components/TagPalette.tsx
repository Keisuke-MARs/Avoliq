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
  // -1 は「着地点なし」。IME変換中はここへ落としてEnterを無害化する
  const [highlight, setHighlight] = useState(0);
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

  // 候補が変わったら先頭に戻す（候補が消えたら着地点なしにする）
  useEffect(() => {
    setHighlight(rows.length > 0 ? 0 : -1);
  }, [rows.length, query]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

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
      setHighlight((current) => (rows.length === 0 ? -1 : Math.min(current + 1, rows.length - 1)));
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlight((current) => (rows.length === 0 ? -1 : Math.max(current - 1, 0)));
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
      const row = rows[highlight];
      if (row === undefined) return;
      // トグルは可逆なので、万一の誤爆でももう一度押せば戻る
      void toggleTaskTag(row.tag.id);
      setQuery("");
      return;
    }
  };

  return (
    <div
      data-testid="tag-palette-scrim"
      className="absolute inset-0 z-30 flex items-start justify-center bg-black/[0.18] pt-16 backdrop-blur-[1px]"
      onClick={closeTagPalette}
    >
      <div
        role="dialog"
        aria-label="タグ"
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
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoComplete="off"
          spellCheck={false}
          placeholder="タグ名を入力"
          className="st-input bg-transparent px-3 py-2 text-[13px] outline-none"
          style={{ color: "var(--st-text-primary)" }}
        />

        <div role="listbox" aria-label="タグ候補" className="min-h-0 flex-1 overflow-y-auto px-1.5 pb-1.5">
          {rows.map((row, index) => (
            <div
              key={row.tag.id}
              role="option"
              aria-selected={row.attached}
              data-testid="tag-palette-row"
              data-highlighted={index === highlight ? "true" : "false"}
              onClick={() => void toggleTaskTag(row.tag.id)}
              className={`flex cursor-default items-center gap-2 rounded-md px-2 py-1 text-[12px] ${
                index === highlight ? "st-row-selected" : ""
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
          ))}
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
