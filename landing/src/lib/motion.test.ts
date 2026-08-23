import { describe, expect, it } from "vitest";
import {
  clamp,
  demoState,
  DEMO_KEY_COUNT,
  range,
  stageState,
  trackProgress,
} from "./motion";

describe("clamp", () => {
  it("範囲内はそのまま返す", () => {
    expect(clamp(0.5, 0, 1)).toBe(0.5);
  });

  it("範囲外は端に丸める", () => {
    expect(clamp(-3, 0, 1)).toBe(0);
    expect(clamp(9, 0, 1)).toBe(1);
  });
});

describe("range", () => {
  it("区間の始点で0、終点で1になる", () => {
    expect(range(0.2, 0.2, 0.4)).toBe(0);
    expect(range(0.4, 0.2, 0.4)).toBe(1);
  });

  it("区間の中央で0.5になる", () => {
    expect(range(0.3, 0.2, 0.4)).toBeCloseTo(0.5);
  });

  it("区間外は0または1に丸める", () => {
    expect(range(0, 0.2, 0.4)).toBe(0);
    expect(range(1, 0.2, 0.4)).toBe(1);
  });

  it("幅ゼロの区間でもNaNを返さない", () => {
    expect(range(0.5, 0.3, 0.3)).toBe(1);
    expect(range(0.1, 0.3, 0.3)).toBe(0);
  });
});

describe("trackProgress", () => {
  it("トラックの先頭で0、末尾で1になる", () => {
    // トラック高さ3000、ビューポート600 → 移動量2400
    expect(trackProgress(0, 0, 3000, 600)).toBe(0);
    expect(trackProgress(2400, 0, 3000, 600)).toBe(1);
  });

  it("トラックの開始位置を差し引く", () => {
    expect(trackProgress(1200, 1200, 3000, 600)).toBe(0);
    expect(trackProgress(2400, 1200, 3000, 600)).toBeCloseTo(0.5);
  });

  it("トラックがビューポートより低いときは0を返す", () => {
    expect(trackProgress(100, 0, 400, 600)).toBe(0);
  });
});

describe("stageState", () => {
  it("先頭ではパレットがぼけて縮んでいる", () => {
    const s = stageState(0);
    expect(s.palette.blur).toBeGreaterThan(6);
    expect(s.palette.scale).toBeLessThan(1);
    expect(s.palette.opacity).toBe(0);
  });

  it("開き終えた直後はぼけが取れて等倍になる", () => {
    const s = stageState(0.12);
    expect(s.palette.blur).toBeCloseTo(0, 1);
    expect(s.palette.scale).toBeCloseTo(1, 2);
    expect(s.palette.opacity).toBeCloseTo(1, 2);
  });

  it("Statement区間ではパレットが縮んで減光する", () => {
    const open = stageState(0.12);
    const back = stageState(0.3);
    expect(back.palette.scale).toBeLessThan(open.palette.scale);
    expect(back.palette.opacity).toBeLessThan(open.palette.opacity);
    expect(back.statement.opacity).toBe(1);
  });

  it("Keyboard区間ではパレットが拡大して戻る", () => {
    const back = stageState(0.3);
    const fore = stageState(0.48);
    expect(fore.palette.scale).toBeGreaterThan(back.palette.scale);
    expect(fore.palette.opacity).toBeGreaterThan(back.palette.opacity);
    expect(fore.keyboard.opacity).toBe(1);
  });

  it("Heroのテキストは開いた直後に出て、Statementの前に消える", () => {
    expect(stageState(0.1).hero.opacity).toBeCloseTo(1, 2);
    expect(stageState(0.2).hero.opacity).toBe(0);
  });

  it("実演の進捗は0.50から始まり0.92で終わる", () => {
    expect(stageState(0.49).demo).toBe(0);
    expect(stageState(0.92).demo).toBe(1);
    expect(stageState(1).demo).toBe(1);
  });

  it("不透明度は常に0以上1以下に収まる", () => {
    for (let p = 0; p <= 1.0001; p += 0.01) {
      const s = stageState(p);
      for (const v of [
        s.palette.opacity,
        s.glowOpacity,
        s.hero.opacity,
        s.statement.opacity,
        s.keyboard.opacity,
      ]) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
      }
    }
  });

  it("パレットは先頭で下にオフセットしており、開き終えると中央に収まる", () => {
    expect(stageState(0).palette.y).toBeGreaterThan(0);
    expect(stageState(0.12).palette.y).toBeCloseTo(0, 5);
  });

  it("パレットはStatement区間で下へ退き、Keyboard区間で上へ戻る", () => {
    const open = stageState(0.12).palette.y;
    const back = stageState(0.3).palette.y;
    const fore = stageState(0.48).palette.y;
    expect(back).toBeGreaterThan(open);
    expect(fore).toBeLessThan(back);
  });

  it("Heroのテキストは開いた直後は動いておらず、上へ抜ける区間で負の値になる", () => {
    expect(stageState(0.1).hero.y).toBeCloseTo(0, 5);
    expect(stageState(0.22).hero.y).toBeLessThan(0);
  });

  it("Statementのテキストは区間の始点で20px下にあり、現れきると0に収束する", () => {
    expect(stageState(0.17).statement.y).toBe(20);
    expect(stageState(0.2).statement.y).toBeGreaterThan(0);
    expect(stageState(0.26).statement.y).toBeCloseTo(0, 5);
    expect(stageState(0.5).statement.y).toBeCloseTo(0, 5);
  });
});

describe("demoState", () => {
  it("実演が始まる前は何も光らず、何も選ばれていない", () => {
    const d = demoState(0);
    expect(d.litKey).toBe(-1);
    expect(d.selectedCard).toBe(-1);
    expect(d.chipOn).toBe(false);
    expect(d.cardMoved).toBe(false);
  });

  it("キーが順番に光る", () => {
    expect(demoState(0.05).litKey).toBe(0);
    expect(demoState(0.3).litKey).toBe(1);
    expect(demoState(0.5).litKey).toBe(2);
    expect(demoState(0.7).litKey).toBe(3);
  });

  it("litKeyはDEMO_KEY_COUNT未満の値しか返さない", () => {
    for (let d = 0; d <= 1.0001; d += 0.01) {
      expect(demoState(d).litKey).toBeLessThan(DEMO_KEY_COUNT);
    }
  });

  it("選択枠が上から順に移る", () => {
    expect(demoState(0.1).selectedCard).toBe(0);
    expect(demoState(0.3).selectedCard).toBe(1);
    expect(demoState(0.5).selectedCard).toBe(2);
  });

  it("タグが付いたあとにカードが移動する", () => {
    expect(demoState(0.55).chipOn).toBe(true);
    expect(demoState(0.55).cardMoved).toBe(false);
    expect(demoState(0.8).cardMoved).toBe(true);
  });
});
