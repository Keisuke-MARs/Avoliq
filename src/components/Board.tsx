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
