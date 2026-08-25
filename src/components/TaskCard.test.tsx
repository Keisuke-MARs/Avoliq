import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TaskCard } from "@/components/TaskCard";
import { useChipOverflow } from "@/hooks/useChipOverflow";
import { useAppStore, initialAppState } from "@/store/appStore";
import { makeTask, tags as tagFixtures } from "@/test/fixtures";

// 実装本体はそのまま使いつつ、TaskCardがどんな引数(特にresetKey)で
// useChipOverflowを呼んでいるかを検証できるようにラップする
vi.mock("@/hooks/useChipOverflow", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/hooks/useChipOverflow")>();
  return { ...actual, useChipOverflow: vi.fn(actual.useChipOverflow) };
});

const mockedUseChipOverflow = vi.mocked(useChipOverflow);

describe("TaskCard のタグ表示", () => {
  beforeEach(() => {
    useAppStore.setState({ ...initialAppState, tags: tagFixtures });
    mockedUseChipOverflow.mockClear();
  });

  it("タグ名をチップで表示する", () => {
    const task = makeTask("t-x", "st-todo", "タスク", 0, ["tag-bug", "tag-urgent"]);

    render(<TaskCard task={task} statusColor="#007AFF" selected={false} />);

    expect(screen.getByText("バグ")).toBeInTheDocument();
    expect(screen.getByText("緊急")).toBeInTheDocument();
  });

  it("タグが無いカードはチップ行そのものを描画しない", () => {
    const task = makeTask("t-y", "st-todo", "タスク", 0);

    render(<TaskCard task={task} statusColor="#007AFF" selected={false} />);

    expect(screen.queryByTestId("task-card-tags")).not.toBeInTheDocument();
  });

  it("ストアに無いタグidは無視する", () => {
    const task = makeTask("t-z", "st-todo", "タスク", 0, ["tag-bug", "tag-gone"]);

    render(<TaskCard task={task} statusColor="#007AFF" selected={false} />);

    expect(screen.getByTestId("task-card-tags").children).toHaveLength(1);
  });

  it("選択中カードでもタグ配色は変わらない(回帰テスト: 白文字にすると淡い選択面に溶けて読めない)", () => {
    const task = makeTask("t-w", "st-todo", "タスク", 0, ["tag-bug"]);

    render(<TaskCard task={task} statusColor="#007AFF" selected />);

    // tag-bug は #7EA9E8。ライトモードの通常配色と完全に同じであること
    expect(screen.getByText("バグ")).toHaveStyle({
      backgroundColor: "#7EA9E838",
      color: "#4A7CC4",
    });
  });

  it("タグを改名すると測定のやり直しキーが変わる(回帰テスト: idだけでなく名前もキーに含めること)", () => {
    // タグidの並びは変わらず、名前だけが変わるケース(renameTag相当)を再現する。
    // idだけをキーにすると、この操作では再測定がトリガーされずチップ幅が古いまま固定されてしまう
    const task = makeTask("t-x", "st-todo", "タスク", 0, ["tag-bug"]);

    const { rerender } = render(
      <TaskCard task={task} statusColor="#007AFF" selected={false} />,
    );
    const callsBefore = mockedUseChipOverflow.mock.calls;
    const keyBefore = callsBefore[callsBefore.length - 1]?.[1];

    const renamed = tagFixtures.map((t) =>
      t.id === "tag-bug" ? { ...t, name: "不具合" } : t,
    );
    useAppStore.setState({ tags: renamed });
    rerender(<TaskCard task={task} statusColor="#007AFF" selected={false} />);
    const callsAfter = mockedUseChipOverflow.mock.calls;
    const keyAfter = callsAfter[callsAfter.length - 1]?.[1];

    expect(keyBefore).not.toBe(keyAfter);
  });
});

describe("TaskCard のタイトル表示", () => {
  beforeEach(() => {
    useAppStore.setState({ ...initialAppState, tags: tagFixtures });
  });

  it("長いタイトルは2行まで表示する(回帰テスト: truncateだと1行で切れて何のタスクか判別できない)", () => {
    const task = makeTask("t-long", "st-todo", "認証まわりのリファクタリングをやる", 0);

    render(<TaskCard task={task} statusColor="#007AFF" selected={false} />);

    const title = screen.getByText("認証まわりのリファクタリングをやる");
    expect(title).toHaveClass("line-clamp-2");
    expect(title).not.toHaveClass("truncate");
  });

  it("切れ目の無い文字列でも折り返す(回帰テスト: truncateのwhitespace-nowrapが外れるので折り返し規則を明示する)", () => {
    const task = makeTask("t-url", "st-todo", "https://example.com/very/long/path", 0);

    render(<TaskCard task={task} statusColor="#007AFF" selected={false} />);

    expect(screen.getByText("https://example.com/very/long/path")).toHaveClass(
      "break-words",
    );
  });

  it("ステータスドットは1行目の中心に置く(回帰テスト: items-centerだと2行のとき行間に落ちる)", () => {
    const task = makeTask("t-long2", "st-todo", "認証まわりのリファクタリングをやる", 0);

    const { container } = render(
      <TaskCard task={task} statusColor="#007AFF" selected={false} />,
    );

    const dot = container.querySelector(".av-status-dot") as HTMLElement;
    expect(dot).toHaveClass("mt-[6px]");
    expect(dot.parentElement).toHaveClass("items-start");
  });
});
