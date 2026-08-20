import { Plus } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  statusCreate,
  statusDelete,
  statusReorder,
  statusUpdate,
} from "../lib/api";
import { STATUS_COLORS } from "../lib/statusPalette";
import { useAppStore } from "../store/appStore";
import { ConfirmDialog } from "./ConfirmDialog";

type Mode = "list" | "rename" | "color" | "create" | "confirm-delete";

/**
 * ボード設定のステータス管理。
 * ↑↓選択 / Enter改名 / C色変更 / N追加 / ⌘↑↓並び替え / ⌘⌫削除
 */
export function StatusSettings() {
  const statuses = useAppStore((state) => state.statuses);
  const currentBoardId = useAppStore((state) => state.currentBoardId);
  const selectBoard = useAppStore((state) => state.selectBoard);

  const [index, setIndex] = useState(0);
  const [mode, setMode] = useState<Mode>("list");
  const [draft, setDraft] = useState("");
  const [colorIndex, setColorIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const colorRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (mode === "rename" || mode === "create") inputRef.current?.focus();
    else if (mode === "color") colorRef.current?.focus();
    else containerRef.current?.focus();
  }, [mode]);

  const target = statuses[index] ?? null;

  /** 変更後にボードを読み直してstatuses/tasksを最新化する */
  const reload = async () => {
    if (currentBoardId !== null) await selectBoard(currentBoardId);
  };

  const commitRename = async () => {
    const name = draft.trim();
    if (target === null || name === "") {
      setMode("list");
      return;
    }
    try {
      await statusUpdate(target.id, name, null);
      await reload();
    } catch (error) {
      toast.error("ステータス名を変更できませんでした", {
        description: String(error),
      });
    }
    setMode("list");
  };

  const commitColor = async () => {
    const color = STATUS_COLORS[colorIndex]?.value;
    if (target === null || color === undefined) {
      setMode("list");
      return;
    }
    try {
      await statusUpdate(target.id, null, color);
      await reload();
    } catch (error) {
      toast.error("色を変更できませんでした", { description: String(error) });
    }
    setMode("list");
  };

  const commitCreate = async () => {
    const name = draft.trim();
    if (currentBoardId === null || name === "") {
      setMode("list");
      return;
    }
    try {
      // 色はプリセット先頭(グレー)を初期値にし、あとからCキーで変更してもらう
      await statusCreate(currentBoardId, name, STATUS_COLORS[0].value);
      await reload();
      setIndex(statuses.length);
    } catch (error) {
      toast.error("ステータスを追加できませんでした", {
        description: String(error),
      });
    }
    setMode("list");
  };

  const reorder = async (direction: "up" | "down") => {
    if (target === null) return;
    const nextIndex = direction === "up" ? index - 1 : index + 1;
    if (nextIndex < 0 || nextIndex >= statuses.length) return;
    try {
      await statusReorder(target.id, nextIndex);
      await reload();
      setIndex(nextIndex);
    } catch (error) {
      toast.error("並び順を変更できませんでした", {
        description: String(error),
      });
    }
  };

  const commitDelete = async () => {
    if (target === null) {
      setMode("list");
      return;
    }
    try {
      await statusDelete(target.id);
      await reload();
      setIndex(0);
    } catch (error) {
      toast.error("ステータスを削除できませんでした", {
        description: String(error),
      });
    }
    setMode("list");
  };

  // ここで処理したキーは window 側の useKeyboard フォールバックへ伝播させない。
  // BoardSwitcher と同じ理由（伝播したままだと view 変更直後に window 側の
  // ハンドラが最新の view を見て二重発火する）で、view を変えない分岐
  // （矢印移動・改名/色選択モードへの遷移）も含めて統一的に stopPropagation する。
  const handleListKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.metaKey && event.key === "ArrowDown") {
      event.preventDefault();
      event.stopPropagation();
      void reorder("down");
      return;
    }
    if (event.metaKey && event.key === "ArrowUp") {
      event.preventDefault();
      event.stopPropagation();
      void reorder("up");
      return;
    }
    if (event.metaKey && event.key === "Backspace") {
      event.preventDefault();
      event.stopPropagation();
      if (target === null) return;
      if (statuses.length <= 1) {
        toast.error("最後のステータスは削除できません");
        return;
      }
      setMode("confirm-delete");
      return;
    }
    if (event.key === "n" || event.key === "N") {
      event.preventDefault();
      event.stopPropagation();
      setDraft("");
      setMode("create");
      return;
    }
    if (event.key === "ArrowDown" && !event.metaKey) {
      event.preventDefault();
      event.stopPropagation();
      setIndex((prev) => Math.min(prev + 1, statuses.length - 1));
      return;
    }
    if (event.key === "ArrowUp" && !event.metaKey) {
      event.preventDefault();
      event.stopPropagation();
      setIndex((prev) => Math.max(prev - 1, 0));
      return;
    }
    if (event.key === "Enter" && target !== null) {
      event.preventDefault();
      event.stopPropagation();
      setDraft(target.name);
      setMode("rename");
      return;
    }
    if ((event.key === "c" || event.key === "C") && target !== null) {
      event.preventDefault();
      event.stopPropagation();
      const found = STATUS_COLORS.findIndex(
        (color) => color.value === target.color,
      );
      setColorIndex(found >= 0 ? found : 0);
      setMode("color");
    }
  };

  const handleColorKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "ArrowRight") {
      event.preventDefault();
      event.stopPropagation();
      setColorIndex((prev) => Math.min(prev + 1, STATUS_COLORS.length - 1));
      return;
    }
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      event.stopPropagation();
      setColorIndex((prev) => Math.max(prev - 1, 0));
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      event.stopPropagation();
      void commitColor();
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      setMode("list");
    }
  };

  const handleInputKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
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
    <div className="relative flex h-full flex-col">
      <div
        ref={containerRef}
        tabIndex={-1}
        role="listbox"
        aria-label="ステータス一覧"
        onKeyDown={mode === "list" ? handleListKeyDown : undefined}
        className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto p-3 outline-none"
      >
        {statuses.map((status, i) => (
          <div
            key={status.id}
            role="option"
            aria-selected={i === index}
            className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
              i === index ? "bg-black/[0.06]" : ""
            }`}
          >
            <span
              className="h-3 w-3 shrink-0 rounded-full"
              style={{ backgroundColor: status.color }}
            />
            {mode === "rename" && i === index ? (
              <input
                ref={inputRef}
                aria-label="ステータス名"
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={handleInputKeyDown}
                className="flex-1 bg-transparent text-neutral-900 outline-none"
              />
            ) : (
              <span className="flex-1 truncate text-neutral-900">
                {status.name}
              </span>
            )}
          </div>
        ))}
      </div>

      <div className="flex items-center gap-3 border-t border-black/5 px-4 py-2 text-sm text-neutral-500">
        <Plus size={14} />
        {mode === "create" ? (
          <input
            ref={inputRef}
            aria-label="新しいステータス名"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={handleInputKeyDown}
            placeholder="ステータス名を入力"
            className="flex-1 bg-transparent text-neutral-900 outline-none placeholder:text-neutral-400"
          />
        ) : (
          <span>新規ステータス (N)</span>
        )}
      </div>

      {mode === "confirm-delete" && target !== null && (
        <ConfirmDialog
          title={`「${target.name}」を削除しますか？`}
          description={`このステータスのタスクは「${statuses[0]?.name ?? ""}」へ移動します。元に戻せません。`}
          confirmLabel="削除する"
          onConfirm={() => void commitDelete()}
          onCancel={() => setMode("list")}
        />
      )}

      {mode === "color" && (
        <div
          ref={colorRef}
          tabIndex={-1}
          role="listbox"
          aria-label="色を選択"
          onKeyDown={handleColorKeyDown}
          className="flex items-center gap-2 border-t border-black/5 px-4 py-3 outline-none"
        >
          {STATUS_COLORS.map((color, i) => (
            <span
              key={color.value}
              role="option"
              aria-label={color.name}
              aria-selected={i === colorIndex}
              className={`h-5 w-5 rounded-full transition-transform ${
                i === colorIndex
                  ? "scale-110 ring-2 ring-neutral-900/40 ring-offset-2"
                  : ""
              }`}
              style={{ backgroundColor: color.value }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
