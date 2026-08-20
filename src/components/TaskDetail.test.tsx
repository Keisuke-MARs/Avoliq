import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Board, Status, Task } from "../types";
import { NEW_TASK_TITLE, useAppStore } from "../store/appStore";
import { TaskDetail } from "./TaskDetail";

// BlockNoteはjsdomで動かないためモックする(実挙動はTask 4の手動確認でカバーする)
const editorFocus = vi.fn();

vi.mock("@blocknote/react", () => ({
  useCreateBlockNote: () => ({
    document: [],
    tryParseMarkdownToBlocks: (md: string) => [
      { id: "b1", type: "paragraph", content: md },
    ],
    blocksToMarkdownLossy: () => "本文",
    replaceBlocks: () => undefined,
    focus: editorFocus,
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
    editorFocus.mockClear();
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

  describe("開いた瞬間の自動フォーカス", () => {
    it("タイトルが既定名以外(既に中身がある)なら本文エディタへフォーカスする", () => {
      render(<TaskDetail />);
      expect(editorFocus).toHaveBeenCalledTimes(1);
    });

    it("タイトルが既定名(⌘Nで作った直後)ならタイトルへ全選択状態でフォーカスする", () => {
      useAppStore.setState({
        tasks: [{ ...task, title: NEW_TASK_TITLE }],
      });
      render(<TaskDetail />);

      const input = screen.getByDisplayValue(NEW_TASK_TITLE) as HTMLInputElement;
      expect(document.activeElement).toBe(input);
      expect(input.selectionStart).toBe(0);
      expect(input.selectionEnd).toBe(NEW_TASK_TITLE.length);
      expect(editorFocus).not.toHaveBeenCalled();
    });
  });

  describe("タイトル入力でのEnter/Tab", () => {
    it("Enterで本文エディタへフォーカスが移る", async () => {
      const user = userEvent.setup();
      render(<TaskDetail />);
      editorFocus.mockClear();

      const input = screen.getByDisplayValue("設計書を書く");
      input.focus();
      await user.keyboard("{Enter}");

      expect(editorFocus).toHaveBeenCalledTimes(1);
    });

    it("Tabで本文エディタへフォーカスが移る", async () => {
      const user = userEvent.setup();
      render(<TaskDetail />);
      editorFocus.mockClear();

      const input = screen.getByDisplayValue("設計書を書く");
      input.focus();
      await user.keyboard("{Tab}");

      expect(editorFocus).toHaveBeenCalledTimes(1);
    });
  });
});
