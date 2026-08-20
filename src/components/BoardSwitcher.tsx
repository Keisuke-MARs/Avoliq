import { Check, Plus } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useAppStore } from "../store/appStore";

/**
 * ボードスイッチャー(⌘Bで開く)。
 * ↑↓で選択、Enterで切替。リスト末尾の「新規ボード」で作成に入る。
 */
export function BoardSwitcher() {
  const boards = useAppStore((state) => state.boards);
  const currentBoardId = useAppStore((state) => state.currentBoardId);
  const selectBoard = useAppStore((state) => state.selectBoard);
  const setView = useAppStore((state) => state.setView);

  // インデックスが boards.length のときは「新規ボード」項目を指す
  const [index, setIndex] = useState(() => {
    const found = boards.findIndex((board) => board.id === currentBoardId);
    return found >= 0 ? found : 0;
  });
  const containerRef = useRef<HTMLDivElement>(null);

  // 開いた直後からキーを受け取れるようにフォーカスする
  useEffect(() => {
    containerRef.current?.focus();
  }, []);

  const openBoard = (boardId: string) => {
    void selectBoard(boardId);
    setView("board");
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const lastIndex = boards.length; // 「新規ボード」項目の位置

    // ここで処理したキーは window 側の useKeyboard フォールバックへ伝播させない。
    // 伝播させたままだと、setView("board") で view が切り替わった直後に
    // window の keydown ハンドラが最新の view("board")を見て handleBoardKey を
    // 二重発火させてしまう（Escでの意図しない hidePalette 呼び出し等）ため。
    if (event.metaKey && /^[1-9]$/.test(event.key)) {
      const target = boards[Number(event.key) - 1];
      if (target !== undefined) {
        event.preventDefault();
        event.stopPropagation();
        openBoard(target.id);
      }
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      setView("board");
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      event.stopPropagation();
      setIndex((prev) => Math.min(prev + 1, lastIndex));
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      event.stopPropagation();
      setIndex((prev) => Math.max(prev - 1, 0));
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      event.stopPropagation();
      const target = boards[index];
      if (target !== undefined) openBoard(target.id);
    }
  };

  return (
    <div
      ref={containerRef}
      tabIndex={-1}
      role="listbox"
      aria-label="ボード一覧"
      onKeyDown={handleKeyDown}
      className="flex h-full flex-col gap-1 overflow-y-auto p-3 outline-none"
    >
      {boards.map((board, i) => (
        <div
          key={board.id}
          role="option"
          aria-selected={i === index}
          className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${
            i === index ? "bg-black/[0.06]" : ""
          }`}
        >
          <span className="w-5 shrink-0 text-xs text-neutral-400">
            {i < 9 ? `⌘${i + 1}` : ""}
          </span>
          <span className="flex-1 truncate text-neutral-900">{board.name}</span>
          {board.id === currentBoardId && (
            <Check size={14} className="text-neutral-500" />
          )}
        </div>
      ))}

      <div
        role="option"
        aria-selected={index === boards.length}
        className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-neutral-500 ${
          index === boards.length ? "bg-black/[0.06]" : ""
        }`}
      >
        <span className="w-5 shrink-0" />
        <Plus size={14} />
        <span>新規ボード</span>
      </div>
    </div>
  );
}
