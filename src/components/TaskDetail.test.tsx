import { fireEvent, render, screen } from "@testing-library/react";
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
  tagIds: [],
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
    it("pendingNewTaskIdと一致しないなら本文エディタへフォーカスする", () => {
      render(<TaskDetail />);
      expect(editorFocus).toHaveBeenCalledTimes(1);
    });

    it("pendingNewTaskIdがselectedTaskIdと一致する(⌘Nで作った直後)ならタイトルへ全選択状態でフォーカスする", () => {
      useAppStore.setState({
        pendingNewTaskId: "task-1",
      });
      render(<TaskDetail />);

      const input = screen.getByDisplayValue("設計書を書く") as HTMLInputElement;
      expect(document.activeElement).toBe(input);
      expect(input.selectionStart).toBe(0);
      expect(input.selectionEnd).toBe("設計書を書く".length);
      expect(editorFocus).not.toHaveBeenCalled();
    });

    it("判定に使ったpendingNewTaskIdは用済みとしてクリアされる", () => {
      useAppStore.setState({
        pendingNewTaskId: "task-1",
      });
      render(<TaskDetail />);

      expect(useAppStore.getState().pendingNewTaskId).toBeNull();
    });

    it("既存タスクがたまたま既定タイトル(新しいタスク)と同名でも、pendingNewTaskIdと不一致なら本文へフォーカスする(タイトル文字列では判定しない)", () => {
      useAppStore.setState({
        tasks: [{ ...task, title: NEW_TASK_TITLE }],
        pendingNewTaskId: null,
      });
      render(<TaskDetail />);

      const input = screen.getByDisplayValue(NEW_TASK_TITLE) as HTMLInputElement;
      expect(document.activeElement).not.toBe(input);
      expect(editorFocus).toHaveBeenCalledTimes(1);
    });
  });

  describe("タイトル入力でのEnter/Tab", () => {
    it("Enter1回では本文へ移らない(日本語入力の変換確定Enter対策)", async () => {
      const user = userEvent.setup();
      render(<TaskDetail />);
      editorFocus.mockClear();

      const input = screen.getByDisplayValue("設計書を書く");
      input.focus();
      await user.keyboard("{Enter}");

      expect(editorFocus).not.toHaveBeenCalled();
      expect(document.activeElement).toBe(input);
    });

    it("Enter2回で本文エディタへフォーカスが移る", async () => {
      const user = userEvent.setup();
      render(<TaskDetail />);
      editorFocus.mockClear();

      const input = screen.getByDisplayValue("設計書を書く");
      input.focus();
      await user.keyboard("{Enter}{Enter}");

      expect(editorFocus).toHaveBeenCalledTimes(1);
    });

    it("1回目のEnterのあとに文字を打ったら、また1回目からやり直しになる", async () => {
      const user = userEvent.setup();
      render(<TaskDetail />);
      editorFocus.mockClear();

      const input = screen.getByDisplayValue("設計書を書く");
      input.focus();
      await user.keyboard("{Enter}");
      // 変換確定のあと続けて入力した場合。古い1回目と組にならないこと
      await user.keyboard("あ");
      await user.keyboard("{Enter}");

      expect(editorFocus).not.toHaveBeenCalled();
    });

    it("IME変換中のEnterは1回目にも数えない", async () => {
      render(<TaskDetail />);
      editorFocus.mockClear();

      const input = screen.getByDisplayValue("設計書を書く");
      input.focus();
      // 変換中(isComposing)のEnterと、IME処理中を示すkeyCode 229のEnter
      fireEvent.keyDown(input, { key: "Enter", isComposing: true });
      fireEvent.keyDown(input, { key: "Enter", keyCode: 229 });
      fireEvent.keyDown(input, { key: "Enter" });

      expect(editorFocus).not.toHaveBeenCalled();

      fireEvent.keyDown(input, { key: "Enter" });
      expect(editorFocus).toHaveBeenCalledTimes(1);
    });

    it("1回目のEnterのあとIME変換を挟んだら(取り消して値が変わらなくても)やり直しになる", async () => {
      render(<TaskDetail />);
      editorFocus.mockClear();

      const input = screen.getByDisplayValue("設計書を書く") as HTMLInputElement;
      input.focus();
      fireEvent.keyDown(input, { key: "Enter" });
      // 変換を始めて取り消したケース。値が変わらないのでonChangeは来ない
      fireEvent.keyDown(input, { key: "a", isComposing: true });
      fireEvent.keyDown(input, { key: "Escape", isComposing: true });
      fireEvent.keyDown(input, { key: "Enter" });

      expect(editorFocus).not.toHaveBeenCalled();
    });

    it("1回目のEnterのあとタイトル欄から離れて戻ったら、また1回目からやり直しになる", async () => {
      render(<TaskDetail />);
      editorFocus.mockClear();

      const input = screen.getByDisplayValue("設計書を書く") as HTMLInputElement;
      input.focus();
      fireEvent.keyDown(input, { key: "Enter" });
      // ヘッダーのボタンを押すなどでフォーカスが外れ、その後タイトルへ戻ったケース
      input.blur();
      input.focus();
      fireEvent.keyDown(input, { key: "Enter" });

      expect(editorFocus).not.toHaveBeenCalled();
    });

    it("キーリピート(押しっぱなし)のEnterは2回目として扱わない", async () => {
      render(<TaskDetail />);
      editorFocus.mockClear();

      const input = screen.getByDisplayValue("設計書を書く");
      input.focus();
      fireEvent.keyDown(input, { key: "Enter" });
      fireEvent.keyDown(input, { key: "Enter", repeat: true });

      expect(editorFocus).not.toHaveBeenCalled();
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
