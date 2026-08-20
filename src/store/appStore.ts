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

/**
 * selectBoard の呼び出し世代カウンタ。連続で呼ばれたときに古い呼び出しの応答が
 * 後から返ってきても新しい呼び出しの結果を上書きしないよう、呼び出しごとに払い出す。
 * ストアの外に置くのは、テストの set/getState リセットに巻き込まれないようにするため。
 */
let selectBoardGeneration = 0;

/**
 * 楽観的更新の失敗時に呼ぶ復旧処理。
 * 古いsnapshot全体で巻き戻すと待機中の他操作まで巻き戻してしまうので、
 * DBの実状態を読み直して合わせる。読み直し自体も失敗したらsnapshotへ戻す。
 */
async function recoverTasks(boardId: string | null, snapshot: Task[]): Promise<void> {
  if (boardId === null) {
    useAppStore.setState({ tasks: snapshot });
    return;
  }
  try {
    const fresh = await api.tasksList(boardId);
    // 読み直している間にボードが切り替わっていたら、いま表示中のボードとは
    // 無関係な応答なので反映しない(別ボードの内容が混入するのを防ぐ)
    if (useAppStore.getState().currentBoardId !== boardId) return;
    useAppStore.setState({ tasks: fresh });
  } catch {
    if (useAppStore.getState().currentBoardId !== boardId) return;
    useAppStore.setState({ tasks: snapshot });
  }
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
    // 連続で呼ばれたとき、古い呼び出しの応答が後から返ってきても上書きしないようにする
    const myGeneration = ++selectBoardGeneration;
    try {
      const [statuses, tasks] = await Promise.all([
        api.statusesList(boardId),
        api.tasksList(boardId),
      ]);
      if (myGeneration !== selectBoardGeneration) return; // 追い越されたので破棄する
      set({
        currentBoardId: boardId,
        statuses,
        tasks,
        selectedTaskId: null,
        searchQuery: "",
        view: "board",
      });
    } catch (e) {
      if (myGeneration !== selectBoardGeneration) return; // 追い越されたので破棄する
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

  async createTaskFromSearch() {
    const { currentBoardId, statuses, searchQuery, tasks } = get();
    const title = searchQuery.trim();
    const firstStatus = [...statuses].sort((a, b) => a.position - b.position)[0];
    if (currentBoardId === null || firstStatus === undefined || title === "") return;

    // 応答が返ってきた時点でも同じボードを見ているか確認するため、開始時点のボードを覚えておく
    const boardId = currentBoardId;

    // IDはRust側で採番するUUIDなので、ここだけは楽観的更新ではなくAPI先行で作る
    try {
      const created = await api.taskCreate(currentBoardId, firstStatus.id, title);
      // 待っている間にボードが切り替わっていたら、作成自体はDBに済んでいるので
      // 画面には何も反映せず黙って破棄する(別ボードの内容が混ざるのを防ぐ)
      if (get().currentBoardId !== boardId) return;
      // Rust側は先頭(position=0)に挿入して同レーンを再採番するので、手元も同じようにずらす
      const shifted = tasks.map((t) =>
        t.statusId === firstStatus.id ? { ...t, position: t.position + 1 } : t,
      );
      set({
        tasks: [...shifted, created],
        searchQuery: "",
        selectedTaskId: created.id,
        view: "detail",
      });
    } catch (e) {
      if (get().currentBoardId !== boardId) return;
      toast.error(`タスクの作成に失敗しました: ${String(e)}`);
    }
  },

  async moveSelectedTask(dir) {
    const { tasks, statuses, selectedTaskId, currentBoardId } = get();
    if (selectedTaskId === null) return;
    const task = tasks.find((t) => t.id === selectedTaskId);
    if (task === undefined) return;

    const sorted = [...statuses].sort((a, b) => a.position - b.position);
    const index = sorted.findIndex((s) => s.id === task.statusId);
    // 空のレーンにも移せるよう、ここでは空レーンを飛ばさない
    const target = sorted[dir === "left" ? index - 1 : index + 1];
    if (target === undefined) return;

    const snapshot = tasks;
    // 楽観的更新: 移動先レーンの先頭へ差し込み、前後のレーンを詰め直す
    const optimistic = tasks.map((t) => {
      if (t.id === task.id) return { ...t, statusId: target.id, position: 0 };
      if (t.statusId === target.id) return { ...t, position: t.position + 1 };
      if (t.statusId === task.statusId && t.position > task.position) {
        return { ...t, position: t.position - 1 };
      }
      return t;
    });
    set({ tasks: optimistic });

    try {
      await api.taskMove(task.id, target.id, 0);
    } catch (e) {
      await recoverTasks(currentBoardId, snapshot);
      toast.error(`ステータスの変更に失敗しました: ${String(e)}`);
    }
  },

  async reorderSelectedTask(dir) {
    const { tasks, selectedTaskId, currentBoardId } = get();
    if (selectedTaskId === null) return;
    const task = tasks.find((t) => t.id === selectedTaskId);
    if (task === undefined) return;

    // 並び替えは検索の絞り込みとは無関係に、レーン全件の並びで行番号を決める
    const lane = tasks
      .filter((t) => t.statusId === task.statusId)
      .sort((a, b) => a.position - b.position);
    const row = lane.findIndex((t) => t.id === task.id);
    const newRow = dir === "up" ? row - 1 : row + 1;
    if (newRow < 0 || newRow >= lane.length) return;

    const neighbor = lane[newRow];
    const snapshot = tasks;
    // 楽観的更新: 隣とpositionを入れ替える
    const optimistic = tasks.map((t) => {
      if (t.id === task.id) return { ...t, position: neighbor.position };
      if (t.id === neighbor.id) return { ...t, position: task.position };
      return t;
    });
    set({ tasks: optimistic });

    try {
      await api.taskMove(task.id, task.statusId, newRow);
    } catch (e) {
      await recoverTasks(currentBoardId, snapshot);
      toast.error(`並び順の変更に失敗しました: ${String(e)}`);
    }
  },

  async deleteSelectedTask() {
    const { tasks, statuses, selectedTaskId, searchQuery, currentBoardId } = get();
    if (selectedTaskId === null) return;
    const target = tasks.find((t) => t.id === selectedTaskId);
    if (target === undefined) return;

    // 見えているカードの並びを基準に、次に選ぶカードを決める
    const lanes = buildLanes(statuses, filterTasks(tasks, searchQuery));
    const nextSelected = selectionAfterDelete(lanes, selectedTaskId);

    const snapshot = tasks;
    set({
      tasks: tasks.filter((t) => t.id !== selectedTaskId),
      selectedTaskId: nextSelected,
      lastDeletedTaskId: selectedTaskId,
    });

    try {
      await api.taskDelete(target.id);
    } catch (e) {
      await recoverTasks(currentBoardId, snapshot);
      set({ selectedTaskId: target.id, lastDeletedTaskId: null });
      toast.error(`タスクの削除に失敗しました: ${String(e)}`);
    }
  },

  async undoDelete() {
    const { lastDeletedTaskId } = get();
    if (lastDeletedTaskId === null) return;
    // 復元後のpositionはRust側の状態に依存するので、レスポンスをそのまま採用する
    try {
      const restored = await api.taskRestore(lastDeletedTaskId);
      set((s) => ({
        tasks: [...s.tasks.filter((t) => t.id !== restored.id), restored],
        selectedTaskId: restored.id,
        lastDeletedTaskId: null,
      }));
    } catch (e) {
      toast.error(`タスクの復元に失敗しました: ${String(e)}`);
    }
  },

  async updateTaskContent(id, contentMd) {
    const { tasks: snapshot, currentBoardId } = get();
    set({ tasks: snapshot.map((t) => (t.id === id ? { ...t, contentMd } : t)) });
    try {
      await api.taskUpdate(id, null, contentMd);
    } catch (e) {
      await recoverTasks(currentBoardId, snapshot);
      toast.error(`本文の保存に失敗しました: ${String(e)}`);
    }
  },

  async updateTaskTitle(id, title) {
    const { tasks: snapshot, currentBoardId } = get();
    set({ tasks: snapshot.map((t) => (t.id === id ? { ...t, title } : t)) });
    try {
      await api.taskUpdate(id, title, null);
    } catch (e) {
      await recoverTasks(currentBoardId, snapshot);
      toast.error(`タイトルの保存に失敗しました: ${String(e)}`);
    }
  },
}));
