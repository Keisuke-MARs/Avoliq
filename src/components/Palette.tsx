import { useEffect } from "react";
import { Toaster } from "@/components/ui/sonner";
import { Board } from "./Board";
import { BoardSettings } from "./BoardSettings";
import { BoardSwitcher } from "./BoardSwitcher";
import { FooterHints } from "./FooterHints";
import { SearchBar } from "./SearchBar";
import { TaskDetail } from "./TaskDetail";
import { useFlushOnHide } from "@/hooks/useFlushOnHide";
import { useKeyboard } from "@/hooks/useKeyboard";
import { useAppStore } from "@/store/appStore";

export function Palette() {
  const view = useAppStore((s) => s.view);
  const loadBoards = useAppStore((s) => s.loadBoards);
  const selectedTaskId = useAppStore((s) => s.selectedTaskId);

  useKeyboard();
  useFlushOnHide();

  useEffect(() => {
    void loadBoards();
  }, [loadBoards]);

  return (
    <div
      data-testid="palette"
      className="flex h-screen w-screen flex-col overflow-hidden rounded-2xl shadow-2xl backdrop-blur-xl"
      style={{
        backgroundColor: "rgba(250,250,252,0.92)",
        fontFamily:
          '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Hiragino Sans", sans-serif',
      }}
    >
      <SearchBar />

      {view === "board" && <Board />}
      {view === "detail" && <TaskDetail key={selectedTaskId ?? "none"} />}
      {view === "switcher" && <BoardSwitcher />}
      {view === "settings" && <BoardSettings />}

      <FooterHints view={view} />

      <Toaster />
    </div>
  );
}
