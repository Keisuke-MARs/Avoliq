import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Status } from "../types";
import { useAppStore } from "../store/appStore";
import { StatusSettings } from "./StatusSettings";
import * as api from "../lib/api";

vi.mock("../lib/api", () => ({
  statusCreate: vi.fn(),
  statusUpdate: vi.fn(),
  statusDelete: vi.fn(),
  statusReorder: vi.fn(),
  // 本物のselectBoard(appStoreのボード切替エポックを進める実装)を回帰テストで
  // 直接呼ぶために必要。StatusSettings自体はこれらを使わない。
  statusesList: vi.fn(),
  tasksList: vi.fn(),
}));

const statuses: Status[] = [
  {
    id: "st-1",
    boardId: "b1",
    name: "未着手",
    color: "#8E8E93",
    position: 0,
  },
  {
    id: "st-2",
    boardId: "b1",
    name: "進行中",
    color: "#007AFF",
    position: 1,
  },
];

const selectBoard = vi.fn(async () => undefined);
// 本物のselectBoard実装(呼ぶとappStore内部のボード切替エポックが進む)を、
// テストがselectBoardスパイで上書きする前に確保しておく。
const realSelectBoard = useAppStore.getState().selectBoard;

describe("StatusSettings", () => {
  beforeEach(() => {
    vi.mocked(api.statusUpdate).mockReset();
    vi.mocked(api.statusCreate).mockReset();
    vi.mocked(api.statusDelete).mockReset();
    vi.mocked(api.statusReorder).mockReset();
    vi.mocked(api.statusesList).mockReset();
    vi.mocked(api.tasksList).mockReset();
    selectBoard.mockClear();
    useAppStore.setState({
      boards: [{ id: "b1", name: "メイン", position: 0 }],
      currentBoardId: "b1",
      statuses,
      tasks: [],
      selectedTaskId: null,
      view: "settings",
      selectBoard,
    });
  });

  it("ステータスを並び順どおりに表示する", () => {
    render(<StatusSettings />);

    expect(screen.getByText("未着手")).toBeInTheDocument();
    expect(screen.getByText("進行中")).toBeInTheDocument();
  });

  it("↓で選択が移動する", async () => {
    const user = userEvent.setup();
    render(<StatusSettings />);

    await user.keyboard("{ArrowDown}");

    expect(screen.getByRole("option", { name: /進行中/ })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  it("Enterで改名に入り、Enterで確定する", async () => {
    vi.mocked(api.statusUpdate).mockResolvedValue({
      ...statuses[0],
      name: "バックログ",
    });
    const user = userEvent.setup();
    render(<StatusSettings />);

    await user.keyboard("{Enter}");
    const input = screen.getByLabelText("ステータス名");
    await user.clear(input);
    await user.type(input, "バックログ{Enter}");

    expect(api.statusUpdate).toHaveBeenCalledWith("st-1", "バックログ", null);
  });

  it("Cキーで色選択に入り、→とEnterで色を変更する", async () => {
    vi.mocked(api.statusUpdate).mockResolvedValue({
      ...statuses[0],
      color: "#007AFF",
    });
    const user = userEvent.setup();
    render(<StatusSettings />);

    await user.keyboard("c");
    expect(screen.getByRole("listbox", { name: "色を選択" })).toBeInTheDocument();

    await user.keyboard("{ArrowRight}{Enter}");

    expect(api.statusUpdate).toHaveBeenCalledWith("st-1", null, "#007AFF");
  });

  it("Nキーで追加入力に入り、Enterで末尾にステータスを追加する", async () => {
    vi.mocked(api.statusCreate).mockResolvedValue({
      id: "st-3",
      boardId: "b1",
      name: "保留",
      color: "#8E8E93",
      position: 2,
    });
    const user = userEvent.setup();
    render(<StatusSettings />);

    await user.keyboard("n");
    const input = screen.getByLabelText("新しいステータス名");
    await user.type(input, "保留{Enter}");

    expect(api.statusCreate).toHaveBeenCalledWith("b1", "保留", "#8E8E93");
  });

  it("⌘↓で並び順が1つ下がる", async () => {
    vi.mocked(api.statusReorder).mockResolvedValue(statuses);
    const user = userEvent.setup();
    render(<StatusSettings />);

    await user.keyboard("{Meta>}{ArrowDown}{/Meta}");

    expect(api.statusReorder).toHaveBeenCalledWith("st-1", 1);
  });

  it("⌘⌫で確認ダイアログを出し、タスクの移動先を説明する", async () => {
    const user = userEvent.setup();
    render(<StatusSettings />);

    await user.keyboard("{ArrowDown}");
    await user.keyboard("{Meta>}{Backspace}{/Meta}");

    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    expect(
      screen.getByText(
        "このステータスのタスクは「未着手」へ移動します。元に戻せません。",
      ),
    ).toBeInTheDocument();
  });

  it("削除対象自身が先頭でも、削除対象を除いた先頭のステータス名を表示する", async () => {
    const user = userEvent.setup();
    render(<StatusSettings />);
    // 初期選択(index 0)は statuses[0]("未着手")。削除対象自身なので、
    // 移動先は次点の statuses[1]("進行中")になるはず。

    await user.keyboard("{Meta>}{Backspace}{/Meta}");

    expect(
      screen.getByText(
        "このステータスのタスクは「進行中」へ移動します。元に戻せません。",
      ),
    ).toBeInTheDocument();
  });

  it("ステータス更新応答より後に切替要求だけが先行していたら、ボードを読み直さない", async () => {
    // currentBoardIdはselectBoardの読込完了後にしか更新されないため、旧方式(currentBoardId比較)
    // では「切替要求中(未完了)」の古い応答を検知できない。ここではstatusUpdateの応答を
    // 手元で止め、本物のselectBoard(エポックを進める実装)を先に割り込ませてから応答を返す。
    let resolveUpdate: (value: Status) => void = () => {};
    const updatePromise = new Promise<Status>((resolve) => {
      resolveUpdate = resolve;
    });
    vi.mocked(api.statusUpdate).mockReturnValue(updatePromise);
    vi.mocked(api.statusesList).mockResolvedValue([]);
    vi.mocked(api.tasksList).mockResolvedValue([]);

    const user = userEvent.setup();
    render(<StatusSettings />);

    await user.keyboard("{Enter}");
    const input = screen.getByLabelText("ステータス名");
    await user.clear(input);
    await user.type(input, "バックログ");
    // Enterでcommit処理を起動する。この時点でepochが捕捉され、statusUpdateの応答待ちに入る
    await user.keyboard("{Enter}");

    // ここで⌘1-9等による本物の切替要求(selectBoard)を割り込ませる。エポックは
    // selectBoard呼び出しの時点(awaitより前)で同期的に進む
    const switchPromise = realSelectBoard("b2");
    // その後にstatusUpdateの応答を返す。reload()に到達するが、
    // 捕捉していたエポックは既に古いのでselectBoard(スパイ)は呼ばれないはず
    resolveUpdate({ ...statuses[0], name: "バックログ" });
    await switchPromise;
    await waitFor(() => {
      expect(screen.queryByLabelText("ステータス名")).not.toBeInTheDocument();
    });

    expect(api.statusUpdate).toHaveBeenCalledWith("st-1", "バックログ", null);
    expect(selectBoard).not.toHaveBeenCalled();
  });

  it("最後の1つのステータスは削除できない", async () => {
    useAppStore.setState({ statuses: [statuses[0]] });
    const user = userEvent.setup();
    render(<StatusSettings />);

    await user.keyboard("{Meta>}{Backspace}{/Meta}");

    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(api.statusDelete).not.toHaveBeenCalled();
  });
});
