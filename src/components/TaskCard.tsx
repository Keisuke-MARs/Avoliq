import { useEffect, useRef } from "react";
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
      className="cursor-default rounded-xl bg-white px-3 py-2 text-[13px] leading-snug text-neutral-900 shadow-sm"
      style={{
        outline: selected ? `2px solid ${statusColor}` : "none",
        outlineOffset: "1px",
      }}
    >
      {task.title}
    </div>
  );
}
