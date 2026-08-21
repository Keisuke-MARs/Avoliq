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
