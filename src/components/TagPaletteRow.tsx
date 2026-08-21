import { Check } from "lucide-react";
import type { RefObject } from "react";
import type { Tag } from "@/types";

/** 1行分の表示データ */
export interface TagRow {
  tag: Tag;
  attached: boolean;
  count: number;
}

export interface TagPaletteRowProps {
  row: TagRow;
  /** キーボードカーソルの位置にあるか */
  highlighted: boolean;
  /** このタグが改名中かどうか */
  isRenaming: boolean;
  renameValue: string;
  onRenameValueChange: (value: string) => void;
  renameInputRef: RefObject<HTMLInputElement | null>;
  /**
   * list モードのときだけ true。rename / confirm-delete 中は false にして、
   * どの行のクリックもトグルに繋がらないようにする
   * (改名中の行自身のクリックも含め、isRenaming による個別判定はしない。
   * 「今クリックした行が改名中の行か」ではなく「今何らかの行が改名中か」で止める必要があるため。
   * ただしフォーカス保護(mousedownのpreventDefault)はこれとは別に isRenaming で判定する。
   * 改名中に他の行をクリックしたとき、preventDefaultしないと改名入力欄からフォーカスが
   * 抜けてしまい、以後Escなどのキー操作が改名入力欄に届かなくなる)。
   */
  clickable: boolean;
  onActivate: () => void;
  onRenameCommit: () => void;
  onRenameCancel: () => void;
}

/** タグパレットの1行。付け外しの表示と、インライン改名を担当する。 */
export function TagPaletteRow({
  row,
  highlighted,
  isRenaming,
  renameValue,
  onRenameValueChange,
  renameInputRef,
  clickable,
  onActivate,
  onRenameCommit,
  onRenameCancel,
}: TagPaletteRowProps) {
  return (
    <div
      id={`tag-palette-option-${row.tag.id}`}
      role="option"
      // aria-selectedはキーボードカーソルの位置(BoardSwitcher等と同じ意味)。
      // 付与済みかどうかはaria-checkedで別途表す。
      aria-selected={highlighted}
      aria-checked={row.attached}
      data-testid="tag-palette-row"
      data-highlighted={highlighted ? "true" : "false"}
      // mousedownのデフォルト動作(フォーカス移動)を止め、今のフォーカス(検索入力欄 or 改名入力欄)を死守する。
      // 自分自身が改名中の行のときだけ外し、改名入力欄へ普通にクリック・カーソル移動できるようにする。
      onMouseDown={isRenaming ? undefined : (e) => e.preventDefault()}
      // クリックでのトグルは list モードのときだけ(改名中は自分の行も他の行も反応しない)
      onClick={clickable ? onActivate : undefined}
      className={`flex cursor-default items-center gap-2 rounded-md px-2 py-1 text-[12px] ${
        highlighted ? "st-row-selected" : ""
      }`}
      style={{ color: "var(--st-text-primary)" }}
    >
      <span
        className="h-1.5 w-1.5 shrink-0 rounded-full"
        style={{ backgroundColor: row.tag.color }}
      />
      <span className="flex w-3 shrink-0 items-center justify-center">
        {row.attached && (
          <Check size={11} style={{ color: "var(--st-text-secondary)" }} />
        )}
      </span>
      {isRenaming ? (
        <input
          ref={renameInputRef}
          data-testid="tag-palette-rename-input"
          aria-label="タグ名を変更"
          value={renameValue}
          onChange={(e) => onRenameValueChange(e.target.value)}
          onKeyDown={(event) => {
            // 親(dialogコンテナ)や、その先のwindow側ハンドラへ漏らさない
            event.stopPropagation();
            // IMEが処理中のキーには触らない(本格的なIME防御はTask 16で入れる)
            if (event.nativeEvent.isComposing || event.keyCode === 229) return;
            if (event.key === "Escape") {
              event.preventDefault();
              onRenameCancel();
              return;
            }
            if (event.key === "Enter") {
              event.preventDefault();
              // 素のEnterは変換確定と区別できないので確定させない
              if (!event.metaKey) return;
              onRenameCommit();
            }
          }}
          className="st-input min-w-0 flex-1 bg-transparent outline-none"
          style={{ color: "var(--st-text-primary)" }}
        />
      ) : (
        <span className="min-w-0 flex-1 truncate">{row.tag.name}</span>
      )}
      <span className="shrink-0 tabular-nums text-[10px]" style={{ color: "var(--st-text-tertiary)" }}>
        {row.count}
      </span>
    </div>
  );
}
