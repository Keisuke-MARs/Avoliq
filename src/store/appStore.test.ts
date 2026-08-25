import { beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "@/lib/api";
import { toast } from "sonner";
import { NEW_TASK_TITLE, isBoardLoading, useAppStore } from "./appStore";
import { board, board2, statuses, tags, tasks } from "@/test/fixtures";
import type { Status, Tag, Task } from "@/types";

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
  tagsList: vi.fn(),
  tagCreate: vi.fn(),
  tagRename: vi.fn(),
  tagDelete: vi.fn(),
  taskTagToggle: vi.fn(),
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
  mocked.tagsList.mockResolvedValue(tags);
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

  it("成功したらtrueを返す", async () => {
    await loadFixtureBoard();
    mocked.statusesList.mockResolvedValueOnce([]);
    mocked.tasksList.mockResolvedValueOnce([]);

    const result = await useAppStore.getState().selectBoard("board-2");

    expect(result).toBe(true);
  });

  it("読込に失敗したらfalseを返し、トーストを出す", async () => {
    await loadFixtureBoard();
    mocked.statusesList.mockRejectedValueOnce("DB error");
    mocked.tasksList.mockResolvedValueOnce([]);

    const result = await useAppStore.getState().selectBoard("board-2");

    expect(result).toBe(false);
    expect(toast.error).toHaveBeenCalled();
  });

  it("エポック追い越しで破棄されたらfalseを返す", async () => {
    await loadFixtureBoard();
    // 1回目(board-2)を遅延させ、2回目(board-1)を先に完了させて1回目を追い越す
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
    expect(await secondCall).toBe(true);

    resolveFirstStatuses([]);
    resolveFirstTasks([]);
    expect(await firstCall).toBe(false);
  });
});

describe("appStore: タグ", () => {
  it("selectBoard はタグも読み込む", async () => {
    mocked.statusesList.mockResolvedValue(statuses);
    mocked.tasksList.mockResolvedValue(tasks);
    mocked.tagsList.mockResolvedValue(tags);

    await useAppStore.getState().selectBoard("board-1");

    expect(useAppStore.getState().tags).toEqual(tags);
  });

  it("selectBoard は開いていたタグパレットを閉じる", async () => {
    mocked.statusesList.mockResolvedValue(statuses);
    mocked.tasksList.mockResolvedValue(tasks);
    mocked.tagsList.mockResolvedValue(tags);
    useAppStore.setState({ tagPaletteOpen: true });

    await useAppStore.getState().selectBoard("board-1");

    expect(useAppStore.getState().tagPaletteOpen).toBe(false);
  });

  it("openTagPalette はカード未選択なら開かない", () => {
    useAppStore.setState({ selectedTaskId: null });

    useAppStore.getState().openTagPalette();

    expect(useAppStore.getState().tagPaletteOpen).toBe(false);
  });

  it("openTagPalette はカード選択中なら開く", () => {
    useAppStore.setState({ selectedTaskId: "t-a" });

    useAppStore.getState().openTagPalette();

    expect(useAppStore.getState().tagPaletteOpen).toBe(true);
  });

  it("closeTagPalette は閉じる", () => {
    useAppStore.setState({ tagPaletteOpen: true });

    useAppStore.getState().closeTagPalette();

    expect(useAppStore.getState().tagPaletteOpen).toBe(false);
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

describe("appStore: closeTagPalette と絞り込み", () => {
  beforeEach(async () => {
    await loadFixtureBoard();
  });

  it("タグを外して絞り込みから外れたカードは選択を解除する", () => {
    // 検索欄が#バグの状態でt-a(バグ持ち)を選択中→タグパレットでバグを外した状況を再現する
    useAppStore.setState({
      searchQuery: "#バグ",
      selectedTaskId: "t-a",
      tagPaletteOpen: true,
      tasks: useAppStore
        .getState()
        .tasks.map((t) => (t.id === "t-a" ? { ...t, tagIds: t.tagIds.filter((id) => id !== "tag-bug") } : t)),
    });

    useAppStore.getState().closeTagPalette();

    expect(useAppStore.getState().tagPaletteOpen).toBe(false);
    expect(useAppStore.getState().selectedTaskId).toBeNull();
  });

  it("絞り込みから外れていなければ選択を維持する", () => {
    // t-a はバグを持ったまま(絞り込みに残る)
    useAppStore.setState({ searchQuery: "#バグ", selectedTaskId: "t-a", tagPaletteOpen: true });

    useAppStore.getState().closeTagPalette();

    expect(useAppStore.getState().selectedTaskId).toBe("t-a");
  });

  it("検索クエリが空ならタグを外しても選択を維持する", () => {
    useAppStore.setState({
      searchQuery: "",
      selectedTaskId: "t-a",
      tagPaletteOpen: true,
      tasks: useAppStore.getState().tasks.map((t) => (t.id === "t-a" ? { ...t, tagIds: [] } : t)),
    });

    useAppStore.getState().closeTagPalette();

    expect(useAppStore.getState().selectedTaskId).toBe("t-a");
  });

  // N-1回帰: 詳細画面では「選択」＝表示中のタスクそのものなので、ここで外すと
  // TaskDetailが「タスクが選択されていません」に化けて本文が消える事故になる。
  // board側の穴を塞いだ修正が、detail側に新しい穴を開けていないかを確認する。
  it("detail画面では絞り込みから外れていても選択とviewをどちらも保つ", () => {
    // 検索欄が#バグの状態でt-a(バグ持ち)の詳細を開いた後、パレットでバグを外した状況を再現する
    useAppStore.setState({
      view: "detail",
      searchQuery: "#バグ",
      selectedTaskId: "t-a",
      tagPaletteOpen: true,
      tasks: useAppStore
        .getState()
        .tasks.map((t) => (t.id === "t-a" ? { ...t, tagIds: t.tagIds.filter((id) => id !== "tag-bug") } : t)),
    });

    useAppStore.getState().closeTagPalette();

    expect(useAppStore.getState().tagPaletteOpen).toBe(false);
    // 選択もviewも変えない(詳細画面のまま、本文は消えない)
    expect(useAppStore.getState().selectedTaskId).toBe("t-a");
    expect(useAppStore.getState().view).toBe("detail");
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

  // N-1回帰: detailでタグを外して絞り込みから外れたカードは、closeTagPaletteでは
  // 選択を残す(本文を消さないため)ので、盤面へ戻るこのタイミングで改めて判定する。
  // ここで解除しないと、盤面に見えていないカードがEnterで開いてしまう。
  it("detail → board で絞り込みから外れた選択が解除される", async () => {
    await loadFixtureBoard();
    // 検索欄が#バグの状態で、t-aは既にバグを外されて絞り込みから外れている
    useAppStore.setState({
      view: "detail",
      searchQuery: "#バグ",
      selectedTaskId: "t-a",
      tasks: useAppStore
        .getState()
        .tasks.map((t) => (t.id === "t-a" ? { ...t, tagIds: t.tagIds.filter((id) => id !== "tag-bug") } : t)),
    });

    useAppStore.getState().setView("board");

    expect(useAppStore.getState().view).toBe("board");
    expect(useAppStore.getState().selectedTaskId).toBeNull();
  });

  it("detail → board でも絞り込みに残っていれば選択を維持する", async () => {
    await loadFixtureBoard();
    // t-c はバグを持ったまま(絞り込みに残る)
    useAppStore.setState({ view: "detail", searchQuery: "#バグ", selectedTaskId: "t-c" });

    useAppStore.getState().setView("board");

    expect(useAppStore.getState().selectedTaskId).toBe("t-c");
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
      tagIds: [],
    };
    mocked.taskCreate.mockResolvedValue(created);
    // 作成成功後の反映はtasksListでの正引きなので、Rust側が再採番した後の実状態を用意する
    const freshFromDb: Task[] = [
      { ...tasks[0], position: 1 },
      { ...tasks[1], position: 2 },
      { ...tasks[2], position: 3 },
      tasks[3],
      tasks[4],
      tasks[5],
      created,
    ];
    mocked.tasksList.mockResolvedValueOnce(freshFromDb);

    useAppStore.getState().setSearchQuery("新しいタスク");
    await useAppStore.getState().createTaskFromSearch();

    expect(mocked.taskCreate).toHaveBeenCalledWith("board-1", "st-todo", "新しいタスク");
    expect(mocked.tasksList).toHaveBeenLastCalledWith("board-1");
    const s = useAppStore.getState();
    // 反映結果はtasksListが返した実状態そのもの(手動position計算はしない)
    expect(s.tasks).toEqual(freshFromDb);
    expect(s.selectedTaskId).toBe("t-new");
    expect(s.view).toBe("detail");
    expect(s.searchQuery).toBe("");
    // 先頭挿入なので同レーンの既存タスクは1つずつ後ろへずれる
    expect(s.tasks.find((t) => t.id === "t-a")?.position).toBe(1);
    // 別レーンのタスクのpositionは動かない
    expect(s.tasks.find((t) => t.id === "t-d")?.position).toBe(0);
  });

  it("タグトークンをタイトルから外し、そのタグを付けて作成する", async () => {
    const created: Task = {
      id: "t-new",
      boardId: "board-1",
      statusId: "st-todo",
      title: "牛乳を買う",
      contentMd: "",
      position: 0,
      createdAt: "2026-08-20T01:00:00Z",
      updatedAt: "2026-08-20T01:00:00Z",
      tagIds: [],
    };
    mocked.taskCreate.mockResolvedValue(created);
    mocked.taskTagToggle.mockResolvedValue(["tag-bug"]);
    mocked.tasksList.mockResolvedValueOnce([...tasks, { ...created, tagIds: ["tag-bug"] }]);

    useAppStore.getState().setSearchQuery("#バグ 牛乳を買う");
    await useAppStore.getState().createTaskFromSearch();

    // タイトルにタグトークンが混ざらない
    expect(mocked.taskCreate).toHaveBeenCalledWith("board-1", "st-todo", "牛乳を買う");
    // 作成したタスクにタグが付く
    expect(mocked.taskTagToggle).toHaveBeenCalledWith("t-new", "tag-bug");
    expect(useAppStore.getState().view).toBe("detail");
  });

  it("完全一致しないタグトークンはタイトルに残したまま作成する", async () => {
    const created: Task = {
      id: "t-new",
      boardId: "board-1",
      statusId: "st-todo",
      title: "#バ 牛乳を買う",
      contentMd: "",
      position: 0,
      createdAt: "2026-08-20T01:00:00Z",
      updatedAt: "2026-08-20T01:00:00Z",
      tagIds: [],
    };
    mocked.taskCreate.mockResolvedValue(created);
    mocked.tasksList.mockResolvedValueOnce([...tasks, created]);

    useAppStore.getState().setSearchQuery("#バ 牛乳を買う");
    await useAppStore.getState().createTaskFromSearch();

    expect(mocked.taskCreate).toHaveBeenCalledWith("board-1", "st-todo", "#バ 牛乳を買う");
    expect(mocked.taskTagToggle).not.toHaveBeenCalled();
  });

  it("タグだけを打った状態では作成しない", async () => {
    useAppStore.getState().setSearchQuery("#バグ");
    await useAppStore.getState().createTaskFromSearch();

    expect(mocked.taskCreate).not.toHaveBeenCalled();
    expect(useAppStore.getState().view).toBe("board");
  });

  it("タグ付けに失敗したらトーストを出す（作成済みのタスクは取り消さない）", async () => {
    const created: Task = {
      id: "t-new",
      boardId: "board-1",
      statusId: "st-todo",
      title: "牛乳を買う",
      contentMd: "",
      position: 0,
      createdAt: "2026-08-20T01:00:00Z",
      updatedAt: "2026-08-20T01:00:00Z",
      tagIds: [],
    };
    mocked.taskCreate.mockResolvedValue(created);
    mocked.taskTagToggle.mockRejectedValue(new Error("DB error"));

    useAppStore.getState().setSearchQuery("#バグ 牛乳を買う");
    await useAppStore.getState().createTaskFromSearch();

    expect(toast.error).toHaveBeenCalled();
    expect(useAppStore.getState().view).toBe("board");
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
      tagIds: [],
    };
    let switchPromise: Promise<boolean> = Promise.resolve(true);
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

  it("応答保留中に再度呼んでも、taskCreateは1回しか呼ばれない", async () => {
    const created: Task = {
      id: "t-new",
      boardId: "board-1",
      statusId: "st-todo",
      title: "新しいタスク",
      contentMd: "",
      position: 0,
      createdAt: "2026-08-20T01:00:00Z",
      updatedAt: "2026-08-20T01:00:00Z",
      tagIds: [],
    };
    let resolveCreate: (value: Task) => void = () => {};
    mocked.taskCreate.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveCreate = resolve;
      }),
    );

    useAppStore.getState().setSearchQuery("新しいタスク");
    const first = useAppStore.getState().createTaskFromSearch();
    const second = useAppStore.getState().createTaskFromSearch();

    expect(mocked.taskCreate).toHaveBeenCalledTimes(1);

    resolveCreate(created);
    await first;
    await second;

    expect(mocked.taskCreate).toHaveBeenCalledTimes(1);
  });

  it("createNewTaskと二重実行防止フラグを共有する(⌘Enter直後の⌘N連打でも2重作成しない)", async () => {
    const created: Task = {
      id: "t-new",
      boardId: "board-1",
      statusId: "st-todo",
      title: "新しいタスク",
      contentMd: "",
      position: 0,
      createdAt: "2026-08-20T01:00:00Z",
      updatedAt: "2026-08-20T01:00:00Z",
      tagIds: [],
    };
    let resolveCreate: (value: Task) => void = () => {};
    mocked.taskCreate.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveCreate = resolve;
      }),
    );

    useAppStore.getState().setSearchQuery("新しいタスク");
    const first = useAppStore.getState().createTaskFromSearch();
    const second = useAppStore.getState().createNewTask();

    expect(mocked.taskCreate).toHaveBeenCalledTimes(1);

    resolveCreate(created);
    await first;
    await second;

    expect(mocked.taskCreate).toHaveBeenCalledTimes(1);
  });
});

describe("appStore: createNewTask", () => {
  beforeEach(async () => {
    await loadFixtureBoard();
  });

  it("先頭ステータスへ既定タイトルで作成し、詳細画面へ遷移する", async () => {
    const created: Task = {
      id: "t-new",
      boardId: "board-1",
      statusId: "st-todo",
      title: NEW_TASK_TITLE,
      contentMd: "",
      position: 0,
      createdAt: "2026-08-20T01:00:00Z",
      updatedAt: "2026-08-20T01:00:00Z",
      tagIds: [],
    };
    mocked.taskCreate.mockResolvedValue(created);
    // 作成成功後の反映はtasksListでの正引きなので、Rust側が再採番した後の実状態を用意する
    const freshFromDb: Task[] = [
      { ...tasks[0], position: 1 },
      { ...tasks[1], position: 2 },
      { ...tasks[2], position: 3 },
      tasks[3],
      tasks[4],
      tasks[5],
      created,
    ];
    mocked.tasksList.mockResolvedValueOnce(freshFromDb);

    await useAppStore.getState().createNewTask();

    expect(mocked.taskCreate).toHaveBeenCalledWith("board-1", "st-todo", NEW_TASK_TITLE);
    expect(mocked.tasksList).toHaveBeenLastCalledWith("board-1");
    const s = useAppStore.getState();
    // 反映結果はtasksListが返した実状態そのもの(手動position計算はしない)
    expect(s.tasks).toEqual(freshFromDb);
    expect(s.selectedTaskId).toBe("t-new");
    expect(s.view).toBe("detail");
    // TaskDetail側が「新規作成直後」を判定するための目印
    expect(s.pendingNewTaskId).toBe("t-new");
    // 先頭挿入なので同レーンの既存タスクは1つずつ後ろへずれる
    expect(s.tasks.find((t) => t.id === "t-a")?.position).toBe(1);
    // 別レーンのタスクのpositionは動かない
    expect(s.tasks.find((t) => t.id === "t-d")?.position).toBe(0);
  });

  it("応答保留中に⌘N連打しても、taskCreateは1回しか呼ばれない(後着応答が先着タスクを画面から消さない)", async () => {
    const created: Task = {
      id: "t-new",
      boardId: "board-1",
      statusId: "st-todo",
      title: NEW_TASK_TITLE,
      contentMd: "",
      position: 0,
      createdAt: "2026-08-20T01:00:00Z",
      updatedAt: "2026-08-20T01:00:00Z",
      tagIds: [],
    };
    let resolveCreate: (value: Task) => void = () => {};
    mocked.taskCreate.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveCreate = resolve;
      }),
    );

    const first = useAppStore.getState().createNewTask();
    // 1回目が応答待ちの間に2回目(⌘N連打)を呼ぶ
    const second = useAppStore.getState().createNewTask();

    expect(mocked.taskCreate).toHaveBeenCalledTimes(1);

    // 作成成功後の反映はtasksListでの正引きになるので、フラグ解放の検証に必要な分だけ用意する
    mocked.tasksList.mockResolvedValueOnce([...tasks, created]);
    resolveCreate(created);
    await first;
    await second;

    expect(mocked.taskCreate).toHaveBeenCalledTimes(1);
    expect(useAppStore.getState().tasks).toHaveLength(7);
  });

  it("作成応答待ち中に同レーンの別タスクが削除されても、反映後のtasksはtasksListが返す実状態と一致する", async () => {
    mocked.taskDelete.mockResolvedValue(tasks[0]);
    const created: Task = {
      id: "t-new",
      boardId: "board-1",
      statusId: "st-todo",
      title: NEW_TASK_TITLE,
      contentMd: "",
      position: 0,
      createdAt: "2026-08-20T01:00:00Z",
      updatedAt: "2026-08-20T01:00:00Z",
      tagIds: [],
    };
    let resolveCreate: (value: Task) => void = () => {};
    mocked.taskCreate.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveCreate = resolve;
      }),
    );

    const createPromise = useAppStore.getState().createNewTask();

    // 作成の応答待ち中に、同レーン(st-todo)の別タスク(t-a)が削除される
    useAppStore.getState().setSelectedTask("t-a");
    await useAppStore.getState().deleteSelectedTask();
    expect(useAppStore.getState().tasks.some((t) => t.id === "t-a")).toBe(false);

    // Rust側は削除後の実際の並びを踏まえてpositionを再採番するので、手元の
    // 「残存タスクのposition+1」という楽観計算とはズレたfreshFromDbを用意する。
    // 反映結果はこのtasksListの応答そのものと一致するべき(手動position計算はしない)
    const freshFromDb: Task[] = [
      created,
      { ...tasks[1], position: 1 },
      { ...tasks[2], position: 2 },
      tasks[3],
      tasks[4],
      tasks[5],
    ];
    mocked.tasksList.mockResolvedValueOnce(freshFromDb);

    resolveCreate(created);
    await createPromise;

    const s = useAppStore.getState();
    expect(mocked.tasksList).toHaveBeenLastCalledWith("board-1");
    expect(s.tasks).toEqual(freshFromDb);
    expect(s.selectedTaskId).toBe("t-new");
    expect(s.pendingNewTaskId).toBe("t-new");
    expect(s.view).toBe("detail");
  });

  it("作成完了後は再度呼び出せる(フラグが解放される)", async () => {
    mocked.taskCreate.mockResolvedValue({
      id: "t-new",
      boardId: "board-1",
      statusId: "st-todo",
      title: NEW_TASK_TITLE,
      contentMd: "",
      position: 0,
      createdAt: "2026-08-20T01:00:00Z",
      updatedAt: "2026-08-20T01:00:00Z",
      tagIds: [],
    });

    await useAppStore.getState().createNewTask();
    await useAppStore.getState().createNewTask();

    expect(mocked.taskCreate).toHaveBeenCalledTimes(2);
  });

  it("失敗したらトーストを出し、タスクを増やさない", async () => {
    mocked.taskCreate.mockRejectedValue("DB error");
    await useAppStore.getState().createNewTask();
    expect(useAppStore.getState().tasks).toHaveLength(6);
    expect(useAppStore.getState().view).toBe("board");
    expect(toast.error).toHaveBeenCalled();
  });

  it("boardLoading中はAPIを呼ばず何もしない", async () => {
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

    await useAppStore.getState().createNewTask();

    expect(mocked.taskCreate).not.toHaveBeenCalled();

    resolveStatuses([]);
    resolveTasks([]);
    await selectPromise;
  });

  it("応答が届く前に別ボードへの切替要求が先行していたら、作成結果を反映しない", async () => {
    const created: Task = {
      id: "t-new",
      boardId: "board-1",
      statusId: "st-todo",
      title: NEW_TASK_TITLE,
      contentMd: "",
      position: 0,
      createdAt: "2026-08-20T01:00:00Z",
      updatedAt: "2026-08-20T01:00:00Z",
      tagIds: [],
    };
    let switchPromise: Promise<boolean> = Promise.resolve(true);
    mocked.taskCreate.mockImplementation(async () => {
      switchPromise = useAppStore.getState().selectBoard("board-2");
      return created;
    });

    await useAppStore.getState().createNewTask();

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
    let switchPromise: Promise<boolean> = Promise.resolve(true);
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
    let switchPromise: Promise<boolean> = Promise.resolve(true);
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

describe("appStore: タグ系ミューテーション", () => {
  it("toggleTaskTag は付いていないタグを付ける", async () => {
    useAppStore.setState({
      currentBoardId: "board-1",
      tasks,
      tags,
      selectedTaskId: "t-b",
    });
    mocked.taskTagToggle.mockResolvedValue(["tag-bug"]);

    await useAppStore.getState().toggleTaskTag("tag-bug");

    const task = useAppStore.getState().tasks.find((t) => t.id === "t-b");
    expect(task?.tagIds).toEqual(["tag-bug"]);
    expect(mocked.taskTagToggle).toHaveBeenCalledWith("t-b", "tag-bug");
  });

  it("toggleTaskTag は付いているタグを外す", async () => {
    useAppStore.setState({
      currentBoardId: "board-1",
      tasks,
      tags,
      selectedTaskId: "t-a",
    });
    mocked.taskTagToggle.mockResolvedValue([]);

    await useAppStore.getState().toggleTaskTag("tag-bug");

    const task = useAppStore.getState().tasks.find((t) => t.id === "t-a");
    expect(task?.tagIds).toEqual([]);
  });

  it("toggleTaskTag は失敗したらDBの実状態へ戻す", async () => {
    useAppStore.setState({
      currentBoardId: "board-1",
      tasks,
      tags,
      selectedTaskId: "t-b",
    });
    mocked.taskTagToggle.mockRejectedValue(new Error("失敗"));
    mocked.tasksList.mockResolvedValue(tasks);

    await useAppStore.getState().toggleTaskTag("tag-bug");

    const task = useAppStore.getState().tasks.find((t) => t.id === "t-b");
    expect(task?.tagIds).toEqual([]);
  });

  it("createTagAndAttach は作ってから選択中タスクへ付ける", async () => {
    const created: Tag = {
      id: "tag-new",
      boardId: "board-1",
      name: "新規",
      color: "#E88A85",
      position: 3,
    };
    useAppStore.setState({
      currentBoardId: "board-1",
      tasks,
      tags,
      selectedTaskId: "t-b",
    });
    mocked.tagCreate.mockResolvedValue(created);
    mocked.taskTagToggle.mockResolvedValue(["tag-new"]);

    await useAppStore.getState().createTagAndAttach("  新規  ");

    expect(mocked.tagCreate).toHaveBeenCalledWith("board-1", "新規");
    expect(useAppStore.getState().tags).toContainEqual(created);
    const task = useAppStore.getState().tasks.find((t) => t.id === "t-b");
    expect(task?.tagIds).toEqual(["tag-new"]);
  });

  it("renameTag は一覧の該当タグを差し替える", async () => {
    const renamed: Tag = {
      id: "tag-bug",
      boardId: "board-1",
      name: "不具合",
      color: "#7EA9E8",
      position: 0,
    };
    useAppStore.setState({ currentBoardId: "board-1", tags });
    mocked.tagRename.mockResolvedValue(renamed);

    await useAppStore.getState().renameTag("tag-bug", "不具合");

    expect(useAppStore.getState().tags[0]).toEqual(renamed);
  });

  it("deleteTag はタグ一覧からも全タスクからも外す", async () => {
    useAppStore.setState({
      currentBoardId: "board-1",
      tasks,
      tags,
    });
    mocked.tagDelete.mockResolvedValue(undefined);

    await useAppStore.getState().deleteTag("tag-bug");

    const s = useAppStore.getState();
    expect(s.tags.map((t) => t.id)).toEqual(["tag-urgent", "tag-design"]);
    expect(s.tasks.every((t) => !t.tagIds.includes("tag-bug"))).toBe(true);
  });

  it("ボード切替の読込中はタグの付け外しを受け付けない", async () => {
    // resolve関数を握っておき、アサーション後に明示的に解決させる。boardLoadingを
    // trueのまま放置すると後続テストに影響するため(このファイルの既存の流儀に合わせる)。
    let resolveStatuses: (value: Status[]) => void = () => {};
    let resolveTasks: (value: Task[]) => void = () => {};
    let resolveTags: (value: Tag[]) => void = () => {};
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
    mocked.tagsList.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveTags = resolve;
      }),
    );
    useAppStore.setState({ tasks, tags, selectedTaskId: "t-b" });
    const selectPromise = useAppStore.getState().selectBoard("board-2");

    await useAppStore.getState().toggleTaskTag("tag-bug");

    expect(mocked.taskTagToggle).not.toHaveBeenCalled();

    resolveStatuses([]);
    resolveTasks([]);
    resolveTags([]);
    await selectPromise;
  });

  it("応答保留中に連打しても、tagCreateは1回しか呼ばれない(tagSubmittingを共有する二重実行防止)", async () => {
    const created: Tag = {
      id: "tag-new",
      boardId: "board-1",
      name: "新規",
      color: "#E88A85",
      position: 3,
    };
    let resolveCreate: (value: Tag) => void = () => {};
    mocked.tagCreate.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveCreate = resolve;
      }),
    );
    useAppStore.setState({ currentBoardId: "board-1", tasks, tags, selectedTaskId: null });

    const first = useAppStore.getState().createTagAndAttach("新規");
    const second = useAppStore.getState().createTagAndAttach("新規");

    expect(mocked.tagCreate).toHaveBeenCalledTimes(1);

    resolveCreate(created);
    await first;
    await second;

    expect(mocked.tagCreate).toHaveBeenCalledTimes(1);
  });

  it("失敗してもtagSubmittingはfinallyで解放され、次の呼び出しは通る", async () => {
    const renamed: Tag = {
      id: "tag-bug",
      boardId: "board-1",
      name: "不具合",
      color: "#7EA9E8",
      position: 0,
    };
    mocked.tagRename.mockRejectedValueOnce(new Error("失敗"));
    mocked.tagRename.mockResolvedValueOnce(renamed);
    useAppStore.setState({ currentBoardId: "board-1", tags });

    await useAppStore.getState().renameTag("tag-bug", "不具合");
    expect(toast.error).toHaveBeenCalled();

    await useAppStore.getState().renameTag("tag-bug", "不具合");

    expect(mocked.tagRename).toHaveBeenCalledTimes(2);
    expect(useAppStore.getState().tags[0]).toEqual(renamed);
  });

  // m-1: renameTag/deleteTagはtoggleTaskTagと違って楽観的更新を持たないため、
  // 応答待ち中にEscでパレットを閉じると、closeTagPaletteは改名/削除前の古いtags/tasksで
  // 判定してしまう。応答が返った後に改めて判定し直すことを確認する。
  it("renameTagの応答待ち中にパレットを閉じても、応答後に絞り込みから外れた選択を解除する(m-1)", async () => {
    const renamed: Tag = {
      id: "tag-bug",
      boardId: "board-1",
      name: "不具合",
      color: "#7EA9E8",
      position: 0,
    };
    let resolveRename: (value: Tag) => void = () => {};
    mocked.tagRename.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveRename = resolve;
      }),
    );
    useAppStore.setState({
      currentBoardId: "board-1",
      tasks,
      tags,
      searchQuery: "#バグ",
      selectedTaskId: "t-a", // t-aはバグを持つので、改名前はまだ絞り込みに見えている
      tagPaletteOpen: true,
    });

    const renamePromise = useAppStore.getState().renameTag("tag-bug", "不具合");
    // 応答待ち中にEscで閉じる。まだtagsは古い(バグのまま)ので、この時点の判定では選択は残る
    useAppStore.getState().closeTagPalette();
    expect(useAppStore.getState().selectedTaskId).toBe("t-a");

    resolveRename(renamed);
    await renamePromise;

    // 改名後は「#バグ」に一致するタグが無くなるので、選択は解除されるべき
    expect(useAppStore.getState().selectedTaskId).toBeNull();
  });

  it("deleteTagの応答待ち中にパレットを閉じても、応答後に絞り込みから外れた選択を解除する(m-1)", async () => {
    let resolveDelete: (value: void) => void = () => {};
    mocked.tagDelete.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveDelete = resolve;
      }),
    );
    useAppStore.setState({
      currentBoardId: "board-1",
      tasks,
      tags,
      searchQuery: "#バグ",
      selectedTaskId: "t-a",
      tagPaletteOpen: true,
    });

    const deletePromise = useAppStore.getState().deleteTag("tag-bug");
    useAppStore.getState().closeTagPalette();
    expect(useAppStore.getState().selectedTaskId).toBe("t-a");

    resolveDelete(undefined);
    await deletePromise;

    expect(useAppStore.getState().selectedTaskId).toBeNull();
  });

  it("m-1の判定はdetail画面では選択もviewも変えない", async () => {
    let resolveDelete: (value: void) => void = () => {};
    mocked.tagDelete.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveDelete = resolve;
      }),
    );
    useAppStore.setState({
      currentBoardId: "board-1",
      tasks,
      tags,
      searchQuery: "#バグ",
      selectedTaskId: "t-a",
      tagPaletteOpen: true,
      view: "detail",
    });

    const deletePromise = useAppStore.getState().deleteTag("tag-bug");
    useAppStore.getState().closeTagPalette();
    resolveDelete(undefined);
    await deletePromise;

    expect(useAppStore.getState().selectedTaskId).toBe("t-a");
    expect(useAppStore.getState().view).toBe("detail");

    // このdescribe内の以降のテストに影響しないようboardへ戻しておく
    // (このファイルはテスト間でstoreを明示リセットしない流儀のため)
    useAppStore.setState({ view: "board" });
  });
});
