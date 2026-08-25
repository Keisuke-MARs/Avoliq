import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SearchBar } from "@/components/SearchBar";
import { initialAppState, useAppStore } from "@/store/appStore";
import { tags, tasks } from "@/test/fixtures";

/** いまハイライトされている候補行のテキスト（ハイライト無しなら null） */
function highlightedText(): string | null {
  const row = screen.getByTestId("tag-suggest").querySelector('[data-highlighted="true"]');
  return row === null ? null : (row.textContent ?? "");
}

describe("SearchBar の # サジェスト", () => {
  beforeEach(() => {
    useAppStore.setState({ ...initialAppState, tasks, tags });
  });

  it("# を打つとタグ候補が出る", async () => {
    const user = userEvent.setup();
    render(<SearchBar />);

    await user.type(screen.getByTestId("search-input"), "#");

    expect(screen.getByTestId("tag-suggest")).toBeInTheDocument();
    expect(screen.getByText("バグ")).toBeInTheDocument();
  });

  it("全角の＃でも候補が出る", async () => {
    const user = userEvent.setup();
    render(<SearchBar />);

    await user.type(screen.getByTestId("search-input"), "＃");

    expect(screen.getByTestId("tag-suggest")).toBeInTheDocument();
  });

  it("前方一致で候補を絞る", async () => {
    const user = userEvent.setup();
    render(<SearchBar />);

    await user.type(screen.getByTestId("search-input"), "#設");

    expect(screen.getByText("設計")).toBeInTheDocument();
    expect(screen.queryByText("バグ")).not.toBeInTheDocument();
  });

  it("# が付いていないときは候補を出さない", async () => {
    const user = userEvent.setup();
    render(<SearchBar />);

    await user.type(screen.getByTestId("search-input"), "ログイン");

    expect(screen.queryByTestId("tag-suggest")).not.toBeInTheDocument();
  });

});

describe("SearchBar: 既存のキー操作を邪魔しないこと", () => {
  beforeEach(() => {
    useAppStore.setState({ ...initialAppState, tasks, tags });
  });

  it("stopPropagationしていないので、Enterなど既存のキー操作はwindowのハンドラに届く", async () => {
    const user = userEvent.setup();
    render(<SearchBar />);
    const spy = vi.fn();
    window.addEventListener("keydown", spy);

    const input = screen.getByTestId("search-input");
    await user.type(input, "a");
    await user.keyboard("{Enter}");
    await user.keyboard("{ArrowDown}");

    window.removeEventListener("keydown", spy);

    const keys = spy.mock.calls.map(([e]) => (e as KeyboardEvent).key);
    expect(keys).toContain("a");
    expect(keys).toContain("Enter");
    expect(keys).toContain("ArrowDown");
  });
});

describe("SearchBar: 常時マウントされていることによる副作用の防止", () => {
  beforeEach(() => {
    useAppStore.setState({ ...initialAppState, tasks, tags });
  });

  it("view が detail のときはサジェストを表示しない(SearchBar自体はviewに関係なく常時マウントされているため)", async () => {
    const user = userEvent.setup();
    render(<SearchBar />);
    const input = screen.getByTestId("search-input");
    await user.type(input, "#");
    expect(screen.getByTestId("tag-suggest")).toBeInTheDocument();

    // カードを開いて詳細画面へ遷移する(searchQueryはクリアされない)。
    // SearchBarはPalette.tsxでviewに関わらず常時マウントされたままなので、
    // view側で絞らないと詳細画面の上にドロップダウンが浮いたまま残ってしまう
    useAppStore.setState({ view: "detail" });

    await waitFor(() => {
      expect(screen.queryByTestId("tag-suggest")).not.toBeInTheDocument();
    });
  });
});

describe("SearchBar: ↑↓ でのハイライト移動", () => {
  beforeEach(() => {
    useAppStore.setState({ ...initialAppState, tasks, tags });
  });

  it("候補が出た直後はどれもハイライトされていない", async () => {
    const user = userEvent.setup();
    render(<SearchBar />);
    await user.type(screen.getByTestId("search-input"), "#");

    expect(highlightedText()).toBeNull();
  });

  it("↓ で先頭候補がハイライトされる", async () => {
    const user = userEvent.setup();
    render(<SearchBar />);
    await user.type(screen.getByTestId("search-input"), "#");

    await user.keyboard("{ArrowDown}");

    expect(highlightedText()).toContain("バグ");
  });

  it("↓ を続けると次の候補へ進み、最後の候補で止まる", async () => {
    const user = userEvent.setup();
    render(<SearchBar />);
    await user.type(screen.getByTestId("search-input"), "#");

    await user.keyboard("{ArrowDown}{ArrowDown}");
    expect(highlightedText()).toContain("緊急");

    // 候補は バグ / 緊急 / 設計 の3件。4回目以降は末尾で止まる（折り返さない）
    await user.keyboard("{ArrowDown}{ArrowDown}");
    expect(highlightedText()).toContain("設計");
  });

  it("↑ で1つ上へ戻り、先頭からさらに ↑ でハイライトが消える", async () => {
    const user = userEvent.setup();
    render(<SearchBar />);
    await user.type(screen.getByTestId("search-input"), "#");

    await user.keyboard("{ArrowDown}{ArrowDown}");
    expect(highlightedText()).toContain("緊急");

    await user.keyboard("{ArrowUp}");
    expect(highlightedText()).toContain("バグ");

    await user.keyboard("{ArrowUp}");
    expect(highlightedText()).toBeNull();
  });

  it("入力を打ち直すとハイライトが消える", async () => {
    const user = userEvent.setup();
    render(<SearchBar />);
    const input = screen.getByTestId("search-input");
    await user.type(input, "#");
    await user.keyboard("{ArrowDown}");
    expect(highlightedText()).toContain("バグ");

    await user.type(input, "設");

    expect(highlightedText()).toBeNull();
  });

  it("ボードを切り替えるとハイライトが消える", async () => {
    const user = userEvent.setup();
    useAppStore.setState({ currentBoardId: "board-1" });
    render(<SearchBar />);
    const input = screen.getByTestId("search-input");
    await user.type(input, "#");
    await user.keyboard("{ArrowDown}");
    expect(highlightedText()).toContain("バグ");

    // selectBoardはonChange/onBlurを経由せず、searchQueryとcurrentBoardIdを直接書き換える。
    // その経路をここで再現する
    useAppStore.setState({ currentBoardId: "board-2", searchQuery: "#" });

    // currentBoardId の変化を検知する useEffect は再描画のコミット後に走るので、
    // ハイライトが消えるのを待ってから確認する
    await waitFor(() => {
      expect(highlightedText()).toBeNull();
    });
  });
});

describe("SearchBar: Enter での確定", () => {
  beforeEach(() => {
    useAppStore.setState({ ...initialAppState, tasks, tags });
  });

  it("ハイライトした候補を Enter で確定し、末尾にスペースを付ける", async () => {
    const user = userEvent.setup();
    render(<SearchBar />);
    await user.type(screen.getByTestId("search-input"), "#");

    await user.keyboard("{ArrowDown}{Enter}");

    expect(useAppStore.getState().searchQuery).toBe("#バグ ");
  });

  it("確定すると候補が閉じ、続けて検索語を打てる", async () => {
    const user = userEvent.setup();
    render(<SearchBar />);
    const input = screen.getByTestId("search-input");
    await user.type(input, "#");
    await user.keyboard("{ArrowDown}{Enter}");

    expect(screen.queryByTestId("tag-suggest")).not.toBeInTheDocument();

    await user.type(input, "牛乳");
    expect(useAppStore.getState().searchQuery).toBe("#バグ 牛乳");
  });

  it("打ちかけの文字を候補の名前で置き換える", async () => {
    const user = userEvent.setup();
    render(<SearchBar />);
    await user.type(screen.getByTestId("search-input"), "牛乳 #設");

    await user.keyboard("{ArrowDown}{Enter}");

    expect(useAppStore.getState().searchQuery).toBe("牛乳 #設計 ");
  });
});

describe("SearchBar: 奪ってはいけないキー", () => {
  beforeEach(() => {
    useAppStore.setState({ ...initialAppState, tasks, tags });
  });

  // fireEventはdispatchEventの戻り値を返す。cancelableなイベントでpreventDefault()が
  // 呼ばれているとfalseになるので、これでwindow側のハンドラに渡るかを判定できる
  it("ハイライト無しのときの Enter は preventDefault しない", () => {
    render(<SearchBar />);
    const input = screen.getByTestId("search-input");
    fireEvent.change(input, { target: { value: "#" } });

    expect(fireEvent.keyDown(input, { key: "Enter" })).toBe(true);
  });

  it("ハイライト無しのときの ↑ は preventDefault しない", () => {
    render(<SearchBar />);
    const input = screen.getByTestId("search-input");
    fireEvent.change(input, { target: { value: "#" } });

    expect(fireEvent.keyDown(input, { key: "ArrowUp" })).toBe(true);
  });

  it("候補が0件のときは ↓ を奪わない", () => {
    render(<SearchBar />);
    const input = screen.getByTestId("search-input");
    // 存在しないタグ名なので候補は0件になる
    fireEvent.change(input, { target: { value: "#存在しないタグ名" } });

    expect(fireEvent.keyDown(input, { key: "ArrowDown" })).toBe(true);
  });

  it("タグトークンでないときは ↓ を奪わない", () => {
    render(<SearchBar />);
    const input = screen.getByTestId("search-input");
    fireEvent.change(input, { target: { value: "牛乳" } });

    expect(fireEvent.keyDown(input, { key: "ArrowDown" })).toBe(true);
  });

  it("⌘↓ は奪わない（カードの並び替えを壊さないため）", () => {
    render(<SearchBar />);
    const input = screen.getByTestId("search-input");
    fireEvent.change(input, { target: { value: "#" } });
    // 候補にハイライトが乗っている状態でも奪ってはいけない
    fireEvent.keyDown(input, { key: "ArrowDown" });

    expect(fireEvent.keyDown(input, { key: "ArrowDown", metaKey: true })).toBe(true);
  });

  // ⇧付きの矢印は useKeyboard 側が「検索欄からレーンへ入る」操作として拾う仕様なので、
  // 候補の操作としてここで奪ってはいけない
  it("⇧↑ は奪わない（レーンへ入る操作は board 側が拾うため）", () => {
    render(<SearchBar />);
    const input = screen.getByTestId("search-input");
    fireEvent.change(input, { target: { value: "#" } });
    fireEvent.keyDown(input, { key: "ArrowDown" });

    expect(fireEvent.keyDown(input, { key: "ArrowUp", shiftKey: true })).toBe(true);
  });

  it("Tab は奪わない（候補送りは廃止した）", () => {
    render(<SearchBar />);
    const input = screen.getByTestId("search-input");
    fireEvent.change(input, { target: { value: "#" } });

    expect(fireEvent.keyDown(input, { key: "Tab" })).toBe(true);
    expect(useAppStore.getState().searchQuery).toBe("#");
  });
});
