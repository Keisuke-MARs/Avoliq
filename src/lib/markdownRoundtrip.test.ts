import { BlockNoteEditor } from "@blocknote/core";
import { describe, expect, it } from "vitest";
import { reflowStrayMarkdownTables } from "./markdownTableFix";

/**
 * BlockNote 0.54のMarkdown読み書き(tryParseMarkdownToBlocks / blocksToMarkdownLossy)が
 * テーブル・コードブロック・引用・チェックリスト・見出し・リストを正しく往復できることを担保する。
 *
 * BlockNoteEditor.create()はheadless(=DOMマウントなし)で動くため、jsdom環境でも
 * TaskDetail.tsxのuseCreateBlockNote()と同じ変換ロジックをそのままテストできる。
 * (TaskDetail.test.tsxではProseMirrorのビュー描画自体がjsdomで動かないためモックしているが、
 * Markdown変換だけを見る本テストではビューを介さないのでモック不要)
 */
describe("BlockNote Markdownの往復変換", () => {
  it("テーブルMarkdownをtableブロックへ変換し、書き戻しても表として保たれる", async () => {
    const editor = BlockNoteEditor.create();
    const md = ["| aa | bb |", "| --- | --- |", "| 1 | 2 |"].join("\n");

    const blocks = await editor.tryParseMarkdownToBlocks(md);

    expect(blocks).toHaveLength(1);
    expect(blocks[0].type).toBe("table");

    const back = await editor.blocksToMarkdownLossy(blocks);
    expect(back).toContain("| aa");
    expect(back).toContain("| bb");
    expect(back).toContain("| 1");
    expect(back).toContain("| 2");
  });

  it("エディタ内で手打ちしただけの`| |`はプレーンテキストのままだが、保存→再読込の往復でテーブル化される", async () => {
    const editor = BlockNoteEditor.create();

    // 手打ち直後を模した状態: テーブル記法の文字列がただの段落として1ブロックに入っている
    // (BlockNoteはタイプ中のパイプ記法をライブ変換するinput ruleを持たないため、
    //  この時点では見た目もプレーンテキストのまま=ユーザー報告の挙動と一致する)
    const typedAsPlainText = [
      { type: "paragraph", content: "| aa | bb |" },
      { type: "paragraph", content: "| --- | --- |" },
      { type: "paragraph", content: "| 1 | 2 |" },
    ];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    editor.replaceBlocks(editor.document, typedAsPlainText as any);

    // ここでcontent_mdとして保存される文字列を作る(TaskDetailのhandleEditorChangeと同じ変換)
    const savedMarkdown = await editor.blocksToMarkdownLossy(editor.document);

    // 3行がそれぞれ別ブロックだったため、書き出しは空行区切りのMarkdownになっている。
    // このままではBlockNote自身のテーブルパーサ(ヘッダー行の直後に区切り行を要求する)が
    // テーブルとして認識できないことをまず確認する
    expect(savedMarkdown).toBe("| aa | bb |\n\n| --- | --- |\n\n| 1 | 2 |\n");
    const withoutFix = await editor.tryParseMarkdownToBlocks(savedMarkdown);
    expect(withoutFix.some((block) => block.type === "table")).toBe(false);

    // 別タスクを開いて戻ってきた=再読込を模す(TaskDetailのuseEffectと同じ変換。
    // reflowStrayMarkdownTablesで空行を除去してから渡す)
    const reloaded = await editor.tryParseMarkdownToBlocks(
      reflowStrayMarkdownTables(savedMarkdown),
    );

    expect(reloaded.some((block) => block.type === "table")).toBe(true);
  });

  it("コードブロック・引用・区切り線・チェックリスト・見出し・リストを往復できる", async () => {
    const editor = BlockNoteEditor.create();
    const md = [
      "# 見出し",
      "",
      "本文の段落です。",
      "",
      "> 引用です",
      "",
      "```ts",
      "const x = 1;",
      "```",
      "",
      "- [ ] 未完了のタスク",
      "- [x] 完了したタスク",
      "",
      "- 箇条書き1",
      "- 箇条書き2",
      "",
      "1. 番号付き1",
      "2. 番号付き2",
      "",
      "---",
      "",
    ].join("\n");

    const blocks = await editor.tryParseMarkdownToBlocks(md);
    const types = blocks.map((block) => block.type);

    expect(types).toContain("heading");
    expect(types).toContain("paragraph");
    expect(types).toContain("quote");
    expect(types).toContain("codeBlock");
    expect(types).toContain("checkListItem");
    expect(types).toContain("bulletListItem");
    expect(types).toContain("numberedListItem");
    expect(types).toContain("divider");

    const back = await editor.blocksToMarkdownLossy(blocks);

    expect(back).toContain("# 見出し");
    expect(back).toContain("> 引用です");
    expect(back).toContain("```ts");
    expect(back).toContain("const x = 1;");
    expect(back).toContain("[ ] 未完了のタスク");
    expect(back).toContain("[x] 完了したタスク");
    expect(back).toContain("箇条書き1");
    expect(back).toContain("番号付き1");
  });
});
