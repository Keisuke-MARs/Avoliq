import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
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

  it("レーンヘッダーの点をステータス色で塗る", () => {
    // Circleアイコン(svg)からspan+CSSカスタムプロパティへ移行したため、
    // 見るのは塗りの実値ではなく--av-statusへの注入になった
    setupBoard();
    render(<Board />);
    const dot = screen.getAllByTestId("lane")[1].querySelector(".av-status-dot");
    expect(dot).not.toBeNull();
    expect((dot as HTMLElement).style.getPropertyValue("--av-status")).toBe("#5AC8FA");
  });

  it("レーンは縮んでも最小幅を保つ(回帰テスト: min-w-0だとステータスを増やすほど潰れて読めなくなる)", () => {
    setupBoard();
    render(<Board />);
    // 880px幅なら5レーンまでは各161.6pxで収まり、6レーン以降はこの幅を保ったまま横スクロールする
    expect(screen.getAllByTestId("lane")[0]).toHaveClass("min-w-[160px]");
  });

  it("レーンが収まらないときはボードを横スクロールさせる", () => {
    setupBoard();
    render(<Board />);
    const board = screen.getByTestId("board");
    expect(board).toHaveClass("overflow-x-auto");
    // 縦は各レーンの内側(Laneのoverflow-y-auto)が持つので、ボード自体は隠したままにする
    expect(board).toHaveClass("overflow-y-hidden");
  });

  it("ステータスが6つでも全レーンを描画し、最小幅と横スクロールを保つ", () => {
    // 880px幅では6レーンから横スクロールに移行する。等分をやめた影響で
    // レーンが落ちたり畳まれたりしないこと(=描画の責務は変えていないこと)を固定する
    useAppStore.setState({
      statuses: [
        ...statuses,
        { id: "st-wait", boardId: "board-1", name: "保留", color: "#AF52DE", position: 4 },
        { id: "st-hold", boardId: "board-1", name: "凍結", color: "#FF3B30", position: 5 },
      ],
      tasks,
      currentBoardId: "board-1",
    });
    render(<Board />);

    const lanes = screen.getAllByTestId("lane");
    expect(lanes).toHaveLength(6);
    for (const lane of lanes) {
      expect(lane).toHaveClass("min-w-[160px]");
    }
    expect(screen.getByTestId("board")).toHaveClass("overflow-x-auto");
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

  it("選択カードはステータス色でベタ塗りされず、白文字固定にもならない", async () => {
    // 選択は「いまどこにいるか」という状態であってステータス(データ)ではないため、
    // 選択の色はブランド青(CSS側の.av-card[data-selected])に固定し、
    // インラインstyleにはステータス色をカスタムプロパティとして渡すだけにする
    setupBoard();
    useAppStore.setState({ selectedTaskId: "t-d" });
    render(<Board />);
    const card = screen
      .getAllByTestId("task-card")
      .find((c) => c.getAttribute("data-task-id") === "t-d") as HTMLElement;

    await waitFor(() => expect(card).toHaveAttribute("data-selected", "true"));

    // インラインstyleにステータス色や#fffが直接入っていないこと。
    // 選択の見た目は.av-card[data-selected]のCSS側が持つ。
    expect(card.style.backgroundColor).toBe("");
    expect(card.style.color).toBe("");
    // ステータス色は装飾用のカスタムプロパティとしてだけ注入される
    expect(card.style.getPropertyValue("--av-status")).not.toBe("");
  });

  it("検索クエリでカードを絞り込む", () => {
    setupBoard();
    useAppStore.setState({ searchQuery: "牛" });
    render(<Board />);
    expect(screen.getAllByTestId("task-card")).toHaveLength(2);
    expect(screen.getAllByTestId("lane")[0].querySelector("[data-testid='lane-count']")?.textContent).toBe("2");
  });

  it("絞り込み結果が0件のとき、タスク自体が無い場合とは別の空状態を出す", () => {
    setupBoard();
    useAppStore.setState({ searchQuery: "存在しないタスク名" });
    render(<Board />);
    expect(screen.queryAllByTestId("task-card")).toHaveLength(0);
    expect(screen.queryAllByTestId("lane")).toHaveLength(0);
    expect(screen.getByText("該当するタスクがありません")).toBeInTheDocument();
    // タスクがまだ無いときの空状態文言とは区別されていること
    expect(screen.queryByText("タスクはまだありません")).not.toBeInTheDocument();
  });

  it("存在しないタグで絞り込んでも0件の空状態を出す", () => {
    setupBoard();
    useAppStore.setState({ searchQuery: "#存在しないタグ" });
    render(<Board />);
    expect(screen.getByText("該当するタスクがありません")).toBeInTheDocument();
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
