import type { Board, Status, Tag, Task } from "@/types";

export const board: Board = { id: "board-1", name: "メイン", position: 0 };
export const board2: Board = { id: "board-2", name: "私用", position: 1 };

export const statuses: Status[] = [
  { id: "st-todo", boardId: "board-1", name: "未着手", color: "#8E8E93", position: 0 },
  { id: "st-doing", boardId: "board-1", name: "進行中", color: "#5AC8FA", position: 1 },
  { id: "st-check", boardId: "board-1", name: "確認中", color: "#FF9500", position: 2 },
  { id: "st-done", boardId: "board-1", name: "完了", color: "#34C759", position: 3 },
];

export const tags: Tag[] = [
  { id: "tag-bug", boardId: "board-1", name: "バグ", color: "#7EA9E8", position: 0 },
  { id: "tag-urgent", boardId: "board-1", name: "緊急", color: "#E8B478", position: 1 },
  { id: "tag-design", boardId: "board-1", name: "設計", color: "#7FCF9A", position: 2 },
];

function makeTask(
  id: string,
  statusId: string,
  title: string,
  position: number,
  tagIds: string[] = [],
): Task {
  return {
    id,
    boardId: "board-1",
    statusId,
    title,
    contentMd: "",
    position,
    createdAt: "2026-08-20T00:00:00Z",
    updatedAt: "2026-08-20T00:00:00Z",
    tagIds,
  };
}

// 未着手に3件 / 進行中に2件 / 確認中は空 / 完了に1件
export const tasks: Task[] = [
  makeTask("t-a", "st-todo", "牛乳を買う", 0, ["tag-bug"]),
  makeTask("t-b", "st-todo", "資料をまとめる", 1),
  makeTask("t-c", "st-todo", "牛丼を食べる", 2, ["tag-bug", "tag-urgent"]),
  makeTask("t-d", "st-doing", "設計レビュー", 0, ["tag-design"]),
  makeTask("t-e", "st-doing", "実装する", 1),
  makeTask("t-f", "st-done", "リリース準備", 0),
];

export { makeTask };
