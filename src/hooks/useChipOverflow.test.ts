import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useChipOverflow } from "@/hooks/useChipOverflow";
import type { RefObject } from "react";

/**
 * テスト用の行要素を作る。jsdomではoffsetWidth/clientWidthが常に0で測れないため、
 * definePropertyで実測値を固定してやる。
 */
function makeRow(chipWidths: number[], rowWidth: number): RefObject<HTMLDivElement | null> {
  const row = document.createElement("div");
  Object.defineProperty(row, "clientWidth", { value: rowWidth, configurable: true });
  for (const width of chipWidths) {
    const chip = document.createElement("span");
    Object.defineProperty(chip, "offsetWidth", { value: width, configurable: true });
    row.appendChild(chip);
  }
  return { current: row };
}

describe("useChipOverflow", () => {
  it("全部入るときは全件表示になる", () => {
    const containerRef = makeRow([20, 20, 20], 100);

    const { result } = renderHook(() => useChipOverflow(containerRef, "key-1"));

    expect(result.current.visibleCount).toBe(3);
  });

  it("入りきらないときは+nの余白を確保して切り詰める", () => {
    // 3チップ(各30px, gap3px) = 96px。行幅60pxなら1個目(30px)しか入らず、
    // 残り2つは"+2"(1桁)に畳まれる想定
    const containerRef = makeRow([30, 30, 30], 60);

    const { result } = renderHook(() => useChipOverflow(containerRef, "key-1"));

    expect(result.current.visibleCount).toBe(1);
  });

  it("clientWidthが0(jsdom)のときは全件表示にフォールバックする", () => {
    const containerRef = makeRow([9999, 9999], 0);

    const { result } = renderHook(() => useChipOverflow(containerRef, "key-1"));

    expect(result.current.visibleCount).toBe(2);
  });

  it("resetKeyが変わると測り直す", () => {
    const containerRef = makeRow([20, 20, 20], 100);
    const { result, rerender } = renderHook(
      ({ key }: { key: string }) => useChipOverflow(containerRef, key),
      { initialProps: { key: "key-1" } },
    );
    expect(result.current.visibleCount).toBe(3);

    // 行の中身を差し替えて、今度は1個しか入らない幅にする
    containerRef.current!.innerHTML = "";
    Object.defineProperty(containerRef.current, "clientWidth", {
      value: 10,
      configurable: true,
    });
    for (const width of [30, 30, 30]) {
      const chip = document.createElement("span");
      Object.defineProperty(chip, "offsetWidth", { value: width, configurable: true });
      containerRef.current!.appendChild(chip);
    }

    // keyが変わらなければ再測定しないはず(measured済みのため早期return)
    rerender({ key: "key-1" });
    expect(result.current.visibleCount).toBe(3);

    // keyを変えると再測定され、新しい幅を反映する
    rerender({ key: "key-2" });
    expect(result.current.visibleCount).toBe(1);
  });

  it("非表示件数が2桁になっても+nチップの余白がはみ出さない(桁数を見積もりに反映する回帰テスト)", () => {
    // 15個・各2px幅、gapは内部固定の3px。行幅53pxという際どい値で、
    // 「+n」の見積もり幅が1桁固定(26px)のままだと fit=5(非表示10件=2桁)で
    // 止まってしまい、実際には32px必要な"+10"がはみ出す。
    // 桁数を見積もりに反映していれば fit=4(非表示11件)まで削られて収まる。
    const chipWidths = Array(15).fill(2);
    const containerRef = makeRow(chipWidths, 53);

    const { result } = renderHook(() => useChipOverflow(containerRef, "key-1"));

    expect(result.current.visibleCount).toBe(4);
  });
});
