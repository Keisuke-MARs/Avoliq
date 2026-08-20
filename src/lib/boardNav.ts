import type { Status, Task } from "@/types";

/** 1レーン分の表示データ（ステータスと、そのステータスに属するタスク） */
export interface LaneData {
  status: Status;
  tasks: Task[];
}

/** カーソル移動の方向 */
export type MoveDir = "left" | "right" | "up" | "down";

/**
 * 検索クエリでタスクを絞り込む。
 * タイトルの部分一致・英字は大文字小文字を区別しない。空クエリなら全件。
 */
export function filterTasks(tasks: Task[], query: string): Task[] {
  const q = query.trim().toLowerCase();
  if (q === "") return tasks;
  return tasks.filter((t) => t.title.toLowerCase().includes(q));
}

/**
 * ステータス(position昇順)ごとにタスク(position昇順)をまとめてレーン配列を作る。
 * タスクが1件も無いステータスも空のレーンとして残す。
 */
export function buildLanes(statuses: Status[], tasks: Task[]): LaneData[] {
  const sortedStatuses = [...statuses].sort((a, b) => a.position - b.position);
  return sortedStatuses.map((status) => ({
    status,
    tasks: tasks
      .filter((t) => t.statusId === status.id)
      .sort((a, b) => a.position - b.position),
  }));
}

/** 指定タスクのレーン番号・行番号を返す。見つからなければ null。 */
export function locateTask(
  lanes: LaneData[],
  taskId: string,
): { lane: number; row: number } | null {
  for (let lane = 0; lane < lanes.length; lane += 1) {
    const row = lanes[lane].tasks.findIndex((t) => t.id === taskId);
    if (row !== -1) return { lane, row };
  }
  return null;
}

/** 指定方向で最初に見つかる「空でないレーン」の番号を返す。無ければ null。 */
function findAdjacentNonEmptyLane(lanes: LaneData[], from: number, step: number): number | null {
  for (let i = from + step; i >= 0 && i < lanes.length; i += step) {
    if (lanes[i].tasks.length > 0) return i;
  }
  return null;
}

/**
 * カーソル移動後に選択されるべきタスクIDを返す。
 * null は「選択なし = 検索バーにフォーカスがある状態」を表す。
 * 移動できない場合は現在の選択をそのまま返す。
 */
export function nextSelectedTaskId(
  lanes: LaneData[],
  selectedTaskId: string | null,
  dir: MoveDir,
): string | null {
  // 未選択（検索バーにいる）状態
  if (selectedTaskId === null) {
    if (dir !== "down") return null;
    const firstLane = findAdjacentNonEmptyLane(lanes, -1, 1);
    if (firstLane === null) return null;
    return lanes[firstLane].tasks[0].id;
  }

  const pos = locateTask(lanes, selectedTaskId);
  // 絞り込み等で選択中のカードが消えている場合は検索バーへ戻す
  if (pos === null) return null;

  const laneTasks = lanes[pos.lane].tasks;

  if (dir === "up") {
    // 行0からさらに上へ行くと検索バーへ戻る
    if (pos.row === 0) return null;
    return laneTasks[pos.row - 1].id;
  }

  if (dir === "down") {
    if (pos.row >= laneTasks.length - 1) return selectedTaskId;
    return laneTasks[pos.row + 1].id;
  }

  // 左右: 空のレーンは飛ばす
  const step = dir === "left" ? -1 : 1;
  const targetLane = findAdjacentNonEmptyLane(lanes, pos.lane, step);
  if (targetLane === null) return selectedTaskId;
  const targetTasks = lanes[targetLane].tasks;
  const targetRow = Math.min(pos.row, targetTasks.length - 1);
  return targetTasks[targetRow].id;
}

/**
 * タスクを削除した直後に選択すべきタスクIDを返す。
 * 同レーンの1つ下 → 1つ上 → 選択なし、の順で決める。
 */
export function selectionAfterDelete(lanes: LaneData[], deletedTaskId: string): string | null {
  const pos = locateTask(lanes, deletedTaskId);
  if (pos === null) return null;
  const laneTasks = lanes[pos.lane].tasks;
  if (pos.row < laneTasks.length - 1) return laneTasks[pos.row + 1].id;
  if (pos.row > 0) return laneTasks[pos.row - 1].id;
  return null;
}
