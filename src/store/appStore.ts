import { create } from "zustand";
import { toast } from "sonner";
import * as api from "@/lib/api";
import { buildLanes, buildTaskDraftFromQuery, filterTasks, selectionAfterDelete } from "@/lib/boardNav";
import type { Board, Status, Tag, Task, View } from "@/types";

export interface AppState {
  boards: Board[];
  currentBoardId: string | null;
  statuses: Status[];
  tasks: Task[];
  selectedTaskId: string | null;
  view: View;
  searchQuery: string;
  lastDeletedTaskId: string | null;
  /**
   * createNewTask(⌘N)が直近で作成したタスクのid。TaskDetailは
   * `selectedTaskId === pendingNewTaskId` で「⌘N直後で開いた」かどうかを判定し、
   * 判定した後(マウント時)にnullへクリアする。タイトル文字列(NEW_TASK_TITLE)による判定だと
   * 既存タスクをたまたま同名にしていた場合に誤爆するため、idベースに切り替えている。
   */
  pendingNewTaskId: string | null;
  /** currentBoard のタグ。position昇順 */
  tags: Tag[];
  /** タグパレット(⌘Kで開くオーバーレイ)が開いているか */
  tagPaletteOpen: boolean;

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
  createNewTask(): Promise<void>;
  moveSelectedTask(dir: "left" | "right"): Promise<void>;
  reorderSelectedTask(dir: "up" | "down"): Promise<void>;
  deleteSelectedTask(): Promise<void>;
  undoDelete(): Promise<void>;
  updateTaskContent(id: string, contentMd: string): Promise<void>;
  updateTaskTitle(id: string, title: string): Promise<void>;
  openTagPalette(): void;
  closeTagPalette(): void;
  toggleTaskTag(tagId: string): Promise<void>;
  createTagAndAttach(name: string): Promise<void>;
  renameTag(id: string, name: string): Promise<void>;
  deleteTag(id: string): Promise<void>;
}

/** ⌘Nで新規タスクを作るときの既定タイトル。TaskDetailはこの値と一致するかで
 * 「新規作成直後(タイトル未入力)」か「それ以外」かを判定し、フォーカス先を出し分ける。 */
export const NEW_TASK_TITLE = "新しいタスク";

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
 * タスク作成(createNewTask / createTaskFromSearch)の二重実行防止フラグ。
 * ⌘N連打などで応答待ち中に同じ捕捉tasksスナップショットへ再度作成をかけると、
 * 後着応答が先に作成済みのタスクを画面から消してしまうため、通信中は後続呼び出しを
 * 丸ごと拒否する(submittingRefと同じ発想。ストアの外に置くのはテストのリセットに
 * 巻き込まれないようにするため)。
 */
let taskCreating = false;

/**
 * タグの作成・改名・削除の二重実行防止フラグ。
 * UI側の submittingRef と同じ発想で、応答待ち中の再実行を丸ごと拒否する。
 * ストアの外に置くのはテストの set/getState リセットに巻き込まれないようにするため。
 */
let tagSubmitting = false;

/**
 * 指定タスクが、現在の絞り込み条件(検索文字列＋タグ)のもとでもまだ見えているかを判定する。
 * setSearchQuery(検索文字列の変更)とcloseTagPalette(タグの付け外し/削除で絞り込み対象集合が
 * 変わりうる)の両方が「選択中のカードが絞り込みから外れたら選択を解除する」という同じ判定を
 * 必要とするため、ここに1本化する。重複させると片方だけ直したときに片肺になる。
 */
function isTaskStillVisible(
  taskId: string,
  tasks: Task[],
  searchQuery: string,
  tags: Tag[],
): boolean {
  return filterTasks(tasks, searchQuery, tags).some((t) => t.id === taskId);
}

/**
 * deleteTag/renameTagはtoggleTaskTagと違って楽観的更新を持たず、tags/tasksの反映が
 * IPC応答を待った後(await の後)にしか起きない。そのため「応答待ち中にEscでタグパレットを
 * 閉じる」タイミングが挟まると、closeTagPaletteが見るtags/tasksはまだ改名/削除前の古いもの
 * になり、isTaskStillVisibleの判定がすり抜けてしまう。ここで反映直後にもう一度同じ判定を
 * やり直す(既にパレットが閉じていた場合だけでよい。開いたままなら、閉じるときに
 * closeTagPaletteが最新のtags/tasksで判定してくれる)。
 * closeTagPalette/setViewと同じ理由で、board以外(detail等)では選択=表示中のタスク
 * そのものなので触らない。
 */
function dropStaleSelectionAfterTagMutation(): void {
  const state = useAppStore.getState();
  if (state.tagPaletteOpen || state.view !== "board" || state.selectedTaskId === null) return;
  const stillVisible = isTaskStillVisible(
    state.selectedTaskId,
    state.tasks,
    state.searchQuery,
    state.tags,
  );
  if (!stillVisible) useAppStore.setState({ selectedTaskId: null });
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
  pendingNewTaskId: null as string | null,
  tags: [] as Tag[],
  tagPaletteOpen: false,
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
    // タグパレットもボードが変わればタグ集合ごと無効になるので同時に閉じる。
    set({ lastDeletedTaskId: null, tagPaletteOpen: false });
    try {
      const [statuses, tasks, tags] = await Promise.all([
        api.statusesList(boardId),
        api.tasksList(boardId),
        api.tagsList(boardId),
      ]);
      if (epoch !== boardEpoch) return false; // 追い越されたので破棄する(boardLoadingは触らない)
      set({
        currentBoardId: boardId,
        statuses,
        tasks,
        tags,
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
    // 詳細から盤面へ戻るときは、closeTagPaletteと同じ「まだ絞り込みに見えているか」の
    // 判定をやり直す。詳細画面でタグを外して選択中カードが絞り込みから外れていた場合、
    // ここで選択を解除しておかないと、盤面に見えていないカードがEnterで開いてしまう
    // (board側は「選択=カーソル位置」なので、この判定はboardへ入るときだけでよい。
    // detailへ入る/switcher・settingsへ行く場合は「選択=表示中のタスクそのもの」なので
    // 触らない)。
    if (view === "board") {
      const { tasks, tags, searchQuery, selectedTaskId } = get();
      const stillVisible =
        selectedTaskId !== null && isTaskStillVisible(selectedTaskId, tasks, searchQuery, tags);
      set({ view, selectedTaskId: stillVisible ? selectedTaskId : null });
      return;
    }
    set({ view });
  },

  setSearchQuery(q) {
    const { tasks, tags, selectedTaskId } = get();
    // 絞り込みの結果、選択中のカードが表示対象から外れたら選択を解除して検索バーへ戻す
    const stillVisible =
      selectedTaskId !== null && isTaskStillVisible(selectedTaskId, tasks, q, tags);
    set({ searchQuery: q, selectedTaskId: stillVisible ? selectedTaskId : null });
  },

  setSelectedTask(id) {
    set({ selectedTaskId: id });
  },

  async createTaskFromSearch() {
    if (boardLoading) return; // ボード切替の読込中は旧ボードのtasksを触ってしまうので拒否する
    if (taskCreating) return; // 応答待ち中のEnter連打等による二重作成を防ぐ
    const { currentBoardId, statuses, searchQuery, tags } = get();
    // 「#タグ名」はタイトルではなく付与するタグとして扱う。
    // 完全一致しないトークンはタイトルに残る(buildTaskDraftFromQueryのコメント参照)
    const draft = buildTaskDraftFromQuery(searchQuery, tags);
    const firstStatus = [...statuses].sort((a, b) => a.position - b.position)[0];
    if (currentBoardId === null || firstStatus === undefined || draft.title === "") return;

    // 応答が返ってきた時点でも同じ切替要求を見ているか確認するため、開始時点のエポックを覚えておく
    const epoch = boardEpoch;

    taskCreating = true;
    // IDはRust側で採番するUUIDなので、ここだけは楽観的更新ではなくAPI先行で作る
    try {
      const created = await api.taskCreate(currentBoardId, firstStatus.id, draft.title);
      // 待っている間にボードが切り替えられていたら、作成自体はDBに済んでいるので
      // 画面には何も反映せず黙って破棄する(別ボードの内容が混ざるのを防ぐ)
      if (epoch !== boardEpoch) return;
      // taskCreateはタグを受け取らないので、作成後に1つずつ付ける。
      // 途中で失敗しても作成済みのタスクは消さず、catchのトーストで知らせる
      for (const tagId of draft.tagIds) {
        await api.taskTagToggle(created.id, tagId);
        if (epoch !== boardEpoch) return;
      }
      // Rust側が先頭挿入時に同レーンを再採番した後の実状態をDBから正引きする。
      // 手元での「残存タスクのposition+1」という楽観計算だと、応答待ち中に同レーンで
      // 削除等が起きた場合にRust側の再採番結果とズレるため、必ずtasksListで正引きする
      const fresh = await api.tasksList(currentBoardId);
      // 正引き中にもボードが切り替えられている可能性があるので、反映直前にも確認する
      if (epoch !== boardEpoch) return;
      set({
        tasks: fresh,
        searchQuery: "",
        selectedTaskId: created.id,
        view: "detail",
      });
    } catch (e) {
      if (epoch !== boardEpoch) return;
      toast.error(`タスクの作成に失敗しました: ${String(e)}`);
    } finally {
      taskCreating = false;
    }
  },

  async createNewTask() {
    if (boardLoading) return; // ボード切替の読込中は旧ボードのtasksを触ってしまうので拒否する
    if (taskCreating) return; // 応答待ち中の⌘N連打による二重作成を防ぐ
    const { currentBoardId, statuses } = get();
    const firstStatus = [...statuses].sort((a, b) => a.position - b.position)[0];
    if (currentBoardId === null || firstStatus === undefined) return;

    // 応答が返ってきた時点でも同じ切替要求を見ているか確認するため、開始時点のエポックを覚えておく
    const epoch = boardEpoch;

    taskCreating = true;
    // IDはRust側で採番するUUIDなので、ここだけは楽観的更新ではなくAPI先行で作る
    try {
      const created = await api.taskCreate(currentBoardId, firstStatus.id, NEW_TASK_TITLE);
      // 待っている間にボードが切り替えられていたら、作成自体はDBに済んでいるので
      // 画面には何も反映せず黙って破棄する(別ボードの内容が混ざるのを防ぐ)
      if (epoch !== boardEpoch) return;
      // Rust側が先頭挿入時に同レーンを再採番した後の実状態をDBから正引きする。
      // 手元での「残存タスクのposition+1」という楽観計算だと、応答待ち中に同レーンで
      // 削除等が起きた場合にRust側の再採番結果とズレるため、必ずtasksListで正引きする
      const fresh = await api.tasksList(currentBoardId);
      // 正引き中にもボードが切り替えられている可能性があるので、反映直前にも確認する
      if (epoch !== boardEpoch) return;
      set({
        tasks: fresh,
        selectedTaskId: created.id,
        // TaskDetail側の初回フォーカス判定用。タイトル文字列ではなくIDで判定するための目印
        pendingNewTaskId: created.id,
        view: "detail",
      });
    } catch (e) {
      if (epoch !== boardEpoch) return;
      toast.error(`タスクの作成に失敗しました: ${String(e)}`);
    } finally {
      taskCreating = false;
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
    const { tasks, statuses, tags, selectedTaskId, searchQuery, currentBoardId } = get();
    if (selectedTaskId === null) return;
    const target = tasks.find((t) => t.id === selectedTaskId);
    if (target === undefined) return;

    // 見えているカードの並びを基準に、次に選ぶカードを決める
    const lanes = buildLanes(statuses, filterTasks(tasks, searchQuery, tags));
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

  openTagPalette() {
    // 対象タスクが無いときは無反応(トーストも出さない)
    if (get().selectedTaskId === null) return;
    set({ tagPaletteOpen: true });
  },

  closeTagPalette() {
    // board上での「選択」は絞り込み結果の中のカーソル位置なので、タグの付け外し/削除で
    // 選択中のカードが絞り込みから外れていたら、setSearchQueryと同じ判定をやり直して
    // 選択を解除する(残したままだと、見えていないカードがEnterで開いてしまう)。
    // toggleTaskTag/deleteTag側で選択を外すと、パレットが開いたままの間に対象タスクが
    // nullになり以後トグルできなくなるため、ここで一括してやる。
    //
    // detail(や switcher/settings)では「選択」＝今まさに表示しているタスクそのものなので、
    // ここで外すとTaskDetailが「タスクが選択されていません」に化けて本文が消える事故になる
    // (かつ selectedTaskId が変わるとTaskDetailのkeyが変わり再マウントされるため、C-1の
    // フォーカス復帰(旧DOMノードを覚えている)も巻き添えで無効化される)。
    // detailで外れた選択は、盤面へ戻るとき(setView("board"))に改めて判定する。
    const { view, tasks, tags, searchQuery, selectedTaskId } = get();
    if (view !== "board") {
      set({ tagPaletteOpen: false });
      return;
    }
    const stillVisible =
      selectedTaskId !== null && isTaskStillVisible(selectedTaskId, tasks, searchQuery, tags);
    set({ tagPaletteOpen: false, selectedTaskId: stillVisible ? selectedTaskId : null });
  },

  async toggleTaskTag(tagId) {
    if (boardLoading) return; // ボード切替の読込中は旧ボードのtasksを触ってしまうので拒否する
    // 注意: ここでは tagSubmitting をあえて見ていない。createTagAndAttach が
    // tagSubmitting=true のまま内部でこのアクションを呼ぶため、対称性を取ろうとして
    // 「タグの付け外しも二重実行防止フラグを見るべきでは」と ifを足すと、
    // タグ作成後の自動アタッチだけが黙って弾かれる(タグは作られるのに選択中タスクへ付かない)
    // という壊れ方をする。付け外し自体の連打防止は不要(冪等かつ楽観的更新で十分)なので、
    // このアクションだけ tagSubmitting を見ない設計を維持すること。
    const { tasks, selectedTaskId, currentBoardId } = get();
    if (selectedTaskId === null) return;
    const target = tasks.find((t) => t.id === selectedTaskId);
    if (target === undefined) return;

    const snapshot = tasks;
    const epoch = boardEpoch;
    const attached = target.tagIds.includes(tagId);
    // 楽観的更新: 押した瞬間にチップが増減する
    set({
      tasks: tasks.map((t) =>
        t.id === selectedTaskId
          ? {
              ...t,
              tagIds: attached
                ? t.tagIds.filter((id) => id !== tagId)
                : [...t.tagIds, tagId],
            }
          : t,
      ),
    });

    try {
      const tagIds = await api.taskTagToggle(selectedTaskId, tagId);
      if (epoch !== boardEpoch) return;
      // 並び順(tags.position昇順)はRust側の返り値を正とする
      set((s) => ({
        tasks: s.tasks.map((t) => (t.id === selectedTaskId ? { ...t, tagIds } : t)),
      }));
    } catch (e) {
      await recoverTasks(currentBoardId, snapshot, epoch);
      if (epoch !== boardEpoch) return;
      toast.error(`タグの変更に失敗しました: ${String(e)}`);
    }
  },

  async createTagAndAttach(name) {
    if (boardLoading) return; // ボード切替の読込中は旧ボードのtags/tasksを触ってしまうので拒否する
    if (tagSubmitting) return; // 応答待ち中の⌘Enter連打による二重作成を防ぐ
    const { currentBoardId, selectedTaskId } = get();
    const trimmed = name.trim();
    if (currentBoardId === null || trimmed === "") return;

    const epoch = boardEpoch;
    tagSubmitting = true;
    try {
      const created = await api.tagCreate(currentBoardId, trimmed);
      if (epoch !== boardEpoch) return;
      set((s) => ({ tags: [...s.tags, created] }));
      // 作ったらそのまま選択中タスクへ付ける（作るだけで終わらせない）
      if (selectedTaskId !== null) {
        await get().toggleTaskTag(created.id);
      }
    } catch (e) {
      if (epoch !== boardEpoch) return;
      toast.error(`タグの作成に失敗しました: ${String(e)}`);
    } finally {
      tagSubmitting = false;
    }
  },

  async renameTag(id, name) {
    if (boardLoading) return; // ボード切替の読込中は旧ボードのtagsを触ってしまうので拒否する
    if (tagSubmitting) return; // 応答待ち中の連打による二重改名を防ぐ
    const trimmed = name.trim();
    if (trimmed === "") return;

    const epoch = boardEpoch;
    tagSubmitting = true;
    try {
      const updated = await api.tagRename(id, trimmed);
      if (epoch !== boardEpoch) return;
      set((s) => ({ tags: s.tags.map((t) => (t.id === id ? updated : t)) }));
      // 改名でタグ名が変わると#タグ名の絞り込み結果も変わりうるので判定し直す(m-1)
      dropStaleSelectionAfterTagMutation();
    } catch (e) {
      if (epoch !== boardEpoch) return;
      toast.error(`タグの改名に失敗しました: ${String(e)}`);
    } finally {
      tagSubmitting = false;
    }
  },

  async deleteTag(id) {
    if (boardLoading) return; // ボード切替の読込中は旧ボードのtags/tasksを触ってしまうので拒否する
    if (tagSubmitting) return; // 応答待ち中の連打による二重削除を防ぐ

    const epoch = boardEpoch;
    tagSubmitting = true;
    try {
      await api.tagDelete(id);
      if (epoch !== boardEpoch) return;
      // Rust側は task_tags を CASCADE で消すので、手元のタスクからも外す
      set((s) => ({
        tags: s.tags.filter((t) => t.id !== id),
        tasks: s.tasks.map((t) => ({ ...t, tagIds: t.tagIds.filter((tid) => tid !== id) })),
      }));
      // 削除でタグが外れると絞り込み結果も変わりうるので判定し直す(m-1)
      dropStaleSelectionAfterTagMutation();
    } catch (e) {
      if (epoch !== boardEpoch) return;
      toast.error(`タグの削除に失敗しました: ${String(e)}`);
    } finally {
      tagSubmitting = false;
    }
  },
}));
