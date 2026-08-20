import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Board } from "../types";
import { useAppStore } from "../store/appStore";
import { BoardSwitcher } from "./BoardSwitcher";

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

const selectBoard = vi.fn(async () => undefined);
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
