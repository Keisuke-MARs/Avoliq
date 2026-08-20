import { beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "@/lib/api";
import { toast } from "sonner";
import { isBoardLoading, useAppStore } from "./appStore";
import { board, board2, statuses, tasks } from "@/test/fixtures";
import type { Status, Task } from "@/types";

vi.mock("@/lib/api", () => ({
  boardsList: vi.fn(),
  statusesList: vi.fn(),
  tasksList: vi.fn(),
  taskCreate: vi.fn(),
  taskUpdate: vi.fn(),
  taskMove: vi.fn(),
  taskDelete: vi.fn(),
  taskRestore: vi.fn(),
  hidePalette: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

const mocked = vi.mocked(api);

/** 「メインボードを読み込み済み」の状態を作る */
async function loadFixtureBoard(): Promise<void> {
  mocked.boardsList.mockResolvedValue([board, board2]);
  mocked.statusesList.mockResolvedValue(statuses);
  mocked.tasksList.mockResolvedValue(tasks);
  await useAppStore.getState().loadBoards();
}

describe("appStore: 初期状態", () => {
  it("すべて空・view は board", () => {
    const s = useAppStore.getState();
    expect(s.boards).toEqual([]);
    expect(s.currentBoardId).toBeNull();
    expect(s.statuses).toEqual([]);
    expect(s.tasks).toEqual([]);
    expect(s.selectedTaskId).toBeNull();
    expect(s.view).toBe("board");
    expect(s.searchQuery).toBe("");
    expect(s.lastDeletedTaskId).toBeNull();
  });
});

describe("appStore: loadBoards", () => {
  it("ボード一覧を読み込み、先頭ボードを自動選択する", async () => {
    await loadFixtureBoard();
    const s = useAppStore.getState();
    expect(s.boards).toHaveLength(2);
    expect(s.currentBoardId).toBe("board-1");
    expect(s.statuses).toHaveLength(4);
    expect(s.tasks).toHaveLength(6);
  });

  it("失敗したらトーストを出して状態を変えない", async () => {
    mocked.boardsList.mockRejectedValue("DB error");
    await useAppStore.getState().loadBoards();
    expect(useAppStore.getState().boards).toEqual([]);
    expect(toast.error).toHaveBeenCalled();
  });
});

describe("appStore: selectBoard", () => {
  it("ステータスとタスクを読み直し、検索と選択をリセットする", async () => {
    await loadFixtureBoard();
    useAppStore.setState({ searchQuery: "牛", selectedTaskId: "t-a", view: "detail" });

    mocked.statusesList.mockResolvedValue([]);
    mocked.tasksList.mockResolvedValue([]);
    await useAppStore.getState().selectBoard("board-2");

    const s = useAppStore.getState();
    expect(s.currentBoardId).toBe("board-2");
    expect(s.statuses).toEqual([]);
    expect(s.tasks).toEqual([]);
    expect(s.searchQuery).toBe("");
    expect(s.selectedTaskId).toBeNull();
    expect(s.view).toBe("board");
  });

  it("2回連続で呼んでも、1回目の応答が遅延して後から届いたら2回目の結果を残す", async () => {
    await loadFixtureBoard();

    // 1回目(board-2)を遅延させ、2回目(board-1リロード)を先に完了させる
    let resolveFirstStatuses: (value: Status[]) => void = () => {};
    let resolveFirstTasks: (value: Task[]) => void = () => {};
    const firstStatuses = new Promise<Status[]>((resolve) => {
      resolveFirstStatuses = resolve;
    });
    const firstTasks = new Promise<Task[]>((resolve) => {
      resolveFirstTasks = resolve;
    });
    mocked.statusesList.mockReturnValueOnce(firstStatuses);
    mocked.tasksList.mockReturnValueOnce(firstTasks);
    const firstCall = useAppStore.getState().selectBoard("board-2");

    const secondStatuses = [statuses[0]];
    const secondTasks = [tasks[0]];
    mocked.statusesList.mockResolvedValueOnce(secondStatuses);
    mocked.tasksList.mockResolvedValueOnce(secondTasks);
    const secondCall = useAppStore.getState().selectBoard("board-1");
    await secondCall;

    // ここで1回目の応答が今さら届く
    resolveFirstStatuses([]);
    resolveFirstTasks([]);
    await firstCall;

    const s = useAppStore.getState();
    expect(s.currentBoardId).toBe("board-1");
    expect(s.statuses).toEqual(secondStatuses);
    expect(s.tasks).toEqual(secondTasks);
  });

  it("読込中はboardLoadingがtrueになり、完了後にfalseへ戻る", async () => {
    await loadFixtureBoard();
    let resolveStatuses: (value: Status[]) => void = () => {};
    let resolveTasks: (value: Task[]) => void = () => {};
    mocked.statusesList.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveStatuses = resolve;
      }),
    );
    mocked.tasksList.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveTasks = resolve;
      }),
    );

    expect(isBoardLoading()).toBe(false);
    const selectPromise = useAppStore.getState().selectBoard("board-2");
    expect(isBoardLoading()).toBe(true);

    resolveStatuses([]);
    resolveTasks([]);
    await selectPromise;

    expect(isBoardLoading()).toBe(false);
  });

  it("読込中に別ボードへの切替要求が先行していても、最終的にはboardLoadingがfalseに戻る", async () => {
    await loadFixtureBoard();
    let resolveFirstStatuses: (value: Status[]) => void = () => {};
    let resolveFirstTasks: (value: Task[]) => void = () => {};
    mocked.statusesList.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveFirstStatuses = resolve;
      }),
    );
    mocked.tasksList.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveFirstTasks = resolve;
      }),
    );
    const firstCall = useAppStore.getState().selectBoard("board-2");

    mocked.statusesList.mockResolvedValueOnce([statuses[0]]);
    mocked.tasksList.mockResolvedValueOnce([tasks[0]]);
    const secondCall = useAppStore.getState().selectBoard("board-1");
    await secondCall;
    expect(isBoardLoading()).toBe(false);

    // 追い越された1回目の応答が今さら届いても、boardLoadingは(2回目が既に戻したので)falseのまま
    resolveFirstStatuses([]);
    resolveFirstTasks([]);
    await firstCall;
    expect(isBoardLoading()).toBe(false);
  });
});

describe("appStore: setSearchQuery", () => {
  beforeEach(async () => {
    await loadFixtureBoard();
  });

  it("クエリを保存する", () => {
    useAppStore.getState().setSearchQuery("牛");
    expect(useAppStore.getState().searchQuery).toBe("牛");
  });

  it("絞り込みで選択中のカードが消えたら選択を外す", () => {
    useAppStore.getState().setSelectedTask("t-b");
    useAppStore.getState().setSearchQuery("牛");
    expect(useAppStore.getState().selectedTaskId).toBeNull();
  });

  it("選択中のカードが絞り込み後も残るなら選択を保つ", () => {
    useAppStore.getState().setSelectedTask("t-a");
    useAppStore.getState().setSearchQuery("牛");
    expect(useAppStore.getState().selectedTaskId).toBe("t-a");
  });
});

describe("appStore: setView / setSelectedTask", () => {
  it("view を切り替える", () => {
    useAppStore.getState().setView("detail");
    expect(useAppStore.getState().view).toBe("detail");
  });

  it("選択タスクを設定・解除できる", () => {
    useAppStore.getState().setSelectedTask("t-a");
    expect(useAppStore.getState().selectedTaskId).toBe("t-a");
    useAppStore.getState().setSelectedTask(null);
    expect(useAppStore.getState().selectedTaskId).toBeNull();
  });
});

describe("appStore: createTaskFromSearch", () => {
  beforeEach(async () => {
    await loadFixtureBoard();
  });

  it("検索文字列をタイトルに先頭ステータスへ作成し、詳細画面へ遷移する", async () => {
    const created: Task = {
      id: "t-new",
      boardId: "board-1",
      statusId: "st-todo",
      title: "新しいタスク",
      contentMd: "",
      position: 0,
      createdAt: "2026-08-20T01:00:00Z",
      updatedAt: "2026-08-20T01:00:00Z",
    };
    mocked.taskCreate.mockResolvedValue(created);

    useAppStore.getState().setSearchQuery("新しいタスク");
    await useAppStore.getState().createTaskFromSearch();

    expect(mocked.taskCreate).toHaveBeenCalledWith("board-1", "st-todo", "新しいタスク");
    const s = useAppStore.getState();
    expect(s.tasks).toHaveLength(7);
    expect(s.selectedTaskId).toBe("t-new");
    expect(s.view).toBe("detail");
    expect(s.searchQuery).toBe("");
    // 先頭挿入なので同レーンの既存タスクは1つずつ後ろへずれる
    expect(s.tasks.find((t) => t.id === "t-a")?.position).toBe(1);
    // 別レーンのタスクのpositionは動かない
    expect(s.tasks.find((t) => t.id === "t-d")?.position).toBe(0);
  });

  it("検索文字列が空なら何もしない", async () => {
    await useAppStore.getState().createTaskFromSearch();
    expect(mocked.taskCreate).not.toHaveBeenCalled();
    expect(useAppStore.getState().view).toBe("board");
  });

  it("失敗したらトーストを出し、タスクを増やさない", async () => {
    mocked.taskCreate.mockRejectedValue("DB error");
    useAppStore.getState().setSearchQuery("失敗するタスク");
    await useAppStore.getState().createTaskFromSearch();
    expect(useAppStore.getState().tasks).toHaveLength(6);
    expect(useAppStore.getState().view).toBe("board");
    expect(toast.error).toHaveBeenCalled();
  });

  it("応答が届く前に別ボードへの切替要求が先行していたら、作成結果を反映しない", async () => {
    const created: Task = {
      id: "t-new",
      boardId: "board-1",
      statusId: "st-todo",
      title: "新しいタスク",
      contentMd: "",
      position: 0,
      createdAt: "2026-08-20T01:00:00Z",
      updatedAt: "2026-08-20T01:00:00Z",
    };
    let switchPromise: Promise<void> = Promise.resolve();
    // 作成自体はDBに済むが、応答が返ってくる前に⌘1-9等で本物の切替要求(selectBoard)が
    // 入ったことを再現する。エポックはselectBoard呼び出しの時点(awaitの前)で同期的に進むので、
    // ここでのcreated反映はエポック不一致として破棄されるはず。
    mocked.taskCreate.mockImplementation(async () => {
      switchPromise = useAppStore.getState().selectBoard("board-2");
      return created;
    });

    useAppStore.getState().setSearchQuery("新しいタスク");
    await useAppStore.getState().createTaskFromSearch();

    const s = useAppStore.getState();
    expect(s.tasks.some((t) => t.id === "t-new")).toBe(false);
    expect(s.selectedTaskId).not.toBe("t-new");
    expect(s.view).not.toBe("detail");

    await switchPromise;
  });
});

describe("appStore: moveSelectedTask", () => {
  beforeEach(async () => {
    await loadFixtureBoard();
    mocked.taskMove.mockResolvedValue(tasks[0]);
  });

  it("→で隣のステータスの先頭へ移す", async () => {
    useAppStore.getState().setSelectedTask("t-b");
    await useAppStore.getState().moveSelectedTask("right");

    expect(mocked.taskMove).toHaveBeenCalledWith("t-b", "st-doing", 0);
    const s = useAppStore.getState();
    const moved = s.tasks.find((t) => t.id === "t-b");
    expect(moved?.statusId).toBe("st-doing");
    expect(moved?.position).toBe(0);
    // 移動先レーンの既存タスクは後ろへずれる
    expect(s.tasks.find((t) => t.id === "t-d")?.position).toBe(1);
    // 移動元レーンで後ろにいたタスクは前へ詰まる
    expect(s.tasks.find((t) => t.id === "t-c")?.position).toBe(1);
    // 選択は移動したタスクに追従する
    expect(s.selectedTaskId).toBe("t-b");
  });

  it("←で1つ前のステータスへ移す", async () => {
    useAppStore.getState().setSelectedTask("t-d");
    await useAppStore.getState().moveSelectedTask("left");
    expect(mocked.taskMove).toHaveBeenCalledWith("t-d", "st-todo", 0);
    expect(useAppStore.getState().tasks.find((t) => t.id === "t-d")?.statusId).toBe("st-todo");
  });

  it("空のレーンへも移せる（空レーンは飛ばさない）", async () => {
    useAppStore.getState().setSelectedTask("t-d");
    await useAppStore.getState().moveSelectedTask("right");
    expect(mocked.taskMove).toHaveBeenCalledWith("t-d", "st-check", 0);
  });

  it("左端のレーンで←なら何もしない", async () => {
    useAppStore.getState().setSelectedTask("t-a");
    await useAppStore.getState().moveSelectedTask("left");
    expect(mocked.taskMove).not.toHaveBeenCalled();
  });

  it("右端のレーンで→なら何もしない", async () => {
    useAppStore.getState().setSelectedTask("t-f");
    await useAppStore.getState().moveSelectedTask("right");
    expect(mocked.taskMove).not.toHaveBeenCalled();
  });

  it("未選択なら何もしない", async () => {
    await useAppStore.getState().moveSelectedTask("right");
    expect(mocked.taskMove).not.toHaveBeenCalled();
  });

  it("失敗したらDBの実状態を読み直して合わせる", async () => {
    mocked.taskMove.mockRejectedValue("DB error");
    // DB側の実状態(モックのtasksList)をsnapshotとは判別できる値にしておき、
    // 読み直し経由で反映されたことを確認する
    const freshFromDb = tasks.map((t) =>
      t.id === "t-b" ? { ...t, title: "DBに残っている資料をまとめる" } : t,
    );
    mocked.tasksList.mockResolvedValueOnce(freshFromDb);
    useAppStore.getState().setSelectedTask("t-b");

    await useAppStore.getState().moveSelectedTask("right");

    expect(mocked.tasksList).toHaveBeenLastCalledWith("board-1");
    const s = useAppStore.getState();
    expect(s.tasks).toEqual(freshFromDb);
    expect(s.tasks.find((t) => t.id === "t-b")?.title).toBe(
      "DBに残っている資料をまとめる",
    );
    expect(toast.error).toHaveBeenCalled();
  });

  it("読み直しにも失敗したら直前のsnapshotへ戻す", async () => {
    mocked.taskMove.mockRejectedValue("DB error");
    mocked.tasksList.mockRejectedValueOnce("DB unreachable");
    useAppStore.getState().setSelectedTask("t-b");

    await useAppStore.getState().moveSelectedTask("right");

    const s = useAppStore.getState();
    expect(s.tasks.find((t) => t.id === "t-b")?.statusId).toBe("st-todo");
    expect(s.tasks.find((t) => t.id === "t-b")?.position).toBe(1);
    expect(toast.error).toHaveBeenCalled();
  });

  it("読み直し中に別ボードへの切替要求が先行していたら、その結果を反映しない", async () => {
    mocked.taskMove.mockRejectedValue("DB error");
    const freshFromDb = tasks.map((t) =>
      t.id === "t-b" ? { ...t, title: "DBに残っている資料をまとめる" } : t,
    );
    let switchPromise: Promise<void> = Promise.resolve();
    let triggered = false;
    // 読み直し(recoverTasks)のtasksList応答を待っている間に、⌘1-9等で本物の切替要求
    // (selectBoard)が入ったことを再現する。selectBoard内部でも同じtasksListモックが
    // 呼ばれるので、無限に再帰しないよう最初の1回だけ切替を発火させる。
    mocked.tasksList.mockImplementation(async () => {
      if (!triggered) {
        triggered = true;
        switchPromise = useAppStore.getState().selectBoard("board-2");
        return freshFromDb;
      }
      return tasks;
    });
    useAppStore.getState().setSelectedTask("t-b");

    await useAppStore.getState().moveSelectedTask("right");
    await switchPromise;

    const s = useAppStore.getState();
    // 読み直しの結果(freshFromDb)は切替要求より古い応答としてエポック不一致で破棄される
    expect(s.tasks.find((t) => t.id === "t-b")?.title).not.toBe(
      "DBに残っている資料をまとめる",
    );
    expect(s.currentBoardId).toBe("board-2");
    // 切替要求より古い失敗応答は、トーストも含めてエポック不一致として抑止される
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("selectBoardの読込中はmoveSelectedTaskを拒否し、tasksもAPIも変化させない", async () => {
    useAppStore.getState().setSelectedTask("t-b");

    // 応答を保留したままselectBoardを呼び、「切替要求済み・読込未完了」の間隙を作る。
    // このときtasks/selectedTaskIdはまだ旧ボード(board-1)のままだが、epochはすでに
    // 新ボード用に進んでいるので、epoch一致だけを見るmoveSelectedTaskは素通りしてしまう
    // (=修正前のバグ)。boardLoadingで拒否できているかを確認する。
    let resolveStatuses: (value: Status[]) => void = () => {};
    let resolveTasks: (value: Task[]) => void = () => {};
    mocked.statusesList.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveStatuses = resolve;
      }),
    );
    mocked.tasksList.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveTasks = resolve;
      }),
    );
    const selectPromise = useAppStore.getState().selectBoard("board-2");

    const tasksBefore = useAppStore.getState().tasks;
    await useAppStore.getState().moveSelectedTask("right");

    expect(mocked.taskMove).not.toHaveBeenCalled();
    expect(useAppStore.getState().tasks).toBe(tasksBefore);

    resolveStatuses([]);
    resolveTasks([]);
    await selectPromise;
  });
});

describe("appStore: reorderSelectedTask", () => {
  beforeEach(async () => {
    await loadFixtureBoard();
    mocked.taskMove.mockResolvedValue(tasks[0]);
  });

  it("↑で同レーンの1つ上と入れ替える", async () => {
    useAppStore.getState().setSelectedTask("t-b");
    await useAppStore.getState().reorderSelectedTask("up");

    expect(mocked.taskMove).toHaveBeenCalledWith("t-b", "st-todo", 0);
    const s = useAppStore.getState();
    expect(s.tasks.find((t) => t.id === "t-b")?.position).toBe(0);
    expect(s.tasks.find((t) => t.id === "t-a")?.position).toBe(1);
  });

  it("↓で同レーンの1つ下と入れ替える", async () => {
    useAppStore.getState().setSelectedTask("t-b");
    await useAppStore.getState().reorderSelectedTask("down");
    expect(mocked.taskMove).toHaveBeenCalledWith("t-b", "st-todo", 2);
    expect(useAppStore.getState().tasks.find((t) => t.id === "t-b")?.position).toBe(2);
  });

  it("先頭で↑なら何もしない", async () => {
    useAppStore.getState().setSelectedTask("t-a");
    await useAppStore.getState().reorderSelectedTask("up");
    expect(mocked.taskMove).not.toHaveBeenCalled();
  });

  it("末尾で↓なら何もしない", async () => {
    useAppStore.getState().setSelectedTask("t-c");
    await useAppStore.getState().reorderSelectedTask("down");
    expect(mocked.taskMove).not.toHaveBeenCalled();
  });

  it("絞り込み中でも絞り込み前の行番号で並び替える", async () => {
    // 「牛」で絞ると t-a(行0) と t-c(行2) だけが見えるが、
    // t-c を↑した結果は絞り込み前の1つ上である t-b との入れ替えになる
    useAppStore.getState().setSelectedTask("t-c");
    useAppStore.getState().setSearchQuery("牛");
    await useAppStore.getState().reorderSelectedTask("up");
    expect(mocked.taskMove).toHaveBeenCalledWith("t-c", "st-todo", 1);
  });

  it("失敗したらDBの実状態を読み直して合わせる", async () => {
    mocked.taskMove.mockRejectedValue("DB error");
    const freshFromDb = tasks.map((t) =>
      t.id === "t-b" ? { ...t, title: "DBに残っている資料をまとめる" } : t,
    );
    mocked.tasksList.mockResolvedValueOnce(freshFromDb);
    useAppStore.getState().setSelectedTask("t-b");

    await useAppStore.getState().reorderSelectedTask("up");

    expect(mocked.tasksList).toHaveBeenLastCalledWith("board-1");
    const s = useAppStore.getState();
    expect(s.tasks).toEqual(freshFromDb);
    expect(toast.error).toHaveBeenCalled();
  });
});

describe("appStore: deleteSelectedTask / undoDelete", () => {
  beforeEach(async () => {
    await loadFixtureBoard();
  });

  it("選択中のタスクを消し、1つ下を選び直し、undo用に覚えておく", async () => {
    mocked.taskDelete.mockResolvedValue(tasks[0]);
    useAppStore.getState().setSelectedTask("t-a");
    await useAppStore.getState().deleteSelectedTask();

    expect(mocked.taskDelete).toHaveBeenCalledWith("t-a");
    const s = useAppStore.getState();
    expect(s.tasks.map((t) => t.id)).not.toContain("t-a");
    expect(s.selectedTaskId).toBe("t-b");
    expect(s.lastDeletedTaskId).toBe("t-a");
  });

  it("レーンの最後の1件を消したら選択を外す", async () => {
    mocked.taskDelete.mockResolvedValue(tasks[5]);
    useAppStore.getState().setSelectedTask("t-f");
    await useAppStore.getState().deleteSelectedTask();
    expect(useAppStore.getState().selectedTaskId).toBeNull();
  });

  it("未選択なら何もしない", async () => {
    await useAppStore.getState().deleteSelectedTask();
    expect(mocked.taskDelete).not.toHaveBeenCalled();
  });

  it("削除に失敗したらDBの実状態を読み直して合わせる", async () => {
    mocked.taskDelete.mockRejectedValue("DB error");
    const freshFromDb = tasks.map((t) =>
      t.id === "t-a" ? { ...t, title: "DBに残っている牛乳を買う" } : t,
    );
    mocked.tasksList.mockResolvedValueOnce(freshFromDb);
    useAppStore.getState().setSelectedTask("t-a");

    await useAppStore.getState().deleteSelectedTask();

    expect(mocked.tasksList).toHaveBeenLastCalledWith("board-1");
    const s = useAppStore.getState();
    expect(s.tasks).toEqual(freshFromDb);
    expect(s.selectedTaskId).toBe("t-a");
    expect(s.lastDeletedTaskId).toBeNull();
    expect(toast.error).toHaveBeenCalled();
  });

  it("undoDelete で直前に削除したタスクを復元して選択する", async () => {
    mocked.taskDelete.mockResolvedValue(tasks[0]);
    mocked.taskRestore.mockResolvedValue(tasks[0]);

    useAppStore.getState().setSelectedTask("t-a");
    await useAppStore.getState().deleteSelectedTask();
    await useAppStore.getState().undoDelete();

    expect(mocked.taskRestore).toHaveBeenCalledWith("t-a");
    const s = useAppStore.getState();
    expect(s.tasks).toHaveLength(6);
    expect(s.tasks.filter((t) => t.id === "t-a")).toHaveLength(1);
    expect(s.selectedTaskId).toBe("t-a");
    expect(s.lastDeletedTaskId).toBeNull();
  });

  it("削除していなければ undoDelete は何もしない", async () => {
    await useAppStore.getState().undoDelete();
    expect(mocked.taskRestore).not.toHaveBeenCalled();
  });

  it("復元に失敗したらトーストを出す", async () => {
    mocked.taskDelete.mockResolvedValue(tasks[0]);
    mocked.taskRestore.mockRejectedValue("DB error");
    useAppStore.getState().setSelectedTask("t-a");
    await useAppStore.getState().deleteSelectedTask();
    await useAppStore.getState().undoDelete();
    expect(useAppStore.getState().tasks).toHaveLength(5);
    expect(toast.error).toHaveBeenCalled();
  });

  it("削除後にボードを切り替えたら、⌘Zは別ボードにタスクを復活させない(undoはボードローカル)", async () => {
    mocked.taskDelete.mockResolvedValue(tasks[0]);
    useAppStore.getState().setSelectedTask("t-a");
    await useAppStore.getState().deleteSelectedTask();
    expect(useAppStore.getState().lastDeletedTaskId).toBe("t-a");

    // selectBoardは要求時点(awaitより前)でlastDeletedTaskIdを同期的にクリアする
    mocked.statusesList.mockResolvedValue([]);
    mocked.tasksList.mockResolvedValue([]);
    await useAppStore.getState().selectBoard("board-2");
    expect(useAppStore.getState().lastDeletedTaskId).toBeNull();

    await useAppStore.getState().undoDelete();

    expect(mocked.taskRestore).not.toHaveBeenCalled();
    expect(useAppStore.getState().tasks.some((t) => t.id === "t-a")).toBe(false);
  });

  it("削除に失敗し、復旧の読み直し中に別ボードへの切替要求が先行していたら、selectedTaskIdを汚染しない", async () => {
    mocked.taskDelete.mockRejectedValue("DB error");
    let switchPromise: Promise<void> = Promise.resolve();
    let triggered = false;
    // 復旧(recoverTasks)のtasksList応答を待っている間に、⌘1-9等で本物の切替要求
    // (selectBoard)が入ったことを再現する。同じtasksListモックがselectBoard内部からも
    // 呼ばれるので、無限に再帰しないよう最初の1回だけ切替を発火させる。
    mocked.tasksList.mockImplementation(async () => {
      if (!triggered) {
        triggered = true;
        switchPromise = useAppStore.getState().selectBoard("board-2");
        return tasks;
      }
      return [];
    });
    mocked.statusesList.mockResolvedValue([]);
    useAppStore.getState().setSelectedTask("t-a");

    await useAppStore.getState().deleteSelectedTask();
    await switchPromise;

    const s = useAppStore.getState();
    // 失敗時のロールバック(selectedTaskId: "t-a"への巻き戻し)はエポック不一致で破棄され、
    // board-2切替後の状態(selectedTaskId: null)を汚さない
    expect(s.selectedTaskId).toBeNull();
    expect(s.currentBoardId).toBe("board-2");
    expect(toast.error).not.toHaveBeenCalled();
  });
});

describe("appStore: updateTaskTitle / updateTaskContent", () => {
  beforeEach(async () => {
    await loadFixtureBoard();
    mocked.taskUpdate.mockResolvedValue(tasks[0]);
  });

  it("タイトルを先にローカル反映してから保存する", async () => {
    await useAppStore.getState().updateTaskTitle("t-a", "牛乳と卵を買う");
    expect(mocked.taskUpdate).toHaveBeenCalledWith("t-a", "牛乳と卵を買う", null);
    expect(useAppStore.getState().tasks.find((t) => t.id === "t-a")?.title).toBe("牛乳と卵を買う");
  });

  it("本文を先にローカル反映してから保存する", async () => {
    await useAppStore.getState().updateTaskContent("t-a", "# メモ");
    expect(mocked.taskUpdate).toHaveBeenCalledWith("t-a", null, "# メモ");
    expect(useAppStore.getState().tasks.find((t) => t.id === "t-a")?.contentMd).toBe("# メモ");
  });

  it("保存に失敗したらDBの実状態を読み直して合わせる", async () => {
    mocked.taskUpdate.mockRejectedValue("DB error");
    const freshFromDb = tasks.map((t) =>
      t.id === "t-a" ? { ...t, title: "DBに残っている牛乳を買う" } : t,
    );
    mocked.tasksList.mockResolvedValueOnce(freshFromDb);

    await useAppStore.getState().updateTaskTitle("t-a", "壊れるタイトル");

    expect(mocked.tasksList).toHaveBeenLastCalledWith("board-1");
    expect(useAppStore.getState().tasks.find((t) => t.id === "t-a")?.title).toBe(
      "DBに残っている牛乳を買う",
    );
    expect(toast.error).toHaveBeenCalled();
  });
});
