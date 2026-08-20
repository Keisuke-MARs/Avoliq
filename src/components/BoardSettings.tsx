import { useEffect, useRef, useState } from "react";
import { useAppStore } from "../store/appStore";
import { AppSettings } from "./AppSettings";
import { StatusSettings } from "./StatusSettings";

type Tab = "board" | "app";

/**
 * 設定画面(⌘,で開く)。
 * ボードタブ=ステータス管理 / アプリタブ=自動起動・ホットキー。Tabで行き来する。
 */
export function BoardSettings() {
  const boards = useAppStore((state) => state.boards);
  const currentBoardId = useAppStore((state) => state.currentBoardId);
  const setView = useAppStore((state) => state.setView);

  const [tab, setTab] = useState<Tab>("board");
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    containerRef.current?.focus();
  }, []);

  const boardName =
    boards.find((board) => board.id === currentBoardId)?.name ?? "";

  // ここで処理したキーは window 側の useKeyboard フォールバックへ伝播させない。
  // BoardSwitcher / StatusSettings と同じ理由（伝播したままだと view 変更直後に
  // window 側のハンドラが最新の view を見て二重発火する）で統一的に stopPropagation する。
  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Tab") {
      event.preventDefault();
      event.stopPropagation();
      setTab((prev) => (prev === "board" ? "app" : "board"));
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      setView("board");
    }
  };

  return (
    <div
      ref={containerRef}
      tabIndex={-1}
      onKeyDown={handleKeyDown}
      className="flex h-full flex-col outline-none"
    >
      <div
        role="tablist"
        aria-label="設定タブ"
        className="flex items-center gap-1 px-3 pt-3"
      >
        <button
          type="button"
          role="tab"
          aria-selected={tab === "board"}
          onClick={() => setTab("board")}
          className={`rounded-md px-3 py-1 text-xs transition-colors ${
            tab === "board"
              ? "bg-black/[0.06] text-neutral-900"
              : "text-neutral-500"
          }`}
        >
          ボード{boardName === "" ? "" : `（${boardName}）`}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "app"}
          onClick={() => setTab("app")}
          className={`rounded-md px-3 py-1 text-xs transition-colors ${
            tab === "app"
              ? "bg-black/[0.06] text-neutral-900"
              : "text-neutral-500"
          }`}
        >
          アプリ
        </button>
      </div>

      <div className="min-h-0 flex-1">
        {tab === "board" ? <StatusSettings /> : <AppSettings />}
      </div>
    </div>
  );
}
