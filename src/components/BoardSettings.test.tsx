import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAppStore } from "../store/appStore";
import { BoardSettings } from "./BoardSettings";

vi.mock("./StatusSettings", () => ({
  StatusSettings: () => <div data-testid="status-settings" />,
}));

vi.mock("./AppSettings", () => ({
  AppSettings: () => <div data-testid="app-settings" />,
}));

const setView = vi.fn();

describe("BoardSettings", () => {
  beforeEach(() => {
    setView.mockClear();
    useAppStore.setState({
      boards: [{ id: "b1", name: "メイン", position: 0 }],
      currentBoardId: "b1",
      statuses: [],
      tasks: [],
      selectedTaskId: null,
      view: "settings",
      setView,
    });
  });

  it("初期表示はボードタブ", () => {
    render(<BoardSettings />);

    expect(screen.getByTestId("status-settings")).toBeInTheDocument();
    expect(screen.queryByTestId("app-settings")).not.toBeInTheDocument();
  });

  it("Tabでアプリタブへ切り替わる", async () => {
    const user = userEvent.setup();
    render(<BoardSettings />);

    await user.keyboard("{Tab}");

    expect(screen.getByTestId("app-settings")).toBeInTheDocument();
    expect(screen.queryByTestId("status-settings")).not.toBeInTheDocument();
  });

  it("Escでboardビューへ戻る", async () => {
    const user = userEvent.setup();
    render(<BoardSettings />);

    await user.keyboard("{Escape}");

    expect(setView).toHaveBeenCalledWith("board");
  });
});
