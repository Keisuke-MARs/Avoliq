import { fireEvent, render, screen } from "@testing-library/react";
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

describe("TagPalette: 作成・改名・削除", () => {
  beforeEach(() => {
    setup();
    vi.restoreAllMocks();
  });

  it("未登録の名前を打つと作成行が出る", async () => {
    const user = userEvent.setup();
    render(<TagPalette />);

    await user.type(screen.getByTestId("tag-palette-input"), "新規タグ");

    expect(screen.getByTestId("tag-palette-create")).toHaveTextContent("新規タグ");
  });

  it("既にある名前と完全一致するなら作成行は出さない", async () => {
    const user = userEvent.setup();
    render(<TagPalette />);

    await user.type(screen.getByTestId("tag-palette-input"), "バグ");

    expect(screen.queryByTestId("tag-palette-create")).not.toBeInTheDocument();
  });

  it("⌘Enter で作成する（素のEnterでは作らない）", async () => {
    const create = vi.fn();
    useAppStore.setState({ createTagAndAttach: create });
    const user = userEvent.setup();
    render(<TagPalette />);
    await user.type(screen.getByTestId("tag-palette-input"), "新規タグ");

    // 素のEnterは作成しない（IMEの変換確定で誤爆させないため）
    await user.keyboard("{Enter}");
    expect(create).not.toHaveBeenCalled();

    await user.keyboard("{Meta>}{Enter}{/Meta}");
    expect(create).toHaveBeenCalledWith("新規タグ");
  });

  it("⌘R で改名の入力欄に変わり、⌘Enter で確定する", async () => {
    const rename = vi.fn();
    useAppStore.setState({ renameTag: rename });
    const user = userEvent.setup();
    render(<TagPalette />);

    await user.keyboard("{Meta>}r{/Meta}");
    const input = screen.getByTestId("tag-palette-rename-input");
    expect(input).toHaveValue("バグ");

    await user.clear(input);
    await user.type(input, "不具合");
    await user.keyboard("{Meta>}{Enter}{/Meta}");

    expect(rename).toHaveBeenCalledWith("tag-bug", "不具合");
  });

  it("改名は Esc で取り消せる", async () => {
    const rename = vi.fn();
    useAppStore.setState({ renameTag: rename });
    const user = userEvent.setup();
    render(<TagPalette />);

    await user.keyboard("{Meta>}r{/Meta}");
    await user.keyboard("{Escape}");

    expect(screen.queryByTestId("tag-palette-rename-input")).not.toBeInTheDocument();
    expect(rename).not.toHaveBeenCalled();
  });

  it("⌘Backspace で確認ダイアログを出し、件数を伝える", async () => {
    const user = userEvent.setup();
    render(<TagPalette />);

    await user.keyboard("{Meta>}{Backspace}{/Meta}");

    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    expect(screen.getByText(/2件のタスクからこのタグが外れます/)).toBeInTheDocument();
  });

  it("確認ダイアログで Enter を押すと削除する", async () => {
    const remove = vi.fn();
    useAppStore.setState({ deleteTag: remove });
    const user = userEvent.setup();
    render(<TagPalette />);
    await user.keyboard("{Meta>}{Backspace}{/Meta}");

    await user.keyboard("{Enter}");

    expect(remove).toHaveBeenCalledWith("tag-bug");
  });

  it("削除の確認ダイアログを Esc で閉じると、入力欄にフォーカスが戻り操作を続けられる", async () => {
    const close = vi.fn();
    const remove = vi.fn();
    useAppStore.setState({ closeTagPalette: close, deleteTag: remove });
    const user = userEvent.setup();
    render(<TagPalette />);

    await user.keyboard("{Meta>}{Backspace}{/Meta}");
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(remove).not.toHaveBeenCalled();
    expect(screen.getByTestId("tag-palette-input")).toHaveFocus();

    // フォーカスが入力欄に戻っていなければ、この2回目のEscapeはどこにも届かない
    await user.keyboard("{Escape}");
    expect(close).toHaveBeenCalled();
  });

  it("改名中に別の行をクリックしてもトグルされず、改名モードも壊れずキーボード操作を続けられる", async () => {
    const toggle = vi.fn();
    const close = vi.fn();
    useAppStore.setState({ toggleTaskTag: toggle, closeTagPalette: close });
    const user = userEvent.setup();
    render(<TagPalette />);

    // 未付与順は使用件数降順で [バグ, 緊急, 設計]。ハイライトは先頭の「バグ」
    await user.keyboard("{Meta>}r{/Meta}");
    expect(screen.getByTestId("tag-palette-rename-input")).toBeInTheDocument();

    // 改名中に別の行(緊急)をクリックしても無視されること
    await user.click(screen.getByRole("option", { name: /緊急/ }));
    expect(toggle).not.toHaveBeenCalled();

    // 改名モードが壊れていないこと(改名入力欄がまだ残っている)
    expect(screen.getByTestId("tag-palette-rename-input")).toBeInTheDocument();

    // 改名をEscで取り消したあと、キーボード操作(Escでパレットを閉じる)が続けられること
    await user.keyboard("{Escape}");
    expect(screen.queryByTestId("tag-palette-rename-input")).not.toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(close).toHaveBeenCalled();
  });

  it("改名中は作成行が出ない(誤って作成されない)", async () => {
    const create = vi.fn();
    useAppStore.setState({ createTagAndAttach: create });
    const user = userEvent.setup();
    render(<TagPalette />);

    // 部分一致で「バグ」が残りつつ完全一致は無いので、作成行が出る状態を作る
    await user.type(screen.getByTestId("tag-palette-input"), "バ");
    expect(screen.getByTestId("tag-palette-create")).toBeInTheDocument();

    // クエリを残したまま改名モードへ入る
    await user.keyboard("{Meta>}r{/Meta}");

    expect(screen.queryByTestId("tag-palette-create")).not.toBeInTheDocument();
    expect(create).not.toHaveBeenCalled();
  });

  it("改名中に同じ行の入力欄以外(件数など)をクリックしてもフォーカスが外れず、Escapeで改名を取り消せる", async () => {
    const user = userEvent.setup();
    render(<TagPalette />);

    await user.keyboard("{Meta>}r{/Meta}"); // バグを改名モードへ
    const input = screen.getByTestId("tag-palette-rename-input");
    expect(input).toHaveFocus();

    // 改名中の行自身の、入力欄ではない部分(末尾の件数span)をクリックする
    const row = input.closest('[data-testid="tag-palette-row"]');
    const countSpan = row?.querySelector("span:last-child");
    if (countSpan === null || countSpan === undefined) {
      throw new Error("件数spanが見つからない");
    }
    await user.click(countSpan);

    // フォーカスが改名入力欄に残っていること
    expect(input).toHaveFocus();

    // フォーカスが残っていれば、Escapeで改名を取り消せる
    await user.keyboard("{Escape}");
    expect(screen.queryByTestId("tag-palette-rename-input")).not.toBeInTheDocument();
  });
});

describe("TagPalette: IME防御", () => {
  beforeEach(() => {
    setup();
    vi.restoreAllMocks();
  });

  it("IME変換中はハイライトが外れ、Enterの着地点が無くなる", () => {
    const toggle = vi.fn();
    useAppStore.setState({ toggleTaskTag: toggle });
    render(<TagPalette />);
    const input = screen.getByTestId("tag-palette-input");

    fireEvent.compositionStart(input);
    fireEvent.keyDown(input, { key: "Enter" });

    expect(toggle).not.toHaveBeenCalled();
    // 候補行が複数あるため queryByTestId は使えない(複数マッチで例外になる)。
    // どの行もハイライトを外れていることを確認する
    const rows = screen.getAllByTestId("tag-palette-row");
    expect(rows.every((row) => row.dataset.highlighted === "false")).toBe(true);
  });

  it("変換確定の直後に来るEnterは1回だけ飲み込む", () => {
    const toggle = vi.fn();
    useAppStore.setState({ toggleTaskTag: toggle });
    render(<TagPalette />);
    const input = screen.getByTestId("tag-palette-input");

    // WebKitは compositionend を keydown より先に出すため、isComposing だけでは防げない
    fireEvent.compositionStart(input);
    fireEvent.compositionEnd(input);
    fireEvent.keyDown(input, { key: "Enter" });

    expect(toggle).not.toHaveBeenCalled();
  });

  it("飲み込んだ次のEnterは通常どおりトグルする", () => {
    const toggle = vi.fn();
    useAppStore.setState({ toggleTaskTag: toggle });
    render(<TagPalette />);
    const input = screen.getByTestId("tag-palette-input");

    fireEvent.compositionStart(input);
    fireEvent.compositionEnd(input);
    fireEvent.keyDown(input, { key: "Enter" });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(toggle).toHaveBeenCalledTimes(1);
  });

  it("飲み込みの待機は Enter 以外のキーでも解除される", () => {
    const toggle = vi.fn();
    useAppStore.setState({ toggleTaskTag: toggle });
    render(<TagPalette />);
    const input = screen.getByTestId("tag-palette-input");

    fireEvent.compositionStart(input);
    fireEvent.compositionEnd(input);
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(toggle).toHaveBeenCalledTimes(1);
  });

  it("変換中に↑↓を押してもIMEに譲り、ハイライトは動かない", () => {
    render(<TagPalette />);
    const input = screen.getByTestId("tag-palette-input");

    fireEvent.compositionStart(input);
    // WebKit実機ではkeydown自体にisComposingが立つ場合がある。jsdomではKeyboardEventInitで再現する
    fireEvent.keyDown(input, { key: "ArrowDown", isComposing: true });

    const rows = screen.getAllByTestId("tag-palette-row");
    expect(rows.every((row) => row.dataset.highlighted === "false")).toBe(true);
  });

  it("変換中の⌘Enter(作成)や⌘⌫(削除)もIMEガードで抑止される", async () => {
    const create = vi.fn();
    useAppStore.setState({ createTagAndAttach: create });
    const user = userEvent.setup();
    render(<TagPalette />);
    const input = screen.getByTestId("tag-palette-input");
    // "バ"は「バグ」に部分一致するので、作成行を出しつつハイライト対象の行(バグ)も残る状態を作る。
    // 完全に未登録の文字列(例:「新規タグ」)だと候補行が0件になり、rows[highlightIndex]が
    // 常にundefinedになるため、⌘⌫の検証がガードの有無にかかわらず常に成立してしまい空振りする
    await user.type(input, "バ");
    expect(screen.getByTestId("tag-palette-create")).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /バグ/ })).toBeInTheDocument();

    fireEvent.compositionStart(input);
    fireEvent.keyDown(input, { key: "Enter", metaKey: true, isComposing: true });
    expect(create).not.toHaveBeenCalled();

    fireEvent.keyDown(input, { key: "Backspace", metaKey: true, isComposing: true });
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("変換確定後、ハイライトが先頭の候補に戻る", () => {
    render(<TagPalette />);
    const input = screen.getByTestId("tag-palette-input");

    fireEvent.compositionStart(input);
    fireEvent.compositionEnd(input);

    const rows = screen.getAllByTestId("tag-palette-row");
    expect(rows[0]?.dataset.highlighted).toBe("true");
  });

  it("変換中に入力が変わってもハイライトは復活しない", () => {
    render(<TagPalette />);
    const input = screen.getByTestId("tag-palette-input");

    fireEvent.compositionStart(input);
    // 変換の途中でIMEがqueryを書き換える(実機での主要経路)。"バ"は「バグ」に部分一致するので、
    // ガードが外れていると先頭行(バグ)が復活してしまう
    fireEvent.change(input, { target: { value: "バ" } });

    const rows = screen.getAllByTestId("tag-palette-row");
    expect(rows.every((row) => row.dataset.highlighted === "false")).toBe(true);
  });

  it("変換確定後は入力の変化でハイライトが追随する(composing状態が残らない)", () => {
    render(<TagPalette />);
    const input = screen.getByTestId("tag-palette-input");

    fireEvent.compositionStart(input);
    fireEvent.compositionEnd(input);
    // 確定後にcomposingRefがfalseへ戻っていなければ、この変更でハイライトが追随しない
    fireEvent.change(input, { target: { value: "設計" } });

    const rows = screen.getAllByTestId("tag-palette-row");
    expect(rows).toHaveLength(1);
    expect(rows[0]?.dataset.highlighted).toBe("true");
  });

  it("isComposingが立たない環境(keyCode 229)でもEnterを拾わない", () => {
    const toggle = vi.fn();
    useAppStore.setState({ toggleTaskTag: toggle });
    render(<TagPalette />);

    fireEvent.keyDown(screen.getByTestId("tag-palette-input"), { key: "Enter", keyCode: 229 });

    expect(toggle).not.toHaveBeenCalled();
  });
});
