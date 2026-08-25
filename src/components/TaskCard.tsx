import { useEffect, useRef } from "react";
import type { CSSProperties } from "react";
import { CHIP_GAP, useChipOverflow } from "@/hooks/useChipOverflow";
import { useColorScheme } from "@/hooks/useColorScheme";
import { tagChipStyle } from "@/lib/tagPalette";
import { useAppStore } from "@/store/appStore";
import type { Tag, Task } from "@/types";

interface TaskCardProps {
  task: Task;
  /** 所属レーンのステータス色。選択時の強調に使う */
  statusColor: string;
  selected: boolean;
}

export function TaskCard({ task, statusColor, selected }: TaskCardProps) {
  const setSelectedTask = useAppStore((s) => s.setSelectedTask);
  const setView = useAppStore((s) => s.setView);
  const allTags = useAppStore((s) => s.tags);
  const isDark = useColorScheme();
  const ref = useRef<HTMLDivElement>(null);

  // キーボードで選択が移動したとき、カードが画面外なら見える位置までスクロールする。
  // inline も見るのは、ステータスが多いとボードが横スクロールするため。
  // block は縦方向しか見ないので、⌘←→ でレーンをまたいだとき選択カードが
  // 横方向の表示範囲外に取り残される。どちらも "nearest" なので、
  // 既に見えている場合はスクロールしない。
  useEffect(() => {
    if (selected) ref.current?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [selected]);

  // 既に消えたタグidが残っていても落ちないよう、引けたものだけ使う
  const tags = task.tagIds
    .map((id) => allTags.find((t) => t.id === id))
    .filter((t): t is Tag => t !== undefined);

  const rowRef = useRef<HTMLDivElement>(null);
  // 測定のやり直しキー。idだけでなく表示名も含める。idだけだと改名(renameTag)で
  // tags配列は差し替わるのに再測定されず、古い幅のまま名前だけ変わってはみ出す
  const chipsKey = tags.map((t) => `${t.id}:${t.name}`).join(",");
  const { visibleCount } = useChipOverflow(rowRef, chipsKey);

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
          ? "av-card flex cursor-default flex-col gap-1 rounded-xl px-3 py-2 text-[13px] leading-snug"
          : "av-card flex cursor-default flex-col gap-1 rounded-xl px-3 py-2 text-[13px] leading-snug shadow-sm"
      }
      // 色そのものはCSS側が決める。ここはステータス色を渡すだけ
      style={{ "--av-status": statusColor } as CSSProperties}
    >
      {/* タイトルは line-clamp-2 で最大2行。1レーン約165〜205pxでは1行だと
          10文字前後で切れて何のタスクか判別できないため。
          短いタイトルは1行のままなので、レーンに収まるカード数はほとんど減らない。
          break-words を併記するのは、truncate が持っていた whitespace-nowrap が
          外れることで、URLのような切れ目の無いタイトルが横にはみ出すのを防ぐため。 */}
      <div className="flex items-start gap-2">
        {/* mt-[6px] はドットを1行目の中心に固定するためのもの。items-start にしないと
            2行のときドットが上下中央（＝行間）に落ちて1行目とずれる。
            6px = (13px × leading-snug 1.375 − ドット6px) ÷ 2 */}
        <span className="av-status-dot mt-[6px] h-1.5 w-1.5 shrink-0 rounded-full" />
        <span className="min-w-0 break-words line-clamp-2">{task.title}</span>
      </div>
      {/* タグを持たないカードは行そのものを描画しない（可視カード数を減らさないため） */}
      {/* 隙間は useChipOverflow の測定式が使う値と必ず一致していなければならないので、
          Tailwindのクラスではなく CHIP_GAP をそのまま style で当てて二重管理をなくす */}
      {tags.length > 0 && (
        <div
          ref={rowRef}
          data-testid="task-card-tags"
          style={{ gap: CHIP_GAP }}
          className="flex overflow-hidden whitespace-nowrap"
        >
          {shown.map((tag) => (
            <span
              key={tag.id}
              className="rounded-[5px] px-[5px] text-[9.5px] leading-[14px]"
              style={tagChipStyle(tag.color, isDark)}
            >
              {tag.name}
            </span>
          ))}
          {hidden > 0 && (
            <span
              data-testid="task-card-tags-more"
              className="rounded-[5px] px-[5px] text-[9.5px] leading-[14px]"
              // タグ本体と同じく、選択中かどうかでは配色を変えない
              style={{ backgroundColor: "var(--av-tag-bg)", color: "var(--av-tag-fg)" }}
            >
              +{hidden}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
