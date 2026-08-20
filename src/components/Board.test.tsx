import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Board } from "./Board";
import { useAppStore } from "@/store/appStore";
import { statuses, tasks } from "@/test/fixtures";

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
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

function setupBoard(): void {
  useAppStore.setState({ statuses, tasks, currentBoardId: "board-1" });
}

describe("Board", () => {
  it("ステータスの数だけレーンを描画する", () => {
    setupBoard();
    render(<Board />);
    expect(screen.getAllByTestId("lane")).toHaveLength(4);
  });

  it("レーンヘッダーにステータス名と件数を出す", () => {
    setupBoard();
    render(<Board />);
    const lanes = screen.getAllByTestId("lane");
    expect(lanes[0]).toHaveTextContent("未着手");
    expect(lanes[0].querySelector("[data-testid='lane-count']")?.textContent).toBe("3");
    expect(lanes[2]).toHaveTextContent("確認中");
    expect(lanes[2].querySelector("[data-testid='lane-count']")?.textContent).toBe("0");
  });

  it("レーンヘッダーのアイコンをステータス色で塗る", () => {
    setupBoard();
    render(<Board />);
    const icon = screen.getAllByTestId("lane")[1].querySelector("svg");
    expect(icon?.getAttribute("fill")).toBe("#007AFF");
    expect(icon?.getAttribute("stroke")).toBe("#007AFF");
  });

  it("カードをposition順に並べる", () => {
    setupBoard();
    render(<Board />);
    const cards = screen.getAllByTestId("lane")[0].querySelectorAll("[data-testid='task-card']");
    expect([...cards].map((c) => c.textContent)).toEqual([
      "牛乳を買う",
      "資料をまとめる",
      "牛丼を食べる",
    ]);
  });

  it("選択中のカードだけ data-selected が true になる", () => {
    setupBoard();
    useAppStore.setState({ selectedTaskId: "t-b" });
    render(<Board />);
    const selected = screen.getAllByTestId("task-card").filter(
      (c) => c.getAttribute("data-selected") === "true",
    );
    expect(selected).toHaveLength(1);
    expect(selected[0].getAttribute("data-task-id")).toBe("t-b");
  });

  it("選択中のカードの背景色をステータス色で塗る", () => {
    setupBoard();
    useAppStore.setState({ selectedTaskId: "t-d" });
    render(<Board />);
    const card = screen
      .getAllByTestId("task-card")
      .find((c) => c.getAttribute("data-task-id") === "t-d");
    expect(card?.getAttribute("style")).toContain("#007AFF");
  });

  it("検索クエリでカードを絞り込む", () => {
    setupBoard();
    useAppStore.setState({ searchQuery: "牛" });
    render(<Board />);
    expect(screen.getAllByTestId("task-card")).toHaveLength(2);
    expect(screen.getAllByTestId("lane")[0].querySelector("[data-testid='lane-count']")?.textContent).toBe("2");
  });

  it("カードをクリックすると選択される", async () => {
    const user = userEvent.setup();
    setupBoard();
    render(<Board />);
    const card = screen
      .getAllByTestId("task-card")
      .find((c) => c.getAttribute("data-task-id") === "t-c");
    await user.click(card as HTMLElement);
    expect(useAppStore.getState().selectedTaskId).toBe("t-c");
  });
});
