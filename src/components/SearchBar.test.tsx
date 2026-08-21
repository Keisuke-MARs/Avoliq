import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SearchBar } from "@/components/SearchBar";
import { initialAppState, useAppStore } from "@/store/appStore";
import { tags, tasks } from "@/test/fixtures";

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

  it("Tab で候補を補完し、連打で次の候補へ送る", async () => {
    const user = userEvent.setup();
    render(<SearchBar />);
    const input = screen.getByTestId("search-input");
    await user.type(input, "#");

    await user.keyboard("{Tab}");
    expect(useAppStore.getState().searchQuery).toBe("#バグ");

    await user.keyboard("{Tab}");
    expect(useAppStore.getState().searchQuery).toBe("#緊急");
  });

  it("Enter は補完に使わない（board の Enter を壊さないため）", async () => {
    const user = userEvent.setup();
    render(<SearchBar />);
    await user.type(screen.getByTestId("search-input"), "#");

    await user.keyboard("{Enter}");

    expect(useAppStore.getState().searchQuery).toBe("#");
  });
});

describe("SearchBar: Tab連打サイクルのリセット", () => {
  beforeEach(() => {
    useAppStore.setState({ ...initialAppState, tasks, tags });
  });

  it("Tab以外のキーを打つと候補送りのサイクルがリセットされる", async () => {
    const user = userEvent.setup();
    render(<SearchBar />);
    const input = screen.getByTestId("search-input");
    await user.type(input, "#");

    await user.keyboard("{Tab}");
    expect(useAppStore.getState().searchQuery).toBe("#バグ");
    await user.keyboard("{Tab}");
    expect(useAppStore.getState().searchQuery).toBe("#緊急");

    // Tab以外のキー(キャレット移動)を挟むとサイクルがリセットされる。
    // リセットされていなければ次のTabで3周目(設計)に進むが、
    // リセット後は現在の文字列「#緊急」を起点に再計算するので候補は自分自身のみになる
    await user.keyboard("{ArrowLeft}");
    await user.keyboard("{Tab}");

    expect(useAppStore.getState().searchQuery).toBe("#緊急");
  });

  it("入力を打ち直すとサイクルがリセットされる", async () => {
    const user = userEvent.setup();
    render(<SearchBar />);
    const input = screen.getByTestId("search-input");
    await user.type(input, "#");
    await user.keyboard("{Tab}"); // -> "#バグ"
    await user.keyboard("{Tab}"); // -> "#緊急"

    // 全部消して打ち直す
    await user.clear(input);
    await user.type(input, "#");

    await user.keyboard("{Tab}");

    // リセットされていなければ3周目の「設計」になるはずだが、
    // リセットされているので先頭候補の「バグ」に戻る
    expect(useAppStore.getState().searchQuery).toBe("#バグ");
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

  it("候補が0件のときはTabのデフォルト動作(フォーカス移動)を邪魔しない", () => {
    render(<SearchBar />);
    const input = screen.getByTestId("search-input");

    // 存在しないタグ名なので候補は0件になる
    fireEvent.change(input, { target: { value: "#存在しないタグ名" } });

    // fireEventはdispatchEventの戻り値を返す。cancelableなイベントでpreventDefault()が
    // 呼ばれているとfalseになるので、これでTabのデフォルト動作が生きているか判定できる
    const notPrevented = fireEvent.keyDown(input, { key: "Tab" });

    expect(notPrevented).toBe(true);
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

  it("ボードを切り替えるとTabの候補送りサイクルがリセットされる", async () => {
    const user = userEvent.setup();
    useAppStore.setState({ currentBoardId: "board-1" });
    render(<SearchBar />);
    const input = screen.getByTestId("search-input");
    await user.type(input, "#");

    await user.keyboard("{Tab}"); // -> "#バグ"
    await user.keyboard("{Tab}"); // -> "#緊急"
    expect(useAppStore.getState().searchQuery).toBe("#緊急");

    // selectBoardはonChange/onBlurを経由せず、searchQueryとcurrentBoardIdを直接書き換える。
    // その経路をここで再現する
    useAppStore.setState({ currentBoardId: "board-2", searchQuery: "" });

    // currentBoardId の変化を検知する useEffect は再描画のコミット後に走る。
    // ここで待たずに次の操作へ進むと、refs のリセットが間に合う前にアサーションしてしまい
    // 「リセットされたかどうか」を正しく検証できない。DOM側の反映(入力欄が空になったこと)を
    // 待つことで、useEffectのリセットも確実に完了させてから次へ進む
    await waitFor(() => {
      expect(input).toHaveValue("");
    });

    // ここで user.type(input, "#") を使うと、DOM の onChange 経由で refs が
    // その場でリセットされてしまい、currentBoardId の変化によるリセットの検証にならない。
    // useKeyboard.ts の非フォーカス時の経路(検索欄が非フォーカスのまま印字可能キーが来ると
    // s.setSearchQuery を store 経由で直接呼ぶ)を再現するため、ここも store を直接呼ぶ
    useAppStore.getState().setSearchQuery("#");
    // 同様に、store直呼びの反映(再描画)を待ってから keyDown を発火する。
    // 待たずに発火すると、input の onKeyDown ハンドラが「#」反映前の古い描画に
    // 紐づいたクロージャのままになり、isTagToken が false のTab押下として空振りする
    await waitFor(() => {
      expect(input).toHaveValue("#");
    });
    fireEvent.keyDown(input, { key: "Tab" });

    // リセットされていなければ前ボードのcycle位置(2週目)から続いて「設計」になってしまうが、
    // リセットされていれば新しいボードでも先頭候補の「バグ」に戻る
    expect(useAppStore.getState().searchQuery).toBe("#バグ");
  });
});
