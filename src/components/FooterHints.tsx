import type { View } from "@/types";

type Hint = readonly [key: string, label: string];

/**
 * viewごとに出すキーボードヒント。設計書のキーボード操作仕様と1対1で対応させる。
 * boardの並びは実装コントラクトのキーマップ（⌘↑↓並び替え・⌘Z復元・⌘N新規作成・⌘P検索 を含む）に揃えてある。
 */
const HINTS: Record<View, readonly Hint[]> = {
  board: [
    ["↑↓←→", "移動"],
    ["Enter", "開く / 作成"],
    ["⌘←→", "ステータス"],
    ["⌘↑↓", "並び替え"],
    ["⌘⌫", "削除"],
    ["⌘Z", "元に戻す"],
    ["⌘N", "新規作成"],
    ["⌘P", "検索"],
    ["⌘K", "タグ"],
    ["⌘B", "ボード切替"],
    ["⌘,", "設定"],
    ["Esc", "閉じる"],
  ],
  detail: [
    ["⌘←→", "ステータス"],
    ["⌘T", "タイトル"],
    ["⌘K", "タグ"],
    ["⌘N", "新規作成"],
    ["⌘P", "検索"],
    ["Esc", "ボードに戻る"],
  ],
  switcher: [
    ["↑↓", "選択"],
    ["Enter", "切替"],
    ["N", "新規ボード"],
    ["R", "改名"],
    ["⌘⌫", "削除"],
    ["Esc", "戻る"],
  ],
  settings: [
    ["↑↓", "選択"],
    ["Enter", "改名"],
    ["C", "色"],
    ["⌘↑↓", "並び替え"],
    ["N", "追加"],
    ["⌘⌫", "削除"],
    ["Tab", "タブ切替"],
    ["Esc", "戻る"],
  ],
};

/** パレット下部に常時表示するキーボードヒント */
export function FooterHints({ view }: { view: View }) {
  return (
    <footer
      data-testid="keyboard-hints"
      className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t px-4 py-2 text-[11px]"
      style={{
        borderColor: "var(--st-palette-border)",
        color: "var(--st-text-secondary)",
      }}
    >
      {HINTS[view].map(([key, label]) => (
        <span key={key} className="flex items-center gap-1">
          <kbd
            className="rounded border px-1.5 py-0.5 font-medium"
            style={{
              borderColor: "var(--st-palette-border)",
              backgroundColor: "var(--st-surface-hover)",
            }}
          >
            {key}
          </kbd>
          <span>{label}</span>
        </span>
      ))}
    </footer>
  );
}
