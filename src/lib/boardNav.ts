import type { Status, Tag, Task } from "@/types";

/** 1レーン分の表示データ（ステータスと、そのステータスに属するタスク） */
export interface LaneData {
  status: Status;
  tasks: Task[];
}

/** カーソル移動の方向 */
export type MoveDir = "left" | "right" | "up" | "down";

/** 検索クエリを「タイトル検索の文字列」と「タグ名」に分けた結果 */
export interface ParsedQuery {
  text: string;
  tagNames: string[];
}

/**
 * 全角「＃」を半角「#」に正規化する。
 * 日本語入力ONの Shift+3 は環境によって全角＃になるため、タグトークンかどうかを判定する
 * 箇所すべてでこれを通す。parseSearchQuery(検索欄全体のパース)とSearchBar(タグ候補を出すための
 * 「最後のトークン」抽出)の2箇所が同じ正規化を必要とするので、ここに1本化して片方だけ直す
 * 片肺(例: 「＃＃」や「♯」対応を片方にだけ足してしまう)を防ぐ。
 */
export function normalizeHash(s: string): string {
  return s.replace(/＃/g, "#");
}

/**
 * 検索クエリをパースする。
 * 全角「＃」の正規化は normalizeHash に集約している(この関数の中で個別に行わない)。
 */
export function parseSearchQuery(query: string): ParsedQuery {
  const normalized = normalizeHash(query);
  const tagNames: string[] = [];
  const rest: string[] = [];

  for (const token of normalized.split(/\s+/)) {
    if (token === "") continue;
    if (!token.startsWith("#")) {
      rest.push(token);
      continue;
    }
    const name = token.slice(1);
    // 「#」だけは入力途中なので無視する
    if (name === "") continue;
    const duplicated = tagNames.some((t) => t.toLowerCase() === name.toLowerCase());
    if (!duplicated) tagNames.push(name);
  }

  return { text: rest.join(" "), tagNames };
}

/** 検索文字列から作る新規タスクの下書き */
export interface TaskDraft {
  title: string;
  tagIds: string[];
}

/**
 * 検索文字列を「タイトル」と「付与するタグID」に分ける。
 * 既存タグ名と完全一致する `#タグ名` だけをタグとして取り出し、タイトルからは外す。
 * 完全一致しないトークン（`#` 単体を含む）は、そのままタイトルに残す
 * （絞り込みの filterTasks は前方一致でも候補を拾うが、作成は取り消せないので
 *   「打ちかけかもしれない文字列を勝手にタグへ解釈しない」側に倒す。
 *   入力した文字が黙って消えないことも兼ねる）。
 */
export function buildTaskDraftFromQuery(query: string, tags: Tag[]): TaskDraft {
  const normalized = normalizeHash(query);
  const tagIds: string[] = [];
  const rest: string[] = [];

  for (const token of normalized.split(/\s+/)) {
    if (token === "") continue;
    if (!token.startsWith("#")) {
      rest.push(token);
      continue;
    }
    const name = token.slice(1).trim().toLowerCase();
    const matched =
      name === "" ? undefined : tags.find((t) => t.name.trim().toLowerCase() === name);
    if (matched === undefined) {
      // 完全一致しないタグトークンは、打った文字をそのままタイトルへ返す
      rest.push(token);
      continue;
    }
    if (!tagIds.includes(matched.id)) tagIds.push(matched.id);
  }

  return { title: rest.join(" ").trim(), tagIds };
}

/**
 * 検索クエリでタスクを絞り込む。
 * タイトルは部分一致（英字は大文字小文字を区別しない）。
 * `#タグ名` はタグ名どうしがAND、1つのタグ名に対する候補（前方一致で複数当たる場合）はOR。
 */
export function filterTasks(tasks: Task[], query: string, tags: Tag[]): Task[] {
  const { text, tagNames } = parseSearchQuery(query);
  let result = tasks;

  const q = text.trim().toLowerCase();
  if (q !== "") {
    result = result.filter((t) => t.title.toLowerCase().includes(q));
  }

  for (const name of tagNames) {
    const lower = name.trim().toLowerCase();
    const exact = tags.find((t) => t.name.trim().toLowerCase() === lower);
    // 完全一致があればそれだけ。無ければ「打ちかけ」とみなして前方一致の候補をORで拾う
    const candidates =
      exact !== undefined
        ? [exact]
        : tags.filter((t) => t.name.trim().toLowerCase().startsWith(lower));
    // どのタグにも当たらないなら、全件を出さずに0件にする
    if (candidates.length === 0) return [];
    const ids = new Set(candidates.map((t) => t.id));
    result = result.filter((task) => task.tagIds.some((id) => ids.has(id)));
  }

  return result;
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
