import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "@/lib/api";
import { hidePalette } from "@/lib/api";
import { registerDetailBridge } from "@/lib/detailBridge";
import { initialAppState, useAppStore } from "@/store/appStore";
import { statuses, tags, tasks } from "@/test/fixtures";
import type { Task } from "@/types";
import { SEARCH_INPUT_ID, useKeyboard } from "./useKeyboard";

vi.mock("@/lib/api", () => ({
  hidePalette: vi.fn(),
  taskMove: vi.fn(),
  taskDelete: vi.fn(),
  taskRestore: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
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

describe("useKeyboard: ⇧付きの⌘矢印はOS標準のテキスト選択に譲る", () => {
  afterEach(() => {
    useAppStore.setState(initialAppState);
  });

  /** 「進行中(st-doing)のカードを選んだ状態」を作る */
  function selectDoingCard(view: "board" | "detail"): void {
    useAppStore.setState({
      ...initialAppState,
      tasks,
      statuses,
      tags,
      selectedTaskId: "t-d",
      view,
    });
  }

  /** キー押下を再現し、preventDefaultされたかどうかを返す */
  function press(key: string, modifiers: { shiftKey?: boolean }): boolean {
    const event = new KeyboardEvent("keydown", {
      key,
      metaKey: true,
      cancelable: true,
      ...modifiers,
    });
    window.dispatchEvent(event);
    return event.defaultPrevented;
  }

  /** 選択中のカード(t-d)が今どのステータスに居るか */
  function statusOfSelected(): string | undefined {
    return useAppStore.getState().tasks.find((t) => t.id === "t-d")?.statusId;
  }

  it.each([
    { view: "detail" as const, key: "ArrowLeft" },
    { view: "detail" as const, key: "ArrowRight" },
    { view: "board" as const, key: "ArrowLeft" },
    { view: "board" as const, key: "ArrowRight" },
  ])("$view で ⌘⇧$key はステータスを変えずエディタ/入力欄に渡す", ({ view, key }) => {
    // ⌘⇧←→ は macOS 標準の「行頭/行末まで選択」。preventDefaultすると選択が奪われる
    selectDoingCard(view);
    renderHook(() => useKeyboard());

    const prevented = press(key, { shiftKey: true });

    expect(prevented).toBe(false);
    expect(statusOfSelected()).toBe("st-doing");
  });

  it.each([
    { view: "detail" as const, key: "ArrowLeft", expected: "st-todo" },
    { view: "detail" as const, key: "ArrowRight", expected: "st-check" },
    { view: "board" as const, key: "ArrowLeft", expected: "st-todo" },
    { view: "board" as const, key: "ArrowRight", expected: "st-check" },
  ])("$view で ⇧なしの ⌘$key は従来どおりステータスを変える", ({ view, key, expected }) => {
    selectDoingCard(view);
    renderHook(() => useKeyboard());

    const prevented = press(key, {});

    expect(prevented).toBe(true);
    expect(statusOfSelected()).toBe(expected);
  });

  it.each(["ArrowUp", "ArrowDown"])(
    "board で ⌘⇧%s は並び替えを起こさずテキスト選択に渡す",
    (key) => {
      // ⌘⇧↑↓ は macOS 標準の「先頭/末尾まで選択」。検索欄で奪われないようにする
      selectDoingCard("board");
      renderHook(() => useKeyboard());

      const prevented = press(key, { shiftKey: true });

      expect(prevented).toBe(false);
      expect(useAppStore.getState().tasks.find((t) => t.id === "t-d")?.position).toBe(0);
    },
  );

  it("board で ⇧なしの ⌘↓ は従来どおりレーン内で並び替える", () => {
    selectDoingCard("board");
    renderHook(() => useKeyboard());

    const prevented = press("ArrowDown", {});

    expect(prevented).toBe(true);
    expect(useAppStore.getState().tasks.find((t) => t.id === "t-d")?.position).toBe(1);
  });

  it.each(["ArrowUp", "ArrowDown"])("detail で ⌘⇧%s は本文の選択に渡す", (key) => {
    // detail は ⌘↑↓ 自体を扱っていないので元から素通りするはず。
    // 将来 detail に並び替えを足す人が ⇧ ガードを忘れたら、このテストが赤くなって気付ける
    selectDoingCard("detail");
    renderHook(() => useKeyboard());

    const prevented = press(key, { shiftKey: true });

    expect(prevented).toBe(false);
    expect(useAppStore.getState().tasks.find((t) => t.id === "t-d")?.position).toBe(0);
  });
});

describe("useKeyboard: board でカード未選択のときは入力欄のキー操作を優先する", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    useAppStore.setState(initialAppState);
  });

  /** フィクスチャから指定idのタスクを取り出す(APIの戻り値のスタブに使う) */
  function taskOf(id: string): Task {
    const task = tasks.find((t) => t.id === id);
    if (task === undefined) throw new Error(`fixture task not found: ${id}`);
    return task;
  }

  /** キー押下を再現し、preventDefaultされたかどうかを返す */
  function pressMeta(key: string, modifiers: { shiftKey?: boolean } = {}): boolean {
    const event = new KeyboardEvent("keydown", {
      key,
      metaKey: true,
      cancelable: true,
      ...modifiers,
    });
    window.dispatchEvent(event);
    return event.defaultPrevented;
  }

  it.each(["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Backspace"])(
    "カード未選択の ⌘%s は空振りするだけなので検索欄へ譲る",
    (key) => {
      // カード未選択 = 検索欄にキャレットがある状態。ストア側はどれも早期returnするのに
      // preventDefaultだけ残ると、行頭/行末への移動や行頭までの削除が死んでしまう
      useAppStore.setState({ ...initialAppState, tasks, statuses, tags, selectedTaskId: null });
      renderHook(() => useKeyboard());

      const prevented = pressMeta(key);

      expect(prevented).toBe(false);
      expect(useAppStore.getState().tasks).toEqual(tasks);
    },
  );

  it("カード選択中の ⌘⌫ は従来どおり削除する", () => {
    vi.mocked(api.taskDelete).mockResolvedValue(taskOf("t-d"));
    useAppStore.setState({ ...initialAppState, tasks, statuses, tags, selectedTaskId: "t-d" });
    renderHook(() => useKeyboard());

    const prevented = pressMeta("Backspace");

    expect(prevented).toBe(true);
    expect(api.taskDelete).toHaveBeenCalledWith("t-d");
  });

  it("⌘⇧Z は標準のredoなので復元を走らせず入力欄へ譲る", () => {
    // case "z" / "Z" は Caps Lock 対策。⇧ 付きまで拾うと検索欄の redo を奪ってしまう
    useAppStore.setState({ ...initialAppState, tasks, statuses, tags, lastDeletedTaskId: "t-f" });
    renderHook(() => useKeyboard());

    const prevented = pressMeta("Z", { shiftKey: true });

    expect(prevented).toBe(false);
    expect(api.taskRestore).not.toHaveBeenCalled();
  });

  it("⇧なしの ⌘Z は従来どおり削除を取り消す", () => {
    vi.mocked(api.taskRestore).mockResolvedValue(taskOf("t-f"));
    useAppStore.setState({ ...initialAppState, tasks, statuses, tags, lastDeletedTaskId: "t-f" });
    renderHook(() => useKeyboard());

    const prevented = pressMeta("z");

    expect(prevented).toBe(true);
    expect(api.taskRestore).toHaveBeenCalledWith("t-f");
  });
});
