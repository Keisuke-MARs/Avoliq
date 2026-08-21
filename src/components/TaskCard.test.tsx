import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { TaskCard } from "@/components/TaskCard";
import { useAppStore, initialAppState } from "@/store/appStore";
import { makeTask, tags as tagFixtures } from "@/test/fixtures";

describe("TaskCard のタグ表示", () => {
  beforeEach(() => {
    useAppStore.setState({ ...initialAppState, tags: tagFixtures });
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

  it("選択中カードではタグ色を捨てて白系の配色になる", () => {
    const task = makeTask("t-w", "st-todo", "タスク", 0, ["tag-bug"]);

    render(<TaskCard task={task} statusColor="#007AFF" selected />);

    const chip = screen.getByText("バグ");
    expect(chip).toHaveStyle({ color: "#fff" });
  });
});
