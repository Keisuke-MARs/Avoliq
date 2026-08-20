import { invoke } from "@tauri-apps/api/core";
import type { Board, Status, Task } from "@/types";

// ---- ボード ----

export function boardsList(): Promise<Board[]> {
  return invoke<Board[]>("boards_list");
}

export function boardCreate(name: string): Promise<Board> {
  return invoke<Board>("board_create", { name });
}

export function boardRename(id: string, name: string): Promise<Board> {
  return invoke<Board>("board_rename", { id, name });
}

export function boardDelete(id: string): Promise<void> {
  return invoke<void>("board_delete", { id });
}

// ---- ステータス ----

export function statusesList(boardId: string): Promise<Status[]> {
  return invoke<Status[]>("statuses_list", { boardId });
}

export function statusCreate(boardId: string, name: string, color: string): Promise<Status> {
  return invoke<Status>("status_create", { boardId, name, color });
}

// name / color は変更しない項目に null を渡す（Rust側 Option<String> の None になる）
export function statusUpdate(
  id: string,
  name: string | null,
  color: string | null,
): Promise<Status> {
  return invoke<Status>("status_update", { id, name, color });
}

export function statusDelete(id: string): Promise<void> {
  return invoke<void>("status_delete", { id });
}

export function statusReorder(id: string, newIndex: number): Promise<Status[]> {
  return invoke<Status[]>("status_reorder", { id, newIndex });
}

// ---- タスク ----

export function tasksList(boardId: string): Promise<Task[]> {
  return invoke<Task[]>("tasks_list", { boardId });
}

export function taskCreate(boardId: string, statusId: string, title: string): Promise<Task> {
  return invoke<Task>("task_create", { boardId, statusId, title });
}

// title / contentMd は変更しない項目に null を渡す
export function taskUpdate(
  id: string,
  title: string | null,
  contentMd: string | null,
): Promise<Task> {
  return invoke<Task>("task_update", { id, title, contentMd });
}

export function taskMove(id: string, statusId: string, newIndex: number): Promise<Task> {
  return invoke<Task>("task_move", { id, statusId, newIndex });
}

export function taskDelete(id: string): Promise<Task> {
  return invoke<Task>("task_delete", { id });
}

export function taskRestore(id: string): Promise<Task> {
  return invoke<Task>("task_restore", { id });
}

// ---- 設定 ----

export function settingGet(key: string): Promise<string | null> {
  return invoke<string | null>("setting_get", { key });
}

export function settingSet(key: string, value: string): Promise<void> {
  return invoke<void>("setting_set", { key, value });
}

// ---- パレット制御 ----

/** Escキーでパレットを隠す。Rust側でNSPanelの hide() を呼ぶ。 */
export function hidePalette(): Promise<void> {
  return invoke<void>("palette_hide");
}
