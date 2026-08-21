import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TagPalette } from "@/components/TagPalette";
import { initialAppState, useAppStore } from "@/store/appStore";
import { statuses, tags, tasks } from "@/test/fixtures";

function setup() {
  useAppStore.setState({
    ...initialAppState,
    currentBoardId: "board-1",
    statuses,
    tasks,
    tags,
    // t-b はタグなし
    selectedTaskId: "t-b",
    tagPaletteOpen: true,
  });
}

describe("TagPalette", () => {
  beforeEach(() => {
    setup();
    vi.restoreAllMocks();
  });

  it("ボードのタグを全部並べる", () => {
    render(<TagPalette />);

    expect(screen.getByRole("option", { name: /バグ/ })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /緊急/ })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /設計/ })).toBeInTheDocument();
  });

  it("入力で候補を絞り込む", async () => {
    const user = userEvent.setup();
    render(<TagPalette />);

    await user.type(screen.getByTestId("tag-palette-input"), "バグ");

    expect(screen.getByRole("option", { name: /バグ/ })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: /設計/ })).not.toBeInTheDocument();
  });

  it("付与済みのタグを先頭に並べる", () => {
    // t-c は バグ・緊急 が付いている
    useAppStore.setState({ selectedTaskId: "t-c" });
    render(<TagPalette />);

    const options = screen.getAllByRole("option");
    expect(options[0]).toHaveTextContent("バグ");
    expect(options[1]).toHaveTextContent("緊急");
  });

  it("Enter でハイライト中のタグをトグルする", async () => {
    const toggle = vi.fn();
    useAppStore.setState({ toggleTaskTag: toggle });
    const user = userEvent.setup();
    render(<TagPalette />);

    await user.keyboard("{Enter}");

    expect(toggle).toHaveBeenCalledWith("tag-bug");
  });

  it("↓ でハイライトが次の候補へ移る", async () => {
    const toggle = vi.fn();
    useAppStore.setState({ toggleTaskTag: toggle });
    const user = userEvent.setup();
    render(<TagPalette />);

    await user.keyboard("{ArrowDown}{Enter}");

    expect(toggle).toHaveBeenCalledWith("tag-urgent");
  });

  it("入力欄が空のときの Backspace は付与済みの末尾を外す", async () => {
    const toggle = vi.fn();
    // t-c は バグ・緊急 の順で付いている
    useAppStore.setState({ selectedTaskId: "t-c", toggleTaskTag: toggle });
    const user = userEvent.setup();
    render(<TagPalette />);

    await user.keyboard("{Backspace}");

    expect(toggle).toHaveBeenCalledWith("tag-urgent");
  });

  it("Esc で閉じる", async () => {
    const close = vi.fn();
    useAppStore.setState({ closeTagPalette: close });
    const user = userEvent.setup();
    render(<TagPalette />);

    await user.keyboard("{Escape}");

    expect(close).toHaveBeenCalled();
  });

  it("使用件数を出す", () => {
    render(<TagPalette />);

    // バグは t-a と t-c に付いている
    expect(screen.getByRole("option", { name: /バグ/ })).toHaveTextContent("2");
  });
});

/**
 * 実際のstore.toggleTaskTagと同じ「押したタグの付与状態を反転してtasksを更新する」だけの
 * 簡易フェイク。トグルによってrowsの並び順が変わる状況を再現するために使う
 * (何もしないvi.fn()だとtasksが変化せず、並び替え後もハイライトが正しい行を
 * 指しているかという回帰の検証ができない)。
 */
function makeReorderingToggle() {
  return vi.fn((tagId: string) => {
    const { tasks: currentTasks, selectedTaskId } = useAppStore.getState();
    useAppStore.setState({
      tasks: currentTasks.map((t) =>
        t.id === selectedTaskId
          ? {
              ...t,
              tagIds: t.tagIds.includes(tagId)
                ? t.tagIds.filter((id) => id !== tagId)
                : [...t.tagIds, tagId],
            }
          : t,
      ),
    });
    return Promise.resolve();
  });
}

describe("TagPalette: コードレビュー指摘の回帰", () => {
  beforeEach(() => {
    setup();
    vi.restoreAllMocks();
  });

  it("タグ行をクリックしても入力欄のフォーカスが外れず、続けてキーボード操作できる", async () => {
    const close = vi.fn();
    useAppStore.setState({ closeTagPalette: close });
    const user = userEvent.setup();
    render(<TagPalette />);

    await user.click(screen.getByRole("option", { name: /設計/ }));

    expect(screen.getByTestId("tag-palette-input")).toHaveFocus();

    // フォーカスが外れて document.body 起点になっていると、Escapeはdialogのハンドラへ届かない
    await user.keyboard("{Escape}");
    expect(close).toHaveBeenCalled();
  });

  it("トグルで並び順が変わってもハイライトは同じタグを指し続ける(ArrowDown→Enter→Enterで同じタグが2回トグルされる)", async () => {
    const toggle = makeReorderingToggle();
    useAppStore.setState({ toggleTaskTag: toggle });
    const user = userEvent.setup();
    render(<TagPalette />);

    // t-b はタグなし。未付与順は使用件数降順で [バグ, 緊急, 設計]
    await user.keyboard("{ArrowDown}"); // ハイライトを「緊急」へ
    await user.keyboard("{Enter}"); // 緊急を付与 → 並びは [緊急(付与済み), バグ, 設計] に変わる
    await user.keyboard("{Enter}"); // ハイライトが「緊急」に追随していれば、もう一度緊急がトグルされる

    expect(toggle).toHaveBeenNthCalledWith(1, "tag-urgent");
    expect(toggle).toHaveBeenNthCalledWith(2, "tag-urgent");
  });
});
