import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { hidePalette } from "@/lib/api";
import { registerDetailBridge } from "@/lib/detailBridge";
import { initialAppState, useAppStore } from "@/store/appStore";
import { statuses, tags, tasks } from "@/test/fixtures";
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

describe("useKeyboard: ⌘K (タグパレット)", () => {
  afterEach(() => {
    useAppStore.setState(initialAppState);
    registerDetailBridge(null);
  });

  it("board で ⌘K はタグパレットを開く", () => {
    useAppStore.setState({ ...initialAppState, tasks, statuses, tags, selectedTaskId: "t-a" });
    renderHook(() => useKeyboard());

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true }));

    expect(useAppStore.getState().tagPaletteOpen).toBe(true);
  });

  it("board で ⌘K は defaultPrevented でも横取りする（boardにガードが無いことの担保）", () => {
    // board にはBlockNoteエディタが無いのでdefaultPreventedガードは不要、という設計になっている。
    // 「対称性のため」とboard側にもガードを足す誤修正が入った瞬間にこのテストが赤くなって気付ける。
    useAppStore.setState({ ...initialAppState, tasks, statuses, tags, selectedTaskId: "t-a" });
    renderHook(() => useKeyboard());
    const event = new KeyboardEvent("keydown", { key: "k", metaKey: true, cancelable: true });
    event.preventDefault();

    window.dispatchEvent(event);

    expect(useAppStore.getState().tagPaletteOpen).toBe(true);
  });

  it("board でカード未選択の ⌘K は何も起きない", () => {
    useAppStore.setState({ ...initialAppState, tasks, statuses, tags, selectedTaskId: null });
    renderHook(() => useKeyboard());

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true }));

    expect(useAppStore.getState().tagPaletteOpen).toBe(false);
  });

  it("detail画面でBlockNoteが先に処理した⌘K(defaultPrevented)は横取りしない", () => {
    // CreateLinkButtonがeditorDOMElement上でpreventDefaultした状況を再現する。
    // この競合はBlockNoteが実際に動く detail 画面でのみ起こりうるので、board ではなく
    // detail の状態で検証する(board側のhandleMetaKeyにはBlockNoteと衝突する相手がいないため
    // defaultPreventedガードを持たない)。
    useAppStore.setState({
      ...initialAppState,
      tasks,
      statuses,
      tags,
      selectedTaskId: "t-a",
      view: "detail",
    });
    renderHook(() => useKeyboard());
    const event = new KeyboardEvent("keydown", { key: "k", metaKey: true, cancelable: true });
    event.preventDefault();

    window.dispatchEvent(event);

    expect(useAppStore.getState().tagPaletteOpen).toBe(false);
  });

  it("タグパレット表示中は board のキーを処理しない", () => {
    useAppStore.setState({
      ...initialAppState,
      tasks,
      statuses,
      tags,
      selectedTaskId: "t-a",
      tagPaletteOpen: true,
    });
    renderHook(() => useKeyboard());

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown" }));

    // タグパレット側が処理するので、盤面のカーソルは動かない
    expect(useAppStore.getState().selectedTaskId).toBe("t-a");
  });

  it("detail で ⌘K は flushDetail を呼んでからタグパレットを開く", () => {
    const flush = vi.fn<() => void>();
    registerDetailBridge({ flush, focusTitle: vi.fn<() => void>() });
    useAppStore.setState({
      ...initialAppState,
      tasks,
      statuses,
      tags,
      selectedTaskId: "t-a",
      view: "detail",
    });
    renderHook(() => useKeyboard());

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true }));

    expect(flush).toHaveBeenCalledTimes(1);
    expect(useAppStore.getState().tagPaletteOpen).toBe(true);
  });
});
