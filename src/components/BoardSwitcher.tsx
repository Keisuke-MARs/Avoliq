import { Check, Pencil, Plus } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { boardCreate, boardDelete, boardRename } from "../lib/api";
import { useAppStore } from "../store/appStore";
import { ConfirmDialog } from "./ConfirmDialog";

type Mode = "list" | "create" | "rename" | "confirm-delete";

/**
 * ボードスイッチャー(⌘Bで開く)。
 * ↑↓選択 / Enter切替 / ⌘1-9直接切替 / N新規 / R改名 / ⌘⌫削除 / Esc戻る
 */
export function BoardSwitcher() {
  const boards = useAppStore((state) => state.boards);
  const currentBoardId = useAppStore((state) => state.currentBoardId);
  const selectBoard = useAppStore((state) => state.selectBoard);
  const loadBoards = useAppStore((state) => state.loadBoards);
  const setView = useAppStore((state) => state.setView);

  // インデックスが boards.length のときは「新規ボード」項目を指す
  const [index, setIndex] = useState(() => {
    const found = boards.findIndex((board) => board.id === currentBoardId);
    return found >= 0 ? found : 0;
  });
  const [mode, setMode] = useState<Mode>("list");
  const [draft, setDraft] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (mode === "list") containerRef.current?.focus();
    if (mode === "create" || mode === "rename") inputRef.current?.focus();
  }, [mode]);

  const targetBoard = boards[index] ?? null;

  const openBoard = (boardId: string) => {
    void selectBoard(boardId);
    setView("board");
  };

  const startCreate = () => {
    setDraft("");
    setMode("create");
  };

  // 通信完了前のEnter連打による二重実行を防ぐ(StatusSettingsと同じ方式。
  // create/rename/deleteは排他的なモードからしか呼ばれないため単一のrefを共有する)
  const submittingRef = useRef(false);

  const commitCreate = async () => {
    const name = draft.trim();
    if (name === "") {
      setMode("list");
      return;
    }
    if (submittingRef.current) return;
    submittingRef.current = true;
    try {
      const created = await boardCreate(name);
      await loadBoards();
      await selectBoard(created.id);
      setView("board");
    } catch (error) {
      toast.error("ボードを作成できませんでした", {
        description: String(error),
      });
      setMode("list");
    } finally {
      submittingRef.current = false;
    }
  };

  const commitRename = async () => {
    const name = draft.trim();
    if (targetBoard === null || name === "") {
      setMode("list");
      return;
    }
    if (submittingRef.current) return;
    submittingRef.current = true;
    try {
      await boardRename(targetBoard.id, name);
      await loadBoards();
    } catch (error) {
      toast.error("ボードを改名できませんでした", {
        description: String(error),
      });
    } finally {
      submittingRef.current = false;
    }
    setMode("list");
  };

  const commitDelete = async () => {
    if (targetBoard === null) {
      setMode("list");
      return;
    }
    if (submittingRef.current) return;
    submittingRef.current = true;
    try {
      await boardDelete(targetBoard.id);
      await loadBoards();
      const remaining = useAppStore
        .getState()
        .boards.filter((board) => board.id !== targetBoard.id);
      const next = remaining[0];
      if (next !== undefined) await selectBoard(next.id);
      setIndex(0);
    } catch (error) {
      toast.error("ボードを削除できませんでした", {
        description: String(error),
      });
    } finally {
      submittingRef.current = false;
    }
    setMode("list");
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const lastIndex = boards.length; // 「新規ボード」項目の位置

    // ここで処理したキーは window 側の useKeyboard フォールバックへ伝播させない。
    // 伝播させたままだと、setView("board") で view が切り替わった直後に
    // window の keydown ハンドラが最新の view("board")を見て handleBoardKey を
    // 二重発火させてしまう（Escでの意図しない hidePalette 呼び出し等）ため。
    // view を変えない分岐(矢印移動・新規/改名モードへの遷移・削除確認への遷移)も
    // 含めて統一的に stopPropagation しておく。
    if (event.metaKey && /^[1-9]$/.test(event.key)) {
      const target = boards[Number(event.key) - 1];
      if (target !== undefined) {
        event.preventDefault();
        event.stopPropagation();
        openBoard(target.id);
      }
      return;
    }

    if (event.metaKey && event.key === "Backspace") {
      event.preventDefault();
      event.stopPropagation();
      if (targetBoard === null) return;
      if (boards.length <= 1) {
        toast.error("最後のボードは削除できません");
        return;
      }
      setMode("confirm-delete");
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
      if (index === lastIndex) {
        startCreate();
        return;
      }
      if (targetBoard !== null) openBoard(targetBoard.id);
      return;
    }

    if (event.key === "n" || event.key === "N") {
      event.preventDefault();
      event.stopPropagation();
      startCreate();
      return;
    }

    if ((event.key === "r" || event.key === "R") && targetBoard !== null) {
      event.preventDefault();
      event.stopPropagation();
      setDraft(targetBoard.name);
      setMode("rename");
    }
  };

  const handleInputKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    // 入力欄でのキー操作も同じ理由で window へ伝播させない。
    if (event.key === "Enter") {
      event.preventDefault();
      event.stopPropagation();
      if (mode === "create") void commitCreate();
      else void commitRename();
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      setMode("list");
    }
  };

  return (
    <div className="relative h-full">
      <div
        ref={containerRef}
        tabIndex={-1}
        role="listbox"
        aria-label="ボード一覧"
        onKeyDown={mode === "list" ? handleKeyDown : undefined}
        className="flex h-full flex-col gap-1 overflow-y-auto p-3 outline-none"
      >
        {boards.map((board, i) => (
          <div
            key={board.id}
            role="option"
            aria-selected={i === index}
            className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors ${
              i === index ? "st-row-selected" : ""
            }`}
          >
            <span className="w-5 shrink-0 text-xs st-text-3">
              {i < 9 ? `⌘${i + 1}` : ""}
            </span>
            {mode === "rename" && i === index ? (
              <input
                ref={inputRef}
                aria-label="ボード名"
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={handleInputKeyDown}
                className="flex-1 bg-transparent st-text-1 outline-none"
              />
            ) : (
              <span className="flex-1 truncate st-text-1">
                {board.name}
              </span>
            )}
            {board.id === currentBoardId && (
              <Check size={14} className="st-text-2" />
            )}
            {i === index && mode === "list" && (
              <Pencil size={12} className="st-text-3" />
            )}
          </div>
        ))}

        <div
          role="option"
          aria-selected={index === boards.length}
          className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm st-text-2 transition-colors ${
            index === boards.length ? "st-row-selected" : ""
          }`}
        >
          <span className="w-5 shrink-0" />
          <Plus size={14} />
          {mode === "create" ? (
            <input
              ref={inputRef}
              aria-label="新しいボード名"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={handleInputKeyDown}
              placeholder="ボード名を入力"
              className="flex-1 bg-transparent st-text-1 outline-none st-input"
            />
          ) : (
            <span>新規ボード</span>
          )}
        </div>
      </div>

      {mode === "confirm-delete" && targetBoard !== null && (
        <ConfirmDialog
          title={`「${targetBoard.name}」を削除しますか？`}
          description="このボードのタスクとステータスもすべて削除されます。元に戻せません。"
          confirmLabel="削除する"
          onConfirm={() => void commitDelete()}
          onCancel={() => setMode("list")}
        />
      )}
    </div>
  );
}
