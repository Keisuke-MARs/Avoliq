import { describe, expect, it } from "vitest";
import { formatAccelerator, toAccelerator } from "./accelerator";

const base = {
  metaKey: false,
  ctrlKey: false,
  altKey: false,
  shiftKey: false,
};

describe("toAccelerator", () => {
  it("⌥SpaceをAlt+Spaceへ変換する", () => {
    expect(toAccelerator({ ...base, code: "Space", altKey: true })).toBe(
      "Alt+Space",
    );
  });

  it("⌘⇧KをSuper+Shift+Kへ変換する", () => {
    expect(
      toAccelerator({ ...base, code: "KeyK", metaKey: true, shiftKey: true }),
    ).toBe("Shift+Super+K");
  });

  it("数字キーを変換する", () => {
    expect(toAccelerator({ ...base, code: "Digit1", ctrlKey: true })).toBe(
      "Control+1",
    );
  });

  it("ファンクションキーは修飾なしでも受け付ける", () => {
    expect(toAccelerator({ ...base, code: "F5" })).toBe("F5");
  });

  it("修飾キーなしの通常キーはnullを返す", () => {
    expect(toAccelerator({ ...base, code: "KeyA" })).toBeNull();
  });

  it("修飾キー単体はnullを返す", () => {
    expect(toAccelerator({ ...base, code: "ShiftLeft", shiftKey: true })).toBeNull();
  });
});

describe("formatAccelerator", () => {
  it("macOSの記号表記へ整形する", () => {
    expect(formatAccelerator("Alt+Space")).toBe("⌥Space");
    expect(formatAccelerator("Shift+Super+K")).toBe("⇧⌘K");
  });
});
