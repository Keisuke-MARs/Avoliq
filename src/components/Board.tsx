import { Inbox, SearchX } from "lucide-react";
import { Lane } from "./Lane";
import { useAppStore } from "@/store/appStore";
import { buildLanes, filterTasks } from "@/lib/boardNav";

export function Board() {
  // zustand v5 ではセレクタが毎回新しいオブジェクトを返すと無限再レンダリングになるため、
  // 生の配列だけを取り出し、レーンの組み立てはレンダリング本体で行う。
  const statuses = useAppStore((s) => s.statuses);
  const tasks = useAppStore((s) => s.tasks);
  const tags = useAppStore((s) => s.tags);
  const searchQuery = useAppStore((s) => s.searchQuery);
  const selectedTaskId = useAppStore((s) => s.selectedTaskId);

  const lanes = buildLanes(statuses, filterTasks(tasks, searchQuery, tags));

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
          style={{ color: "var(--st-text-tertiary)" }}
        />
        <p className="text-sm" style={{ color: "var(--st-text-secondary)" }}>
          タスクはまだありません
        </p>
        <p className="text-xs" style={{ color: "var(--st-text-tertiary)" }}>
          タスク名を入力して Enter で作成できます
        </p>
      </div>
    );
  }

  // タスク自体はあるが、絞り込み(タイトル検索/#タグ)の結果が0件のときの空状態。
  // filterTasksは「存在しないタグ」や「タグを削除して候補が0件になった」場合も[]を返すため、
  // ここで案内を出さないと盤面がただ真っ白になり、何が起きたのかユーザーに伝わらない
  // (tasks.length === 0のときの空状態とは原因が違うので、文言・アイコンを分けている)。
  const isFilteredEmpty = lanes.every((lane) => lane.tasks.length === 0);
  if (isFilteredEmpty) {
    return (
      <div
        data-testid="board"
        className="flex flex-1 flex-col items-center justify-center gap-3 px-8 text-center"
      >
        <SearchX
          size={28}
          strokeWidth={1.5}
          style={{ color: "var(--st-text-tertiary)" }}
        />
        <p className="text-sm" style={{ color: "var(--st-text-secondary)" }}>
          該当するタスクがありません
        </p>
        <p className="text-xs" style={{ color: "var(--st-text-tertiary)" }}>
          検索条件を変えてお試しください
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
