import { useEffect } from "react";
import { Toaster } from "@/components/ui/sonner";
import { Board } from "./Board";
import { SearchBar } from "./SearchBar";
import { TaskDetail } from "./TaskDetail";
import { useKeyboard } from "@/hooks/useKeyboard";
import { useAppStore } from "@/store/appStore";

/** フッターに常時出すキーボードヒント */
const HINTS: { keys: string; label: string }[] = [
  { keys: "↑↓←→", label: "移動" },
  { keys: "⏎", label: "開く / 作成" },
  { keys: "⌘←→", label: "ステータス" },
  { keys: "⌘↑↓", label: "並び替え" },
  { keys: "⌘⌫", label: "削除" },
  { keys: "⌘Z", label: "元に戻す" },
  { keys: "esc", label: "閉じる" },
];

/** 計画書3で本実装されるビューの仮表示 */
function ViewPlaceholder({ testId, label }: { testId: string; label: string }) {
  return (
    <div data-testid={testId} className="flex-1 px-4 py-6 text-[13px] text-neutral-500">
      {label}（Escで盤面へ戻ります）
    </div>
  );
}

export function Palette() {
  const view = useAppStore((s) => s.view);
  const loadBoards = useAppStore((s) => s.loadBoards);
  const selectedTaskId = useAppStore((s) => s.selectedTaskId);

  useKeyboard();

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
      {view === "switcher" && (
        <ViewPlaceholder
          testId="switcher-placeholder"
          label="ボードスイッチャーは計画書3で実装します"
        />
      )}
      {view === "settings" && (
        <ViewPlaceholder testId="settings-placeholder" label="ボード設定は計画書3で実装します" />
      )}

      <footer
        data-testid="keyboard-hints"
        className="flex h-8 shrink-0 items-center gap-3 border-t border-black/5 px-4 text-[11px] text-neutral-500"
      >
        {HINTS.map((hint) => (
          <span key={hint.keys} className="flex items-center gap-1">
            <kbd className="rounded bg-black/5 px-1 py-0.5 font-sans text-[10px] text-neutral-600">
              {hint.keys}
            </kbd>
            {hint.label}
          </span>
        ))}
      </footer>

      <Toaster />
    </div>
  );
}
