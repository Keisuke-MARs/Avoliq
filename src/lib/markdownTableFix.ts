/**
 * BlockNote 0.54は「| a | b |」のようなパイプ区切りテーブル記法をタイプ中にライブ変換する
 * input ruleを持たない。そのためユーザーがエディタ内で1行ずつEnterを押しながら手打ちすると、
 * 各行がバラバラの段落ブロックになる。
 *
 * この状態でBlockNoteEditor.blocksToMarkdownLossy()により保存すると、段落ブロックはそれぞれ
 * 空行区切りのMarkdownとして書き出されてしまう
 * (例: "| aa | bb |\n\n| --- | --- |\n\n| 1 | 2 |\n")。
 *
 * ところがBlockNote本体のMarkdownパーサ(tryParseTable)は「ヘッダー行の直後の行が区切り行で
 * あること」を要求しており、間に空行が挟まっていると同じ配列インデックスに来ないため、
 * 再読込してもテーブルとして認識されない。つまり保存→再読込だけでは自動修復されない。
 *
 * この関数はcontent_mdをBlockNoteへ渡す直前に呼び、単一の空行だけで区切られたテーブル行らしい
 * 行が連続している箇所を見つけ、それがBlockNote自身のテーブル判定条件
 * (1行目に`|`を含み、2行目が区切り行の形をしている)を満たす場合にだけ、間の空行を除去して
 * 1つの連続したテーブルへ復元する。判定条件をBlockNote側とそろえているため、無関係な文章
 * (例: 表とは関係ない場所にたまたま`|`が1つだけ現れる行)を誤ってテーブル化することはない。
 */

// BlockNote本体のtryParseTableと同じ区切り行判定(dist/style.cssではなくmarkdownToHtml.ts由来)
const SEPARATOR_ROW_RE = /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/;

function isNonBlankTableRowShape(line: string): boolean {
  return line.trim() !== "" && line.includes("|");
}

function isSeparatorRowShape(line: string): boolean {
  return line.includes("|") && SEPARATOR_ROW_RE.test(line);
}

export function reflowStrayMarkdownTables(markdown: string): string {
  const lines = markdown.split("\n");
  const result: string[] = [];
  let i = 0;

  while (i < lines.length) {
    if (isNonBlankTableRowShape(lines[i])) {
      // 単一の空行だけを挟んで「行っぽい」行が続く限り候補グループへ集める
      const group: string[] = [lines[i]];
      let j = i + 1;
      while (
        j + 1 < lines.length &&
        lines[j].trim() === "" &&
        isNonBlankTableRowShape(lines[j + 1])
      ) {
        group.push(lines[j + 1]);
        j += 2;
      }

      // 2行目(ヘッダーの次)が区切り行の形なら、BlockNote自身が連続していればテーブルとして
      // 認識できる並びなので、間の空行を除去して連結する
      if (group.length >= 2 && isSeparatorRowShape(group[1])) {
        result.push(...group);
        i = j;
        continue;
      }
    }

    result.push(lines[i]);
    i += 1;
  }

  return result.join("\n");
}
