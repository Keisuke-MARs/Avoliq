import { render, screen } from "@testing-library/react";
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
});
