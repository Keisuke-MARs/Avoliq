import { beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "@/lib/api";
import { toast } from "sonner";
import { useAppStore } from "./appStore";
import { board, board2, statuses, tasks } from "@/test/fixtures";

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
