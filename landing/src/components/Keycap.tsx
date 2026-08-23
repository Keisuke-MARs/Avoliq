interface KeycapProps {
  label: string;
  lit: boolean;
}

export function Keycap({ label, lit }: KeycapProps) {
  return (
    <span
      // キーの内容（矢印・⌘K・⌘→ 等）は Keyboard セクションの本文が説明する視覚的な言い換えなので、
      // スクリーンリーダーの読み上げ対象からは外す。
      aria-hidden="true"
      className={[
        // Tailwind v4 では -translate-y-0.5 は transform ではなくネイティブの CSS translate
        // プロパティを出力する。transition の対象には transform ではなく translate を指定する。
        "rounded-lg border px-3.5 py-2 text-sm transition-[background-color,border-color,translate] duration-200 ease-av",
        lit
          ? "-translate-y-0.5 border-av-azure/60 bg-av-blue/30"
          : "border-white/15 bg-white/[0.07]",
      ].join(" ")}
    >
      {label}
    </span>
  );
}
