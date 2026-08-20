import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Board, Status, Task } from "../types";
import { useAppStore } from "../store/appStore";
import { TaskDetail } from "./TaskDetail";

// BlockNoteはjsdomで動かないためモックする(実挙動はTask 4の手動確認でカバーする)
vi.mock("@blocknote/react", () => ({
  useCreateBlockNote: () => ({
    document: [],
    tryParseMarkdownToBlocks: (md: string) => [
      { id: "b1", type: "paragraph", content: md },
    ],
    blocksToMarkdownLossy: () => "本文",
    replaceBlocks: () => undefined,
  }),
}));

vi.mock("@blocknote/shadcn", () => ({
  BlockNoteView: () => <div data-testid="blocknote-view" />,
}));

const updateTaskTitle = vi.fn(async () => undefined);
const moveSelectedTask = vi.fn(async () => undefined);

const board: Board = { id: "board-1", name: "メイン", position: 0 };

const statuses: Status[] = [
  {
    id: "st-1",
    boardId: "board-1",
    name: "未着手",
    color: "#8E8E93",
    position: 0,
  },
  {
    id: "st-2",
    boardId: "board-1",
    name: "進行中",
    color: "#007AFF",
    position: 1,
  },
];

const task: Task = {
  id: "task-1",
  boardId: "board-1",
  statusId: "st-2",
  title: "設計書を書く",
  contentMd: "# 見出し",
  position: 0,
  createdAt: "2026-08-20 10:00:00",
  updatedAt: "2026-08-20 10:00:00",
};

describe("TaskDetail", () => {
  beforeEach(() => {
    updateTaskTitle.mockClear();
    moveSelectedTask.mockClear();
    useAppStore.setState({
      boards: [board],
      currentBoardId: "board-1",
      statuses,
      tasks: [task],
      selectedTaskId: "task-1",
      view: "detail",
      updateTaskTitle,
      moveSelectedTask,
    });
  });

  it("タイトルとステータス名を表示する", () => {
    render(<TaskDetail />);

    expect(screen.getByDisplayValue("設計書を書く")).toBeInTheDocument();
    expect(screen.getByText("進行中")).toBeInTheDocument();
  });

  it("ボードに戻るヘッダーボタンがEscラベル付きで表示される", () => {
    render(<TaskDetail />);

    expect(
      screen.getByRole("button", { name: "ボードに戻る (Esc)" }),
    ).toBeInTheDocument();
  });

  it("エディタが描画される", () => {
    render(<TaskDetail />);

    expect(screen.getByTestId("blocknote-view")).toBeInTheDocument();
  });

  it("タイトルを編集すると500ms後に保存される", async () => {
    const user = userEvent.setup();
    render(<TaskDetail />);

    const input = screen.getByDisplayValue("設計書を書く");
    await user.clear(input);
    await user.type(input, "実装する");

    await vi.waitFor(
      () => {
        expect(updateTaskTitle).toHaveBeenCalledWith("task-1", "実装する");
      },
      { timeout: 2000 },
    );
  });

  it("ステータスチップの右矢印ボタンでステータスが右へ移動する", async () => {
    const user = userEvent.setup();
    render(<TaskDetail />);

    await user.click(
      screen.getByRole("button", { name: "次のステータスへ (⌘→)" }),
    );

    expect(moveSelectedTask).toHaveBeenCalledWith("right");
  });
});
