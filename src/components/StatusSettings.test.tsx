import { render, screen } from "@testing-library/react";
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

describe("StatusSettings", () => {
  beforeEach(() => {
    vi.mocked(api.statusUpdate).mockReset();
    vi.mocked(api.statusCreate).mockReset();
    vi.mocked(api.statusDelete).mockReset();
    vi.mocked(api.statusReorder).mockReset();
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
});
