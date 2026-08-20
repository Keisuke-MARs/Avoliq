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
  /**
   * ボードを切り替える。戻り値はこの呼び出しの結果が実際にstateへ反映されたか。
   * 読込に失敗した場合、またはこの呼び出しより新しい切替要求に追い越された場合はfalseを返す
   * (この場合stateは変更されない)。呼び出し元はfalseのとき「切替は完了しなかった」ものとして扱うこと。
   */
  selectBoard(boardId: string): Promise<boolean>;
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
 * ボード切替の世代(エポック)。selectBoard の要求と同時に(awaitの前に)同期的に進める。
 * 非同期応答の反映は「要求時点のエポック === 現在のエポック」のときだけ許可する。
 * これにより、切替要求より古い応答(完了済み/未完了を問わず)はすべて破棄される。
 * ストアの外に置くのは、テストの set/getState リセットに巻き込まれないようにするため。
 */
let boardEpoch = 0;

/** 現在のボード切替エポックを取得する。要求開始時にこれを捕捉し、応答後に再確認する。 */
export function getBoardEpoch(): number {
  return boardEpoch;
}

/**
 * ボード切替の読込中フラグ。selectBoardの要求と同時に(awaitの前に)同期的にtrueにし、
 * 応答が返って(そのエポックがまだ最新であることを確認した上で)falseへ戻す。
 * epochだけでは「切替要求後・読込完了前」の間隙を塞げない
 * (この間もtasks/selectedTaskIdは旧ボードのものが残ったままなので、
 * 新epochを捕捉したミューテーション系操作がその上に楽観的更新を重ねてしまう)ため、
 * この間はミューテーション系アクションを丸ごと拒否するための同期フラグとして用意する。
 */
let boardLoading = false;

/** テスト用: 現在ボード切替の読込中かどうかを取得する。 */
export function isBoardLoading(): boolean {
  return boardLoading;
}

/**
 * 楽観的更新の失敗時に呼ぶ復旧処理。
 * 古いsnapshot全体で巻き戻すと待機中の他操作まで巻き戻してしまうので、
 * DBの実状態を読み直して合わせる。読み直し自体も失敗したらsnapshotへ戻す。
 * epoch は呼び出し開始時点のボード世代。読み直している間にボードが切り替わっていたら
 * (エポックが進んでいたら)いま表示中のボードとは無関係な応答なので反映しない。
 */
async function recoverTasks(boardId: string | null, snapshot: Task[], epoch: number): Promise<void> {
  if (boardId === null) {
    if (epoch !== boardEpoch) return;
    useAppStore.setState({ tasks: snapshot });
    return;
  }
  try {
    const fresh = await api.tasksList(boardId);
    if (epoch !== boardEpoch) return;
    useAppStore.setState({ tasks: fresh });
  } catch {
    if (epoch !== boardEpoch) return;
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
    // ボード切替の世代を要求時点(awaitより前)で同期的に進める。
    // これ以降に届く「この呼び出しより古い」非同期応答はすべてエポック不一致として破棄される。
    boardEpoch += 1;
    const epoch = boardEpoch;
    // 読込完了までミューテーション系操作を拒否するためのフラグも同期的に立てる。
    boardLoading = true;
    // 削除のundoはボードローカルな操作とする。切替を要求した時点で同期的にクリアし、
    // 別ボードで削除したタスクが⌘Zで新しいボードに復活しないようにする。
    set({ lastDeletedTaskId: null });
    try {
      const [statuses, tasks] = await Promise.all([
        api.statusesList(boardId),
        api.tasksList(boardId),
      ]);
      if (epoch !== boardEpoch) return false; // 追い越されたので破棄する(boardLoadingは触らない)
      set({
        currentBoardId: boardId,
        statuses,
        tasks,
        selectedTaskId: null,
        searchQuery: "",
        view: "board",
      });
      boardLoading = false;
      return true;
    } catch (e) {
      if (epoch !== boardEpoch) return false; // 追い越されたので破棄する(boardLoadingは触らない)
      boardLoading = false;
      toast.error(`ボードの読み込みに失敗しました: ${String(e)}`);
      return false;
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
    if (boardLoading) return; // ボード切替の読込中は旧ボードのtasksを触ってしまうので拒否する
    const { currentBoardId, statuses, searchQuery, tasks } = get();
    const title = searchQuery.trim();
    const firstStatus = [...statuses].sort((a, b) => a.position - b.position)[0];
    if (currentBoardId === null || firstStatus === undefined || title === "") return;

    // 応答が返ってきた時点でも同じ切替要求を見ているか確認するため、開始時点のエポックを覚えておく
    const epoch = boardEpoch;

    // IDはRust側で採番するUUIDなので、ここだけは楽観的更新ではなくAPI先行で作る
    try {
      const created = await api.taskCreate(currentBoardId, firstStatus.id, title);
      // 待っている間にボードが切り替えられていたら、作成自体はDBに済んでいるので
      // 画面には何も反映せず黙って破棄する(別ボードの内容が混ざるのを防ぐ)
      if (epoch !== boardEpoch) return;
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
      if (epoch !== boardEpoch) return;
      toast.error(`タスクの作成に失敗しました: ${String(e)}`);
    }
  },

  async moveSelectedTask(dir) {
    if (boardLoading) return; // ボード切替の読込中は旧ボードのtasksを触ってしまうので拒否する
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
    const epoch = boardEpoch;
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
      await recoverTasks(currentBoardId, snapshot, epoch);
      if (epoch !== boardEpoch) return;
      toast.error(`ステータスの変更に失敗しました: ${String(e)}`);
    }
  },

  async reorderSelectedTask(dir) {
    if (boardLoading) return; // ボード切替の読込中は旧ボードのtasksを触ってしまうので拒否する
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
    const epoch = boardEpoch;
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
      await recoverTasks(currentBoardId, snapshot, epoch);
      if (epoch !== boardEpoch) return;
      toast.error(`並び順の変更に失敗しました: ${String(e)}`);
    }
  },

  async deleteSelectedTask() {
    if (boardLoading) return; // ボード切替の読込中は旧ボードのtasksを触ってしまうので拒否する
    const { tasks, statuses, selectedTaskId, searchQuery, currentBoardId } = get();
    if (selectedTaskId === null) return;
    const target = tasks.find((t) => t.id === selectedTaskId);
    if (target === undefined) return;

    // 見えているカードの並びを基準に、次に選ぶカードを決める
    const lanes = buildLanes(statuses, filterTasks(tasks, searchQuery));
    const nextSelected = selectionAfterDelete(lanes, selectedTaskId);

    const snapshot = tasks;
    const epoch = boardEpoch;
    set({
      tasks: tasks.filter((t) => t.id !== selectedTaskId),
      selectedTaskId: nextSelected,
      lastDeletedTaskId: selectedTaskId,
    });

    try {
      await api.taskDelete(target.id);
    } catch (e) {
      await recoverTasks(currentBoardId, snapshot, epoch);
      if (epoch !== boardEpoch) return;
      set({ selectedTaskId: target.id, lastDeletedTaskId: null });
      toast.error(`タスクの削除に失敗しました: ${String(e)}`);
    }
  },

  async undoDelete() {
    if (boardLoading) return; // ボード切替の読込中は旧ボードのtasksを触ってしまうので拒否する
    const { lastDeletedTaskId } = get();
    if (lastDeletedTaskId === null) return;
    // undoはボードローカルな操作。selectBoardが要求時点でlastDeletedTaskIdを同期的に
    // クリアするので、切替要求後にここへ来ることはないが、応答の反映は念のためエポックでも守る。
    const epoch = boardEpoch;
    // 復元後のpositionはRust側の状態に依存するので、レスポンスをそのまま採用する
    try {
      const restored = await api.taskRestore(lastDeletedTaskId);
      if (epoch !== boardEpoch) return;
      set((s) => ({
        tasks: [...s.tasks.filter((t) => t.id !== restored.id), restored],
        selectedTaskId: restored.id,
        lastDeletedTaskId: null,
      }));
    } catch (e) {
      if (epoch !== boardEpoch) return;
      toast.error(`タスクの復元に失敗しました: ${String(e)}`);
    }
  },

  async updateTaskContent(id, contentMd) {
    if (boardLoading) return; // ボード切替の読込中は旧ボードのtasksを触ってしまうので拒否する
    const { tasks: snapshot, currentBoardId } = get();
    const epoch = boardEpoch;
    set({ tasks: snapshot.map((t) => (t.id === id ? { ...t, contentMd } : t)) });
    try {
      await api.taskUpdate(id, null, contentMd);
    } catch (e) {
      await recoverTasks(currentBoardId, snapshot, epoch);
      if (epoch !== boardEpoch) return;
      toast.error(`本文の保存に失敗しました: ${String(e)}`);
    }
  },

  async updateTaskTitle(id, title) {
    if (boardLoading) return; // ボード切替の読込中は旧ボードのtasksを触ってしまうので拒否する
    const { tasks: snapshot, currentBoardId } = get();
    const epoch = boardEpoch;
    set({ tasks: snapshot.map((t) => (t.id === id ? { ...t, title } : t)) });
    try {
      await api.taskUpdate(id, title, null);
    } catch (e) {
      await recoverTasks(currentBoardId, snapshot, epoch);
      if (epoch !== boardEpoch) return;
      toast.error(`タイトルの保存に失敗しました: ${String(e)}`);
    }
  },
}));
