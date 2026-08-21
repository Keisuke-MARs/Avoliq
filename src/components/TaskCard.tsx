import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { usePrefersDark } from "@/hooks/usePrefersDark";
import { tagChipStyle } from "@/lib/tagPalette";
import { useAppStore } from "@/store/appStore";
import type { Tag, Task } from "@/types";

interface TaskCardProps {
  task: Task;
  /** 所属レーンのステータス色。選択時の強調に使う */
  statusColor: string;
  selected: boolean;
}

/** 「+n」チップの想定幅(px)。実測せず固定で見積もる */
const MORE_CHIP_WIDTH = 26;
/** チップ間の隙間(px)。className の gap-[3px] と一致させること */
const CHIP_GAP = 3;

export function TaskCard({ task, statusColor, selected }: TaskCardProps) {
  const setSelectedTask = useAppStore((s) => s.setSelectedTask);
  const setView = useAppStore((s) => s.setView);
  const allTags = useAppStore((s) => s.tags);
  const isDark = usePrefersDark();
  const ref = useRef<HTMLDivElement>(null);

  // キーボードで選択が移動したとき、カードが画面外なら見える位置までスクロールする
  useEffect(() => {
    if (selected) ref.current?.scrollIntoView({ block: "nearest" });
  }, [selected]);

  // 既に消えたタグidが残っていても落ちないよう、引けたものだけ使う
  const tags = task.tagIds
    .map((id) => allTags.find((t) => t.id === id))
    .filter((t): t is Tag => t !== undefined);

  const tagKey = task.tagIds.join(",");
  const rowRef = useRef<HTMLDivElement>(null);
  // null = 「まだ測っていない」。この間は全チップを描画して、それを実測する
  const [visibleCount, setVisibleCount] = useState<number | null>(null);

  // タグが変わったら測り直す
  useLayoutEffect(() => {
    setVisibleCount(null);
  }, [tagKey]);

  useLayoutEffect(() => {
    // 測定は「全チップが描かれている」ときだけ行う（ここで早期returnするのでループしない）
    if (visibleCount !== null) return;
    const row = rowRef.current;
    if (row === null) return;
    const chips = Array.from(row.children) as HTMLElement[];
    if (chips.length === 0) return;

    const limit = row.clientWidth;
    // jsdom は offsetWidth / clientWidth が常に0で測れない。省略せず全部見せる
    if (limit === 0) {
      setVisibleCount(chips.length);
      return;
    }

    let used = 0;
    let fit = 0;
    for (const chip of chips) {
      const next = used + (fit === 0 ? 0 : CHIP_GAP) + chip.offsetWidth;
      if (next > limit) break;
      used = next;
      fit += 1;
    }
    if (fit >= chips.length) {
      setVisibleCount(chips.length);
      return;
    }
    // 「+n」を置く余白が無ければ、入るまで1つずつ削る
    while (fit > 1 && used + CHIP_GAP + MORE_CHIP_WIDTH > limit) {
      used -= chips[fit - 1].offsetWidth + CHIP_GAP;
      fit -= 1;
    }
    setVisibleCount(Math.max(1, fit));
  }, [visibleCount, tagKey]);

  const shown = visibleCount === null ? tags : tags.slice(0, visibleCount);
  const hidden = tags.length - shown.length;

  return (
    <div
      ref={ref}
      role="button"
      // フォーカスは検索バーに集約するため、カード自体はタブ移動の対象にしない
      tabIndex={-1}
      data-testid="task-card"
      data-task-id={task.id}
      data-selected={selected ? "true" : "false"}
      onClick={() => setSelectedTask(task.id)}
      onDoubleClick={() => {
        setSelectedTask(task.id);
        setView("detail");
      }}
      className={
        selected
          ? "st-card cursor-default rounded-xl px-3 py-2 text-[13px] leading-snug"
          : "st-card cursor-default rounded-xl px-3 py-2 text-[13px] leading-snug shadow-sm"
      }
      style={
        selected
          ? {
              backgroundColor: statusColor,
              color: "#fff",
              boxShadow: `0 4px 12px ${statusColor}59`,
            }
          : { color: "var(--st-text-primary)" }
      }
    >
      {task.title}
      {/* タグを持たないカードは行そのものを描画しない（可視カード数を減らさないため） */}
      {tags.length > 0 && (
        <div
          ref={rowRef}
          data-testid="task-card-tags"
          className="mt-1 flex gap-[3px] overflow-hidden whitespace-nowrap"
        >
          {shown.map((tag) => (
            <span
              key={tag.id}
              className="rounded-[5px] px-[5px] text-[9.5px] leading-[14px]"
              style={tagChipStyle(tag.color, selected, isDark)}
            >
              {tag.name}
            </span>
          ))}
          {hidden > 0 && (
            <span
              data-testid="task-card-tags-more"
              className="rounded-[5px] px-[5px] text-[9.5px] leading-[14px]"
              style={
                selected
                  ? { backgroundColor: "rgba(255,255,255,0.22)", color: "#fff" }
                  : { backgroundColor: "var(--st-tag-bg)", color: "var(--st-tag-fg)" }
              }
            >
              +{hidden}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
