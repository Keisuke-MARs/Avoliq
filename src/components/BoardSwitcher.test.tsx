import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Board } from "../types";
import { useAppStore } from "../store/appStore";
import { BoardSwitcher } from "./BoardSwitcher";
import * as api from "../lib/api";

vi.mock("../lib/api", () => ({
  boardCreate: vi.fn(),
  boardRename: vi.fn(),
  boardDelete: vi.fn(),
}));

const boards: Board[] = [
  { id: "b1", name: "メイン", position: 0 },
  { id: "b2", name: "仕事", position: 1 },
  { id: "b3", name: "個人", position: 2 },
];

const selectBoard = vi.fn(async () => true);
const setView = vi.fn();

describe("BoardSwitcher 一覧と切替", () => {
  beforeEach(() => {
    selectBoard.mockClear();
    setView.mockClear();
    useAppStore.setState({
      boards,
      currentBoardId: "b1",
      statuses: [],
      tasks: [],
      selectedTaskId: null,
      view: "switcher",
      selectBoard,
      setView,
    });
  });

  it("全ボードと新規ボード項目を表示する", () => {
    render(<BoardSwitcher />);

    expect(screen.getByText("メイン")).toBeInTheDocument();
    expect(screen.getByText("仕事")).toBeInTheDocument();
    expect(screen.getByText("個人")).toBeInTheDocument();
    expect(screen.getByText("新規ボード")).toBeInTheDocument();
  });

  it("初期選択は現在のボードにあわせる", () => {
    useAppStore.setState({ currentBoardId: "b2" });
    render(<BoardSwitcher />);

    expect(screen.getByRole("option", { name: /仕事/ })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  it("↓で選択が下へ移動する", async () => {
    const user = userEvent.setup();
    render(<BoardSwitcher />);

    await user.keyboard("{ArrowDown}");

    expect(screen.getByRole("option", { name: /仕事/ })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  it("Enterで選択中のボードへ切り替えてboardビューへ戻る", async () => {
    const user = userEvent.setup();
    render(<BoardSwitcher />);

    await user.keyboard("{ArrowDown}{Enter}");

    expect(selectBoard).toHaveBeenCalledWith("b2");
    expect(setView).toHaveBeenCalledWith("board");
  });

  it("⌘3で3枚目のボードへ直接切り替わる", async () => {
    const user = userEvent.setup();
    render(<BoardSwitcher />);

    await user.keyboard("{Meta>}3{/Meta}");

    expect(selectBoard).toHaveBeenCalledWith("b3");
    expect(setView).toHaveBeenCalledWith("board");
  });

  it("Escでboardビューへ戻る", async () => {
    const user = userEvent.setup();
    render(<BoardSwitcher />);

    await user.keyboard("{Escape}");

    expect(setView).toHaveBeenCalledWith("board");
    expect(selectBoard).not.toHaveBeenCalled();
  });
});

describe("BoardSwitcher の作成・改名・削除", () => {
  beforeEach(() => {
    vi.mocked(api.boardCreate).mockReset();
    vi.mocked(api.boardRename).mockReset();
    vi.mocked(api.boardDelete).mockReset();
    selectBoard.mockClear();
    setView.mockClear();
    useAppStore.setState({
      boards,
      currentBoardId: "b1",
      statuses: [],
      tasks: [],
      selectedTaskId: null,
      view: "switcher",
      selectBoard,
      setView,
      loadBoards: vi.fn(async () => undefined),
    });
  });

  it("Nキーで名前入力に入り、Enterでボードを作成して切り替える", async () => {
    vi.mocked(api.boardCreate).mockResolvedValue({
      id: "b4",
      name: "新ボード",
      position: 3,
    });
    const user = userEvent.setup();
    render(<BoardSwitcher />);

    await user.keyboard("n");
    const input = screen.getByLabelText("新しいボード名");
    await user.type(input, "新ボード{Enter}");

    expect(api.boardCreate).toHaveBeenCalledWith("新ボード");
    await vi.waitFor(() => expect(selectBoard).toHaveBeenCalledWith("b4"));
  });

  it("作成応答の完了前にEnterを連打してもboardCreateは1回だけ呼ばれる", async () => {
    // 応答を保留したままにして、2回目のEnterが二重実行にならないことを見る
    let release: (() => void) | undefined;
    vi.mocked(api.boardCreate).mockImplementation(
      () =>
        new Promise((resolve) => {
          release = () =>
            resolve({ id: "b4", name: "新ボード", position: 3 });
        }),
    );
    const user = userEvent.setup();
    render(<BoardSwitcher />);

    await user.keyboard("n");
    const input = screen.getByLabelText("新しいボード名");
    await user.type(input, "新ボード{Enter}{Enter}");

    expect(api.boardCreate).toHaveBeenCalledTimes(1);
    release?.();
    await vi.waitFor(() => expect(selectBoard).toHaveBeenCalledWith("b4"));
  });

  it("空の名前ではボードを作成しない", async () => {
    const user = userEvent.setup();
    render(<BoardSwitcher />);

    await user.keyboard("n");
    await user.keyboard("{Enter}");

    expect(api.boardCreate).not.toHaveBeenCalled();
  });

  it("Rキーで改名に入り、Enterで改名する", async () => {
    vi.mocked(api.boardRename).mockResolvedValue({
      id: "b1",
      name: "本業",
      position: 0,
    });
    const user = userEvent.setup();
    render(<BoardSwitcher />);

    await user.keyboard("r");
    const input = screen.getByLabelText("ボード名");
    await user.clear(input);
    await user.type(input, "本業{Enter}");

    expect(api.boardRename).toHaveBeenCalledWith("b1", "本業");
  });

  it("⌘⌫で確認ダイアログを出し、EnterでCASCADE削除する", async () => {
    vi.mocked(api.boardDelete).mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<BoardSwitcher />);

    await user.keyboard("{Meta>}{Backspace}{/Meta}");

    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    expect(
      screen.getByText(
        "このボードのタスクとステータスもすべて削除されます。元に戻せません。",
      ),
    ).toBeInTheDocument();

    await user.keyboard("{Enter}");

    expect(api.boardDelete).toHaveBeenCalledWith("b1");
  });

  it("ボードが1枚のときは削除できない", async () => {
    useAppStore.setState({ boards: [boards[0]], currentBoardId: "b1" });
    const user = userEvent.setup();
    render(<BoardSwitcher />);

    await user.keyboard("{Meta>}{Backspace}{/Meta}");

    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(api.boardDelete).not.toHaveBeenCalled();
  });
});
