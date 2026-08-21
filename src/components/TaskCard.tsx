import { useEffect, useRef } from "react";
import type { CSSProperties } from "react";
import { useAppStore } from "@/store/appStore";
import type { Task } from "@/types";

interface TaskCardProps {
  task: Task;
  /** 所属レーンのステータス色。選択時の強調に使う */
  statusColor: string;
  selected: boolean;
}

export function TaskCard({ task, statusColor, selected }: TaskCardProps) {
  const setSelectedTask = useAppStore((s) => s.setSelectedTask);
  const setView = useAppStore((s) => s.setView);
  const ref = useRef<HTMLDivElement>(null);

  // キーボードで選択が移動したとき、カードが画面外なら見える位置までスクロールする
  useEffect(() => {
    if (selected) ref.current?.scrollIntoView({ block: "nearest" });
  }, [selected]);

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
          ? "av-card flex cursor-default items-center gap-2 rounded-xl px-3 py-2 text-[13px] leading-snug"
          : "av-card flex cursor-default items-center gap-2 rounded-xl px-3 py-2 text-[13px] leading-snug shadow-sm"
      }
      // 色そのものはCSS側が決める。ここはステータス色を渡すだけ
      style={{ "--av-status": statusColor } as CSSProperties}
    >
      <span className="av-status-dot h-1.5 w-1.5 shrink-0 rounded-full" />
      <span className="min-w-0 truncate">{task.title}</span>
    </div>
  );
}
