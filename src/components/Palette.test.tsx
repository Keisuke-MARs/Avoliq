import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Palette } from "./Palette";
import * as api from "@/lib/api";
import { board, board2, statuses, tasks } from "@/test/fixtures";
import { useAppStore } from "@/store/appStore";
import type { Task } from "@/types";

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
  settingGet: vi.fn(),
}));
vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
  Toaster: () => null,
}));
// useFlushOnHideがgetCurrentWindowを呼ぶため、jsdom環境で落ちないようスタブする。
vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({
    onFocusChanged: () => Promise.resolve(() => undefined),
  }),
}));
// useHotkeyErrorToastがlistenを呼ぶため、jsdom環境で落ちないようスタブする。
vi.mock("@tauri-apps/api/event", () => ({
  listen: () => Promise.resolve(() => undefined),
}));

const mocked = vi.mocked(api);

/** パレットを描画し、ボードの読み込み完了まで待つ */
async function renderPalette() {
  const user = userEvent.setup();
  render(<Palette />);
  await waitFor(() => {
    expect(screen.getAllByTestId("task-card").length).toBe(6);
  });
  return user;
}

/** data-selected="true" のカードのタスクIDを返す。1枚も無ければ null */
function selectedCardId(): string | null {
  const selected = screen
    .queryAllByTestId("task-card")
    .find((c) => c.getAttribute("data-selected") === "true");
  return selected?.getAttribute("data-task-id") ?? null;
}

beforeEach(() => {
  mocked.boardsList.mockResolvedValue([board, board2]);
  mocked.statusesList.mockResolvedValue(statuses);
  mocked.tasksList.mockResolvedValue(tasks);
  mocked.hidePalette.mockResolvedValue(undefined);
  mocked.settingGet.mockResolvedValue(null);
});

describe("Palette: キーボードの基本動作", () => {
  it("↓で検索バーから一番左のレーンの先頭カードへ移る", async () => {
    const user = await renderPalette();
    await user.keyboard("{ArrowDown}");
    expect(selectedCardId()).toBe("t-a");
  });
});

describe("Palette: 初期表示", () => {
  it("起動時にボードを読み込んで4レーンを描画する", async () => {
    await renderPalette();
    expect(screen.getAllByTestId("lane")).toHaveLength(4);
  });

  it("検索バーに最初からフォーカスがある", async () => {
    await renderPalette();
    expect(document.activeElement?.id).toBe("avoliq-search");
  });

  it("フッターにキーボードヒントを常時表示する", async () => {
    await renderPalette();
    const footer = screen.getByTestId("keyboard-hints");
    expect(footer).toHaveTextContent("移動");
    expect(footer).toHaveTextContent("開く / 作成");
    expect(footer).toHaveTextContent("ステータス");
    expect(footer).toHaveTextContent("並び替え");
    expect(footer).toHaveTextContent("削除");
    expect(footer).toHaveTextContent("元に戻す");
    expect(footer).toHaveTextContent("閉じる");
  });
});

describe("Palette: カーソル移動", () => {
  it("カードを選ぶと検索バーからフォーカスが外れる", async () => {
    const user = await renderPalette();
    await user.keyboard("{ArrowDown}");
    expect(document.activeElement?.id).not.toBe("avoliq-search");
  });

  it("↓↓で同レーンを下へ進む", async () => {
    const user = await renderPalette();
    await user.keyboard("{ArrowDown}{ArrowDown}{ArrowDown}");
    expect(selectedCardId()).toBe("t-c");
  });

  it("最終行で↓を押しても動かない", async () => {
    const user = await renderPalette();
    await user.keyboard("{ArrowDown}{ArrowDown}{ArrowDown}{ArrowDown}");
    expect(selectedCardId()).toBe("t-c");
  });

  it("先頭行で↑を押すと検索バーへ戻る", async () => {
    const user = await renderPalette();
    await user.keyboard("{ArrowDown}{ArrowUp}");
    expect(selectedCardId()).toBeNull();
    expect(document.activeElement?.id).toBe("avoliq-search");
  });

  it("→で右隣のレーンへ移り、行番号を維持する", async () => {
    const user = await renderPalette();
    await user.keyboard("{ArrowDown}{ArrowDown}{ArrowRight}");
    expect(selectedCardId()).toBe("t-e");
  });

  it("→は空のレーンを飛ばす", async () => {
    const user = await renderPalette();
    // 未着手先頭 → 進行中先頭 → 確認中は空なので飛ばして完了先頭
    await user.keyboard("{ArrowDown}{ArrowRight}{ArrowRight}");
    expect(selectedCardId()).toBe("t-f");
  });

  it("←で左のレーンへ戻る", async () => {
    const user = await renderPalette();
    await user.keyboard("{ArrowDown}{ArrowRight}{ArrowLeft}");
    expect(selectedCardId()).toBe("t-a");
  });

  it("右端で→を押しても動かない", async () => {
    const user = await renderPalette();
    await user.keyboard("{ArrowDown}{ArrowRight}{ArrowRight}{ArrowRight}");
    expect(selectedCardId()).toBe("t-f");
  });

  it("検索バーにいるときの←→は選択を動かさない", async () => {
    const user = await renderPalette();
    await user.keyboard("{ArrowRight}{ArrowLeft}");
    expect(selectedCardId()).toBeNull();
  });
});

describe("Palette: 検索と新規作成", () => {
  it("カード選択中に文字を打つと検索バーへ入り、絞り込みが始まる", async () => {
    const user = await renderPalette();
    await user.keyboard("{ArrowDown}");
    expect(selectedCardId()).toBe("t-a");

    await user.keyboard("r");

    expect(document.activeElement?.id).toBe("avoliq-search");
    expect(useAppStore.getState().searchQuery).toBe("r");
    expect(selectedCardId()).toBeNull();
  });

  it("検索バーへの入力でカードがリアルタイムに絞り込まれる", async () => {
    await renderPalette();
    // 日本語は user-event の keyboard では打てないため change イベントで入力する
    fireEvent.change(screen.getByTestId("search-input"), { target: { value: "牛" } });
    await waitFor(() => {
      expect(screen.getAllByTestId("task-card")).toHaveLength(2);
    });
    expect(screen.getAllByTestId("task-card").map((c) => c.textContent)).toEqual([
      "牛乳を買う",
      "牛丼を食べる",
    ]);
  });

  it("絞り込みで選択中のカードが消えたら選択が外れる", async () => {
    const user = await renderPalette();
    await user.keyboard("{ArrowDown}{ArrowDown}");
    expect(selectedCardId()).toBe("t-b");

    fireEvent.change(screen.getByTestId("search-input"), { target: { value: "牛" } });
    await waitFor(() => {
      expect(selectedCardId()).toBeNull();
    });
  });

  it("入力あり・カード未選択でEnterを押すと新規タスクを作って詳細へ行く", async () => {
    const created: Task = {
      id: "t-new",
      boardId: "board-1",
      statusId: "st-todo",
      title: "牛乳を買い足す",
      contentMd: "",
      position: 0,
      createdAt: "2026-08-20T02:00:00Z",
      updatedAt: "2026-08-20T02:00:00Z",
    };
    mocked.taskCreate.mockResolvedValue(created);

    const user = await renderPalette();
    // 作成成功後の反映はtasksListでの正引きになるので、作成タスクを含む実状態を用意する
    // (初回読込のtasksList呼び出しを消費させないよう、renderPalette完了後にキューする)
    mocked.tasksList.mockResolvedValueOnce([...tasks, created]);
    fireEvent.change(screen.getByTestId("search-input"), { target: { value: "牛乳を買い足す" } });
    // IMEの変換確定Enterで誤作成しないよう、作成はEnter2回押し
    await user.keyboard("{Enter}{Enter}");

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "ボードに戻る (Esc)" }),
      ).toBeInTheDocument();
    });
    expect(mocked.taskCreate).toHaveBeenCalledWith("board-1", "st-todo", "牛乳を買い足す");
    expect(useAppStore.getState().selectedTaskId).toBe("t-new");
    expect(useAppStore.getState().searchQuery).toBe("");
  });

  it("入力なしでEnterを押しても何も起きない", async () => {
    const user = await renderPalette();
    await user.keyboard("{Enter}{Enter}");
    expect(mocked.taskCreate).not.toHaveBeenCalled();
    expect(useAppStore.getState().view).toBe("board");
  });

  it("入力ありでもEnter1回では作成しない(IMEの変換確定対策)", async () => {
    const user = await renderPalette();
    fireEvent.change(screen.getByTestId("search-input"), { target: { value: "牛乳を買い足す" } });
    await user.keyboard("{Enter}");

    expect(mocked.taskCreate).not.toHaveBeenCalled();
    expect(useAppStore.getState().view).toBe("board");
  });

  it("カード選択中のEnterは2回押しで詳細を開く", async () => {
    const user = await renderPalette();
    await user.keyboard("{ArrowDown}{Enter}{Enter}");
    expect(
      screen.getByRole("button", { name: "ボードに戻る (Esc)" }),
    ).toBeInTheDocument();
    expect(mocked.taskCreate).not.toHaveBeenCalled();
  });

  it("⌘Pで検索バーが空になりフォーカスが戻る", async () => {
    const user = await renderPalette();
    fireEvent.change(screen.getByTestId("search-input"), { target: { value: "牛" } });
    await user.keyboard("{ArrowDown}");
    await user.keyboard("{Meta>}p{/Meta}");

    expect(useAppStore.getState().searchQuery).toBe("");
    expect(selectedCardId()).toBeNull();
    expect(document.activeElement?.id).toBe("avoliq-search");
  });

  it("⌘Nでボード先頭ステータスへ新しいタスクを作成し、詳細画面へ遷移する", async () => {
    const created: Task = {
      id: "t-new",
      boardId: "board-1",
      statusId: "st-todo",
      title: "新しいタスク",
      contentMd: "",
      position: 0,
      createdAt: "2026-08-20T02:00:00Z",
      updatedAt: "2026-08-20T02:00:00Z",
    };
    mocked.taskCreate.mockResolvedValue(created);

    const user = await renderPalette();
    // 作成成功後の反映はtasksListでの正引きになるので、作成タスクを含む実状態を用意する
    // (初回読込のtasksList呼び出しを消費させないよう、renderPalette完了後にキューする)
    mocked.tasksList.mockResolvedValueOnce([...tasks, created]);
    await user.keyboard("{Meta>}n{/Meta}");

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "ボードに戻る (Esc)" }),
      ).toBeInTheDocument();
    });
    expect(mocked.taskCreate).toHaveBeenCalledWith("board-1", "st-todo", "新しいタスク");
    expect(useAppStore.getState().selectedTaskId).toBe("t-new");
    expect(useAppStore.getState().view).toBe("detail");
  });
});

describe("Palette: 詳細画面での⌘N・⌘P", () => {
  it("詳細画面で⌘Nを押すと新しいタスクを作成し、その詳細に差し替わる", async () => {
    const created: Task = {
      id: "t-new2",
      boardId: "board-1",
      statusId: "st-todo",
      title: "新しいタスク",
      contentMd: "",
      position: 0,
      createdAt: "2026-08-20T02:00:00Z",
      updatedAt: "2026-08-20T02:00:00Z",
    };
    mocked.taskCreate.mockResolvedValue(created);

    const user = await renderPalette();
    await user.keyboard("{ArrowDown}{Enter}{Enter}");
    expect(screen.getByDisplayValue("牛乳を買う")).toBeInTheDocument();

    await user.keyboard("{Meta>}n{/Meta}");

    await waitFor(() => {
      expect(mocked.taskCreate).toHaveBeenCalledWith("board-1", "st-todo", "新しいタスク");
    });
    await waitFor(() => {
      expect(useAppStore.getState().selectedTaskId).toBe("t-new2");
    });
  });

  it("詳細画面で⌘Pを押すとボードへ戻り検索バーへフォーカスする", async () => {
    const user = await renderPalette();
    await user.keyboard("{ArrowDown}{Enter}{Enter}");
    expect(
      screen.getByRole("button", { name: "ボードに戻る (Esc)" }),
    ).toBeInTheDocument();

    await user.keyboard("{Meta>}p{/Meta}");

    await waitFor(() => {
      expect(screen.getByTestId("board")).toBeInTheDocument();
    });
    await waitFor(() => {
      expect(document.activeElement?.id).toBe("avoliq-search");
    });
  });
});

describe("Palette: ステータス移動と並び替え", () => {
  it("⌘→で選択カードを隣のステータスへ移す", async () => {
    mocked.taskMove.mockResolvedValue(tasks[0]);
    const user = await renderPalette();
    await user.keyboard("{ArrowDown}");
    await user.keyboard("{Meta>}{ArrowRight}{/Meta}");

    await waitFor(() => {
      expect(mocked.taskMove).toHaveBeenCalledWith("t-a", "st-doing", 0);
    });
    // 進行中レーンの先頭に来ている
    const doingCards = screen
      .getAllByTestId("lane")[1]
      .querySelectorAll("[data-testid='task-card']");
    expect(doingCards[0].getAttribute("data-task-id")).toBe("t-a");
    expect(selectedCardId()).toBe("t-a");
  });

  it("⌘←で1つ前のステータスへ戻す", async () => {
    mocked.taskMove.mockResolvedValue(tasks[3]);
    const user = await renderPalette();
    await user.keyboard("{ArrowDown}{ArrowRight}");
    await user.keyboard("{Meta>}{ArrowLeft}{/Meta}");

    await waitFor(() => {
      expect(mocked.taskMove).toHaveBeenCalledWith("t-d", "st-todo", 0);
    });
  });

  it("左端のレーンで⌘←を押しても何も起きない", async () => {
    const user = await renderPalette();
    await user.keyboard("{ArrowDown}");
    await user.keyboard("{Meta>}{ArrowLeft}{/Meta}");
    expect(mocked.taskMove).not.toHaveBeenCalled();
  });

  it("⌘↑で同レーンの1つ上と入れ替える", async () => {
    mocked.taskMove.mockResolvedValue(tasks[1]);
    const user = await renderPalette();
    await user.keyboard("{ArrowDown}{ArrowDown}");
    await user.keyboard("{Meta>}{ArrowUp}{/Meta}");

    await waitFor(() => {
      expect(mocked.taskMove).toHaveBeenCalledWith("t-b", "st-todo", 0);
    });
    const todoCards = screen
      .getAllByTestId("lane")[0]
      .querySelectorAll("[data-testid='task-card']");
    expect([...todoCards].map((c) => c.getAttribute("data-task-id"))).toEqual([
      "t-b",
      "t-a",
      "t-c",
    ]);
  });

  it("⌘↓で同レーンの1つ下と入れ替える", async () => {
    mocked.taskMove.mockResolvedValue(tasks[0]);
    const user = await renderPalette();
    await user.keyboard("{ArrowDown}");
    await user.keyboard("{Meta>}{ArrowDown}{/Meta}");

    await waitFor(() => {
      expect(mocked.taskMove).toHaveBeenCalledWith("t-a", "st-todo", 1);
    });
  });

  it("先頭カードで⌘↑を押しても何も起きない", async () => {
    const user = await renderPalette();
    await user.keyboard("{ArrowDown}");
    await user.keyboard("{Meta>}{ArrowUp}{/Meta}");
    expect(mocked.taskMove).not.toHaveBeenCalled();
  });
});

describe("Palette: 削除とundo", () => {
  it("⌘⌫でカードが消え、1つ下のカードが選択される", async () => {
    mocked.taskDelete.mockResolvedValue(tasks[0]);
    const user = await renderPalette();
    await user.keyboard("{ArrowDown}");
    await user.keyboard("{Meta>}{Backspace}{/Meta}");

    await waitFor(() => {
      expect(screen.getAllByTestId("task-card")).toHaveLength(5);
    });
    expect(mocked.taskDelete).toHaveBeenCalledWith("t-a");
    expect(selectedCardId()).toBe("t-b");
  });

  it("⌘⌫のあと⌘Zでカードが戻り、再び選択される", async () => {
    mocked.taskDelete.mockResolvedValue(tasks[0]);
    mocked.taskRestore.mockResolvedValue(tasks[0]);
    const user = await renderPalette();
    await user.keyboard("{ArrowDown}");
    await user.keyboard("{Meta>}{Backspace}{/Meta}");
    await waitFor(() => {
      expect(screen.getAllByTestId("task-card")).toHaveLength(5);
    });

    await user.keyboard("{Meta>}z{/Meta}");
    await waitFor(() => {
      expect(screen.getAllByTestId("task-card")).toHaveLength(6);
    });
    expect(mocked.taskRestore).toHaveBeenCalledWith("t-a");
    expect(selectedCardId()).toBe("t-a");
  });

  it("削除していない状態で⌘Zを押しても何も起きない", async () => {
    const user = await renderPalette();
    await user.keyboard("{Meta>}z{/Meta}");
    expect(mocked.taskRestore).not.toHaveBeenCalled();
  });

  it("未選択で⌘⌫を押しても何も起きない", async () => {
    const user = await renderPalette();
    await user.keyboard("{Meta>}{Backspace}{/Meta}");
    expect(mocked.taskDelete).not.toHaveBeenCalled();
  });
});

describe("Palette: Escとビュー切替", () => {
  it("盤面でEscを押すとクリアしてパレットを隠す", async () => {
    const user = await renderPalette();
    fireEvent.change(screen.getByTestId("search-input"), { target: { value: "牛" } });
    await user.keyboard("{Escape}");

    await waitFor(() => {
      expect(mocked.hidePalette).toHaveBeenCalledTimes(1);
    });
    expect(useAppStore.getState().searchQuery).toBe("");
    expect(useAppStore.getState().selectedTaskId).toBeNull();
  });

  it("詳細ビューでEscを押すと盤面へ戻り、パレットは閉じない", async () => {
    const user = await renderPalette();
    await user.keyboard("{ArrowDown}{Enter}{Enter}");
    expect(
      screen.getByRole("button", { name: "ボードに戻る (Esc)" }),
    ).toBeInTheDocument();

    await user.keyboard("{Escape}");
    expect(screen.getByTestId("board")).toBeInTheDocument();
    expect(mocked.hidePalette).not.toHaveBeenCalled();
  });

  it("⌘Bでスイッチャービューへ移り、Escで戻る", async () => {
    const user = await renderPalette();
    await user.keyboard("{Meta>}b{/Meta}");
    expect(screen.getByRole("listbox", { name: "ボード一覧" })).toBeInTheDocument();

    await user.keyboard("{Escape}");
    expect(screen.getByTestId("board")).toBeInTheDocument();
    // BoardSwitcher自身がEscを処理して盤面へ戻すため、useKeyboard側の汎用フォールバックで
    // 二重に処理（hidePalette等）が走っていないことも確認する
    expect(mocked.hidePalette).not.toHaveBeenCalled();
  });

  it("⌘,で設定ビューへ移り、Escで戻る", async () => {
    const user = await renderPalette();
    await user.keyboard("{Meta>},{/Meta}");
    expect(screen.getByRole("tablist", { name: "設定タブ" })).toBeInTheDocument();

    await user.keyboard("{Escape}");
    expect(screen.getByTestId("board")).toBeInTheDocument();
  });

  it("⌘2で2枚目のボードへ切り替える", async () => {
    const user = await renderPalette();
    mocked.statusesList.mockResolvedValue([]);
    mocked.tasksList.mockResolvedValue([]);

    await user.keyboard("{Meta>}2{/Meta}");
    await waitFor(() => {
      expect(useAppStore.getState().currentBoardId).toBe("board-2");
    });
    expect(screen.queryAllByTestId("task-card")).toHaveLength(0);
  });

  it("存在しない番号の⌘9を押しても何も起きない", async () => {
    const user = await renderPalette();
    await user.keyboard("{Meta>}9{/Meta}");
    expect(useAppStore.getState().currentBoardId).toBe("board-1");
  });
});
