import { describe, expect, it } from "vitest";
import { reflowStrayMarkdownTables } from "./markdownTableFix";

describe("reflowStrayMarkdownTables", () => {
  it("空行区切りになったテーブル行を1つの連続テーブルへ戻す", () => {
    const input = "| aa | bb |\n\n| --- | --- |\n\n| 1 | 2 |\n";

    expect(reflowStrayMarkdownTables(input)).toBe(
      "| aa | bb |\n| --- | --- |\n| 1 | 2 |\n",
    );
  });

  it("既に連続しているテーブルはそのまま変更しない", () => {
    const input = "| aa | bb |\n| --- | --- |\n| 1 | 2 |\n";

    expect(reflowStrayMarkdownTables(input)).toBe(input);
  });

  it("区切り行が無い場合は関係ない段落として扱いそのままにする", () => {
    const input = "定価は | 1000円 | です\n\n次の段落も | 別の話です";

    expect(reflowStrayMarkdownTables(input)).toBe(input);
  });

  it("空行が2つ以上挟まる場合は連結しない", () => {
    const input = "| aa | bb |\n\n\n| --- | --- |\n\n| 1 | 2 |\n";

    expect(reflowStrayMarkdownTables(input)).toBe(input);
  });

  it("テーブルの前後にある無関係な段落には影響しない", () => {
    const input =
      "前置きの段落です。\n\n| aa | bb |\n\n| --- | --- |\n\n| 1 | 2 |\n\n締めの段落です。";

    expect(reflowStrayMarkdownTables(input)).toBe(
      "前置きの段落です。\n\n| aa | bb |\n| --- | --- |\n| 1 | 2 |\n\n締めの段落です。",
    );
  });

  it("空文字列を渡しても例外にならない", () => {
    expect(reflowStrayMarkdownTables("")).toBe("");
  });

  it("fenced code block内のテーブル風の行+空行は連結せずそのままにする", () => {
    const input =
      "```\n| aa | bb |\n\n| --- | --- |\n\n| 1 | 2 |\n```\n";

    expect(reflowStrayMarkdownTables(input)).toBe(input);
  });

  it("fenced code blockの前後にある本物のテーブルは連結する(往復しても不変)", () => {
    const input =
      "| aa | bb |\n\n| --- | --- |\n\n| 1 | 2 |\n\n```\n| x | y |\n\n| --- | --- |\n```\n";

    const expected =
      "| aa | bb |\n| --- | --- |\n| 1 | 2 |\n\n```\n| x | y |\n\n| --- | --- |\n```\n";

    const once = reflowStrayMarkdownTables(input);
    expect(once).toBe(expected);
    // 往復しても不変(フェンス内は触らないので再適用しても変化しない)
    expect(reflowStrayMarkdownTables(once)).toBe(once);
  });

  it("言語指定付きのフェンス(```ts など)も開閉として認識する", () => {
    const input = "```ts\n| a | b |\n\n| --- | --- |\n```\n";

    expect(reflowStrayMarkdownTables(input)).toBe(input);
  });
});
