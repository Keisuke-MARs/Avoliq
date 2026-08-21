import { useEffect, useRef, useState } from "react";
import { Toaster } from "@/components/ui/sonner";
import { Board } from "./Board";
import { BoardSettings } from "./BoardSettings";
import { BoardSwitcher } from "./BoardSwitcher";
import { FooterHints } from "./FooterHints";
import { SearchBar } from "./SearchBar";
import { TagPalette } from "./TagPalette";
import { TaskDetail } from "./TaskDetail";
import { useFlushOnHide } from "@/hooks/useFlushOnHide";
import { useHotkeyErrorToast } from "@/hooks/useHotkeyErrorToast";
import { useKeyboard } from "@/hooks/useKeyboard";
import { useAppStore } from "@/store/appStore";
import type { View } from "@/types";

export function Palette() {
  const view = useAppStore((s) => s.view);
  const loadBoards = useAppStore((s) => s.loadBoards);
  const selectedTaskId = useAppStore((s) => s.selectedTaskId);
  const tagPaletteOpen = useAppStore((s) => s.tagPaletteOpen);

  useKeyboard();
  useFlushOnHide();
  useHotkeyErrorToast();

  useEffect(() => {
    void loadBoards();
  }, [loadBoards]);

  // ドリルイン遷移: 詳細などへ進むときは右から、盤面へ戻るときは左からスライドさせる
  const previousViewRef = useRef(view);
  const [direction, setDirection] = useState<"forward" | "back">("forward");
  useEffect(() => {
    const order: Record<View, number> = {
      board: 0,
      detail: 1,
      switcher: 1,
      settings: 1,
    };
    setDirection(
      order[view] >= order[previousViewRef.current] ? "forward" : "back",
    );
    previousViewRef.current = view;
  }, [view]);

  return (
    <div
      data-testid="palette"
      className="st-palette relative flex h-screen w-screen flex-col overflow-hidden"
      style={{
        fontFamily:
          '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Hiragino Sans", sans-serif',
      }}
    >
      <SearchBar />

      <div
        key={view}
        className={`flex min-h-0 flex-1 flex-col ${
          direction === "forward" ? "st-view-forward" : "st-view-back"
        }`}
      >
        {view === "board" && <Board />}
        {view === "detail" && <TaskDetail key={selectedTaskId ?? "none"} />}
        {view === "switcher" && <BoardSwitcher />}
        {view === "settings" && <BoardSettings />}
      </div>

      {tagPaletteOpen && <TagPalette />}

      <FooterHints view={view} />

      <Toaster />
    </div>
  );
}
