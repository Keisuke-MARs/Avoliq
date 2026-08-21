import { describe, expect, it } from "vitest";
import { TAG_COLORS, tagChipStyle } from "@/lib/tagPalette";

describe("tagChipStyle", () => {
  it("通常のカードでは薄塗りの地と濃い同系色の文字になる", () => {
    const style = tagChipStyle("#7EA9E8", false, false);

    expect(style).toEqual({ backgroundColor: "#7EA9E838", color: "#4A7CC4" });
  });

  it("ダークモードでは地をさらに薄くし、文字はタグ色そのものにする", () => {
    const style = tagChipStyle("#7EA9E8", false, true);

    expect(style).toEqual({ backgroundColor: "#7EA9E82E", color: "#7EA9E8" });
  });

  it("選択中カードの上ではタグ色を捨てて白に一本化する", () => {
    // ステータス色のベタ塗りの上ではどのタグ色も濁るため
    const style = tagChipStyle("#7EA9E8", true, false);

    expect(style).toEqual({ backgroundColor: "rgba(255,255,255,0.22)", color: "#fff" });
  });

  it("プリセットに無い色でも落ちず、文字色はその色をそのまま使う", () => {
    const style = tagChipStyle("#123456", false, false);

    expect(style).toEqual({ backgroundColor: "#12345638", color: "#123456" });
  });

  it("色の指定は大文字小文字を区別しない", () => {
    const style = tagChipStyle("#7ea9e8", false, false);

    expect(style.color).toBe("#4A7CC4");
  });
});

describe("TAG_COLORS", () => {
  it("9色ある", () => {
    expect(TAG_COLORS).toHaveLength(9);
  });

  it("色の重複が無い", () => {
    const values = TAG_COLORS.map((c) => c.value);

    expect(new Set(values).size).toBe(values.length);
  });
});
