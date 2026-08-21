import { useLayoutEffect, useState } from "react";
import type { RefObject } from "react";

/** チップ間の隙間(px)。呼び出し側の className の gap 値と一致させること */
export const CHIP_GAP = 3;

/** 「+n」チップの基礎幅(px)。左右padding・角丸・"+"記号ぶんの見積もり */
const MORE_CHIP_BASE_WIDTH = 20;
/** 「+n」チップの数字1桁あたりの見積もり幅(px)。9.5pxフォントでの概算 */
const MORE_CHIP_DIGIT_WIDTH = 6;

/**
 * 非表示件数の桁数に応じて「+n」チップの必要幅を見積もる。
 * タグ数に上限が無い設計のため、非表示件数は2桁以上(+15など)になりうる。
 * 固定幅のままだと桁が増えたときに「+n」の右端が欠けるので、桁数ぶん幅を足す。
 * 例: 隠れているのが9件までなら26px、15件(2桁)なら32px。
 */
function estimateMoreChipWidth(hiddenCount: number): number {
  const digits = String(hiddenCount).length;
  return MORE_CHIP_BASE_WIDTH + digits * MORE_CHIP_DIGIT_WIDTH;
}

export interface UseChipOverflowResult {
  /** 表示できる個数。null="まだ測っていない"で、呼び出し側は全件描画すること */
  visibleCount: number | null;
}

/**
 * 横1行に並ぶチップ列の「あふれ」を実測して、表示できる個数を返す。
 * 文字数ではなく実測の幅で折り返し判定をし、収まらない分は呼び出し側が「+n」として畳む前提。
 *
 * @param containerRef チップを並べる行要素のref。この要素のchildrenを1つずつ実測する
 * @param resetKey 測定をやり直すべきタイミングを表すキー。
 *   描画される中身(id・表示名など、幅に影響しうるもの)が変われば必ず変わる値を渡すこと。
 *   ここをidだけにすると、名前だけ変わるケース(改名など)で古い測定値のまま
 *   表示が固定されてしまう。
 */
export function useChipOverflow(
  containerRef: RefObject<HTMLElement | null>,
  resetKey: string,
): UseChipOverflowResult {
  // null = 「まだ測っていない」。この間は呼び出し側が全チップを描画し、それを実測する
  const [visibleCount, setVisibleCount] = useState<number | null>(null);

  // resetKeyが変わったら測り直す
  useLayoutEffect(() => {
    setVisibleCount(null);
  }, [resetKey]);

  useLayoutEffect(() => {
    // 測定は「全チップが描かれている」ときだけ行う（ここで早期returnするのでループしない）
    if (visibleCount !== null) return;
    const row = containerRef.current;
    if (row === null) return;
    const chips = Array.from(row.children) as HTMLElement[];
    if (chips.length === 0) return;

    const limit = row.clientWidth;
    // jsdom は offsetWidth / clientWidth が常に0で測れない。省略せず全部見せる
    if (limit === 0) {
      setVisibleCount(chips.length);
      return;
    }

    let used = 0;
    let fit = 0;
    for (const chip of chips) {
      const next = used + (fit === 0 ? 0 : CHIP_GAP) + chip.offsetWidth;
      if (next > limit) break;
      used = next;
      fit += 1;
    }
    if (fit >= chips.length) {
      setVisibleCount(chips.length);
      return;
    }
    // 「+n」を置く余白が無ければ、入るまで1つずつ削る。
    // 削るたびに非表示件数の桁数が変わりうるので、見積もり幅もそのつど計算し直す
    while (
      fit > 1 &&
      used + CHIP_GAP + estimateMoreChipWidth(chips.length - fit) > limit
    ) {
      used -= chips[fit - 1].offsetWidth + CHIP_GAP;
      fit -= 1;
    }
    setVisibleCount(Math.max(1, fit));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleCount, resetKey]);

  return { visibleCount };
}
