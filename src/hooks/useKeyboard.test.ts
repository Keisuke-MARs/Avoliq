import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { hidePalette } from "@/lib/api";
import { useAppStore } from "@/store/appStore";
import { SEARCH_INPUT_ID, useKeyboard } from "./useKeyboard";

vi.mock("@/lib/api", () => ({
  hidePalette: vi.fn(),
}));

/** ⌘P押下を再現する KeyboardEvent を作る */
function dispatchCmdP(): void {
  window.dispatchEvent(
    new KeyboardEvent("keydown", { key: "p", metaKey: true, bubbles: true }),
  );
}

describe("useKeyboard: ⌘P (detail画面)", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("rAF発火前にviewがboardのままなら検索欄へフォーカスする", () => {
    vi.useFakeTimers();
    const input = document.createElement("input");
    input.id = SEARCH_INPUT_ID;
    document.body.appendChild(input);

    useAppStore.setState({ view: "detail" });
    renderHook(() => useKeyboard());

    dispatchCmdP();
    expect(useAppStore.getState().view).toBe("board");
    expect(document.activeElement).not.toBe(input);

    // rAFはまだ発火していないので、この時点ではフォーカスは移っていない想定。
    // rAF発火(次フレーム)まで進めてから確認する。
    vi.advanceTimersToNextFrame();

    expect(document.activeElement).toBe(input);

    input.remove();
  });

  it("rAF発火前に別viewへ遷移していたら、非表示の検索欄へフォーカスを奪わない", () => {
    // これがTask 2の修正対象のバグ: ⌘P後のrAF実行前に(例えば⌘Bでswitcherへ)
    // 遷移すると、修正前は非表示になった検索inputへ無条件にフォーカスしていた
    vi.useFakeTimers();
    const input = document.createElement("input");
    input.id = SEARCH_INPUT_ID;
    document.body.appendChild(input);

    useAppStore.setState({ view: "detail" });
    renderHook(() => useKeyboard());

    dispatchCmdP();
    expect(useAppStore.getState().view).toBe("board");

    // rAFが発火する前に、別のviewへ切り替わったことを再現する
    useAppStore.setState({ view: "switcher" });

    vi.advanceTimersToNextFrame();

    expect(document.activeElement).not.toBe(input);

    input.remove();
  });

  it("Escでボードへ戻るとhidePaletteが呼ばれる(既存挙動の回帰確認)", () => {
    useAppStore.setState({ view: "board" });
    renderHook(() => useKeyboard());

    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    );

    expect(hidePalette).toHaveBeenCalledTimes(1);
  });
});

/** Enter押下を再現する。composing=trueでIME変換中の確定キーを再現する */
function dispatchEnter(composing = false): void {
  window.dispatchEvent(
    new KeyboardEvent("keydown", {
      key: "Enter",
      isComposing: composing,
      bubbles: true,
    }),
  );
}

/**
 * モジュールスコープに残っているEnterの二度押し待機を解いておく。
 * (Enter以外のキーで解除される仕様を利用する。Shiftは他に副作用がない)
 */
function resetEnterPending(): void {
  window.dispatchEvent(new KeyboardEvent("keydown", { key: "Shift", bubbles: true }));
}

describe("useKeyboard: boardのEnterは二度押し", () => {
  it("検索文字列からの新規作成はEnter1回では走らず、2回目で走る", () => {
    const createTaskFromSearch = vi.fn(async () => {});
    useAppStore.setState({ view: "board", searchQuery: "買い物", selectedTaskId: null, createTaskFromSearch });
    renderHook(() => useKeyboard());
    resetEnterPending();

    dispatchEnter();
    expect(createTaskFromSearch).not.toHaveBeenCalled();

    dispatchEnter();
    expect(createTaskFromSearch).toHaveBeenCalledTimes(1);
  });

  it("1回目のEnterのあと検索文字列が変わったら、待機はやり直しになる", () => {
    const createTaskFromSearch = vi.fn(async () => {});
    useAppStore.setState({ view: "board", searchQuery: "買い", selectedTaskId: null, createTaskFromSearch });
    renderHook(() => useKeyboard());
    resetEnterPending();

    dispatchEnter();
    // IMEの変換確定などで文字列が変わったケース。古い待機のまま作成されては困る
    useAppStore.setState({ searchQuery: "買い物" });

    dispatchEnter();
    expect(createTaskFromSearch).not.toHaveBeenCalled();

    dispatchEnter();
    expect(createTaskFromSearch).toHaveBeenCalledTimes(1);
  });

  it("Enter以外のキーを挟むと待機が解除される", () => {
    const createTaskFromSearch = vi.fn(async () => {});
    useAppStore.setState({ view: "board", searchQuery: "買い物", selectedTaskId: null, createTaskFromSearch });
    renderHook(() => useKeyboard());
    resetEnterPending();

    dispatchEnter();
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));

    dispatchEnter();
    expect(createTaskFromSearch).not.toHaveBeenCalled();
  });

  it("IME変換中のEnterは待機にも数えない", () => {
    const createTaskFromSearch = vi.fn(async () => {});
    useAppStore.setState({ view: "board", searchQuery: "買い物", selectedTaskId: null, createTaskFromSearch });
    renderHook(() => useKeyboard());
    resetEnterPending();

    dispatchEnter(true);
    dispatchEnter();
    expect(createTaskFromSearch).not.toHaveBeenCalled();

    dispatchEnter();
    expect(createTaskFromSearch).toHaveBeenCalledTimes(1);
  });

  it("keyCode 229 のEnter(IME処理中)は待機にも数えない", () => {
    const createTaskFromSearch = vi.fn(async () => {});
    useAppStore.setState({ view: "board", searchQuery: "買い物", selectedTaskId: null, createTaskFromSearch });
    renderHook(() => useKeyboard());
    resetEnterPending();

    // isComposingを立てない環境で変換確定のEnterが届くケース
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", keyCode: 229, bubbles: true }));
    dispatchEnter();
    expect(createTaskFromSearch).not.toHaveBeenCalled();

    dispatchEnter();
    expect(createTaskFromSearch).toHaveBeenCalledTimes(1);
  });

  it("キーリピート(押しっぱなし)のEnterは2回目として扱わない", () => {
    const createTaskFromSearch = vi.fn(async () => {});
    useAppStore.setState({ view: "board", searchQuery: "買い物", selectedTaskId: null, createTaskFromSearch });
    renderHook(() => useKeyboard());
    resetEnterPending();

    dispatchEnter();
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", repeat: true, bubbles: true }));
    expect(createTaskFromSearch).not.toHaveBeenCalled();

    dispatchEnter();
    expect(createTaskFromSearch).toHaveBeenCalledTimes(1);
  });

  it("ウィンドウがフォーカスを失うと待機は破棄される", () => {
    const createTaskFromSearch = vi.fn(async () => {});
    useAppStore.setState({ view: "board", searchQuery: "買い物", selectedTaskId: null, createTaskFromSearch });
    renderHook(() => useKeyboard());
    resetEnterPending();

    dispatchEnter();
    // パレットが閉じる・他アプリへ移るなどでフォーカスを失ったケース
    window.dispatchEvent(new Event("blur"));

    dispatchEnter();
    expect(createTaskFromSearch).not.toHaveBeenCalled();
  });

  it("マウス・タッチ操作を挟むと待機は破棄される", () => {
    const createTaskFromSearch = vi.fn(async () => {});
    useAppStore.setState({ view: "board", searchQuery: "買い物", selectedTaskId: null, createTaskFromSearch });
    renderHook(() => useKeyboard());
    resetEnterPending();

    dispatchEnter();
    // パレット内のどこかをクリック/タップしたケース(ウィンドウのblurは起きない)
    window.dispatchEvent(new Event("pointerdown"));

    dispatchEnter();
    expect(createTaskFromSearch).not.toHaveBeenCalled();
  });

  it("選択中タスクの詳細もEnter2回で開く", () => {
    useAppStore.setState({ view: "board", searchQuery: "", selectedTaskId: "task-1" });
    renderHook(() => useKeyboard());
    resetEnterPending();

    dispatchEnter();
    expect(useAppStore.getState().view).toBe("board");

    dispatchEnter();
    expect(useAppStore.getState().view).toBe("detail");
  });
});
