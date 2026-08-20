import { create } from "zustand";
import { toast } from "sonner";
import * as api from "@/lib/api";
import { buildLanes, filterTasks, selectionAfterDelete } from "@/lib/boardNav";
import type { Board, Status, Task, View } from "@/types";

export interface AppState {
  boards: Board[];
  currentBoardId: string | null;
  statuses: Status[];
  tasks: Task[];
  selectedTaskId: string | null;
  view: View;
  searchQuery: string;
  lastDeletedTaskId: string | null;

  loadBoards(): Promise<void>;
  selectBoard(boardId: string): Promise<void>;
  setView(view: View): void;
  setSearchQuery(q: string): void;
  setSelectedTask(id: string | null): void;
  createTaskFromSearch(): Promise<void>;
  moveSelectedTask(dir: "left" | "right"): Promise<void>;
  reorderSelectedTask(dir: "up" | "down"): Promise<void>;
  deleteSelectedTask(): Promise<void>;
  undoDelete(): Promise<void>;
  updateTaskContent(id: string, contentMd: string): Promise<void>;
  updateTaskTitle(id: string, title: string): Promise<void>;
}

/** データ部分だけの初期値。テストのリセットにも使う。 */
export const initialAppState = {
  boards: [] as Board[],
  currentBoardId: null as string | null,
  statuses: [] as Status[],
  tasks: [] as Task[],
  selectedTaskId: null as string | null,
  view: "board" as View,
  searchQuery: "",
  lastDeletedTaskId: null as string | null,
};

export const useAppStore = create<AppState>()((set, get) => ({
  ...initialAppState,

  async loadBoards() {
    try {
      const boards = await api.boardsList();
      set({ boards });
      const first = boards[0];
      // 初回のみ先頭ボードを自動で開く
      if (first !== undefined && get().currentBoardId === null) {
        await get().selectBoard(first.id);
      }
    } catch (e) {
      toast.error(`ボードの読み込みに失敗しました: ${String(e)}`);
    }
  },

  async selectBoard(boardId) {
    try {
      const [statuses, tasks] = await Promise.all([
        api.statusesList(boardId),
        api.tasksList(boardId),
      ]);
      set({
        currentBoardId: boardId,
        statuses,
        tasks,
        selectedTaskId: null,
        searchQuery: "",
        view: "board",
      });
    } catch (e) {
      toast.error(`ボードの読み込みに失敗しました: ${String(e)}`);
    }
  },

  setView(view) {
    set({ view });
  },

  setSearchQuery(q) {
    const { tasks, selectedTaskId } = get();
    // 絞り込みの結果、選択中のカードが表示対象から外れたら選択を解除して検索バーへ戻す
    const stillVisible =
      selectedTaskId !== null && filterTasks(tasks, q).some((t) => t.id === selectedTaskId);
    set({ searchQuery: q, selectedTaskId: stillVisible ? selectedTaskId : null });
  },

  setSelectedTask(id) {
    set({ selectedTaskId: id });
  },

  // --- 以下 Task 5 で実装する ---
  async createTaskFromSearch() {},
  async moveSelectedTask() {},
  async reorderSelectedTask() {},
  async deleteSelectedTask() {},
  async undoDelete() {},
  async updateTaskContent() {},
  async updateTaskTitle() {},
}));
