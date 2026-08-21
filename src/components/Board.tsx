import { Inbox } from "lucide-react";
import { Lane } from "./Lane";
import { useAppStore } from "@/store/appStore";
import { buildLanes, filterTasks } from "@/lib/boardNav";

export function Board() {
  // zustand v5 ではセレクタが毎回新しいオブジェクトを返すと無限再レンダリングになるため、
  // 生の配列だけを取り出し、レーンの組み立てはレンダリング本体で行う。
  const statuses = useAppStore((s) => s.statuses);
  const tasks = useAppStore((s) => s.tasks);
  const searchQuery = useAppStore((s) => s.searchQuery);
  const selectedTaskId = useAppStore((s) => s.selectedTaskId);

  const lanes = buildLanes(statuses, filterTasks(tasks, searchQuery));

  // ボードにタスクが1件も無いとき(検索絞り込みではなく本当に空のとき)の空状態
  if (tasks.length === 0) {
    return (
      <div
        data-testid="board"
        className="flex flex-1 flex-col items-center justify-center gap-3 px-8 text-center"
      >
        <Inbox
          size={28}
          strokeWidth={1.5}
          style={{ color: "var(--av-text-muted)" }}
        />
        <p className="text-sm" style={{ color: "var(--av-text-secondary)" }}>
          タスクはまだありません
        </p>
        <p className="text-xs" style={{ color: "var(--av-text-secondary)" }}>
          タスク名を入力して Enter で作成できます
        </p>
      </div>
    );
  }

  return (
    <div data-testid="board" className="flex flex-1 gap-3 overflow-hidden px-3 py-3">
      {lanes.map((lane) => (
        <Lane
          key={lane.status.id}
          status={lane.status}
          tasks={lane.tasks}
          selectedTaskId={selectedTaskId}
        />
      ))}
    </div>
  );
}
