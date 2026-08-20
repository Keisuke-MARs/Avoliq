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
import { getBoardEpoch, useAppStore } from "../store/appStore";
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
  // 通信中(commit系関数の実行中)かどうかのフラグ。Enter連打や⌘↑↓の連続入力で
  // 応答が返る前に同じ更新系関数が多重起動され、同名ステータスの重複作成などを
  // 起こさないようにするためのガード。各commit系関数は排他的なUIモードから
  // しか呼ばれないので、1つのrefで共有して問題ない。
  const submittingRef = useRef(false);

  useEffect(() => {
    if (mode === "rename" || mode === "create") inputRef.current?.focus();
    else if (mode === "color") colorRef.current?.focus();
    else containerRef.current?.focus();
  }, [mode]);

  const target = statuses[index] ?? null;

  /**
   * 変更後にボードを読み直してstatuses/tasksを最新化する。
   * epoch は呼び出し元(commit系関数やreorder)がAPI呼び出しより前に捕捉したボード切替エポック。
   * API応答を待っている間に⌘1-9等でボード切替が「要求」されただけでもエポックは進むので、
   * ここで再確認して進んでいたら selectBoard を呼ばずに黙って何もしない
   * (currentBoardIdはselectBoardの読込完了後にしか更新されないため、
   * currentBoardId比較では切替要求中の古い応答を検知できない)
   *
   * 戻り値: 中断した(読み直さなかった)場合は null。
   * 実際にselectBoardを呼んで読込が完了した場合は、その完了時点の getBoardEpoch() を返す。
   * selectBoard自体が呼び出しのたびにepochを進めるため、呼び出し元が事前に捕捉したepochと
   * 比較しても必ず不一致になってしまう。呼び出し元はこの戻り値を「読込完了後の最新epoch」として
   * 再度 getBoardEpoch() と突き合わせ、その間に別の切替が割り込んでいないかを確認すること。
   */
  const reload = async (epoch: number): Promise<number | null> => {
    if (currentBoardId === null) return null;
    if (getBoardEpoch() !== epoch) return null;
    // selectBoardが読込失敗、またはこの呼び出しより新しい切替要求に追い越されてfalseを返したら、
    // stateは反映されていないので「読み直せなかった」ものとして中断する
    // (falseを見ずに進むと、呼び出し元が古い一覧に対してsetIndex等を実行してしまう)
    const ok = await selectBoard(currentBoardId);
    if (!ok) return null;
    return getBoardEpoch();
  };

  const commitRename = async () => {
    const name = draft.trim();
    if (target === null || name === "") {
      setMode("list");
      return;
    }
    if (submittingRef.current) return; // 通信中の二重実行(Enter連打)を防ぐ
    submittingRef.current = true;
    const epoch = getBoardEpoch();
    try {
      await statusUpdate(target.id, name, null);
      await reload(epoch);
    } catch (error) {
      toast.error("ステータス名を変更できませんでした", {
        description: String(error),
      });
    } finally {
      submittingRef.current = false;
    }
    setMode("list");
  };

  const commitColor = async () => {
    const color = STATUS_COLORS[colorIndex]?.value;
    if (target === null || color === undefined) {
      setMode("list");
      return;
    }
    if (submittingRef.current) return; // 通信中の二重実行(Enter連打)を防ぐ
    submittingRef.current = true;
    const epoch = getBoardEpoch();
    try {
      await statusUpdate(target.id, null, color);
      await reload(epoch);
    } catch (error) {
      toast.error("色を変更できませんでした", { description: String(error) });
    } finally {
      submittingRef.current = false;
    }
    setMode("list");
  };

  const commitCreate = async () => {
    const name = draft.trim();
    if (currentBoardId === null || name === "") {
      setMode("list");
      return;
    }
    if (submittingRef.current) return; // 通信中の二重実行(Enter連打)を防ぐ。これが本来のバグ修正対象
    submittingRef.current = true;
    const epoch = getBoardEpoch();
    try {
      // 色はプリセット先頭(グレー)を初期値にし、あとからCキーで変更してもらう
      await statusCreate(currentBoardId, name, STATUS_COLORS[0].value);
      const after = await reload(epoch);
      if (after !== null && after === getBoardEpoch()) setIndex(statuses.length);
    } catch (error) {
      toast.error("ステータスを追加できませんでした", {
        description: String(error),
      });
    } finally {
      submittingRef.current = false;
    }
    setMode("list");
  };

  const reorder = async (direction: "up" | "down") => {
    if (target === null) return;
    const nextIndex = direction === "up" ? index - 1 : index + 1;
    if (nextIndex < 0 || nextIndex >= statuses.length) return;
    if (submittingRef.current) return; // 通信中の二重実行(⌘↑↓連打)を防ぐ
    submittingRef.current = true;
    const epoch = getBoardEpoch();
    try {
      await statusReorder(target.id, nextIndex);
      const after = await reload(epoch);
      if (after !== null && after === getBoardEpoch()) setIndex(nextIndex);
    } catch (error) {
      toast.error("並び順を変更できませんでした", {
        description: String(error),
      });
    } finally {
      submittingRef.current = false;
    }
  };

  const commitDelete = async () => {
    if (target === null) {
      setMode("list");
      return;
    }
    if (submittingRef.current) return; // 通信中の二重実行(連続クリック等)を防ぐ
    submittingRef.current = true;
    const epoch = getBoardEpoch();
    try {
      await statusDelete(target.id);
      const after = await reload(epoch);
      if (after !== null && after === getBoardEpoch()) setIndex(0);
    } catch (error) {
      toast.error("ステータスを削除できませんでした", {
        description: String(error),
      });
    } finally {
      submittingRef.current = false;
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
              i === index ? "st-row-selected" : ""
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
                className="flex-1 bg-transparent st-text-1 outline-none"
              />
            ) : (
              <span className="flex-1 truncate st-text-1">
                {status.name}
              </span>
            )}
          </div>
        ))}
      </div>

      <div className="flex items-center gap-3 border-t st-border px-4 py-2 text-sm st-text-2">
        <Plus size={14} />
        {mode === "create" ? (
          <input
            ref={inputRef}
            aria-label="新しいステータス名"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={handleInputKeyDown}
            placeholder="ステータス名を入力"
            className="flex-1 bg-transparent st-text-1 outline-none st-input"
          />
        ) : (
          <span>新規ステータス (N)</span>
        )}
      </div>

      {mode === "confirm-delete" && target !== null && (
        <ConfirmDialog
          title={`「${target.name}」を削除しますか？`}
          description={`このステータスのタスクは「${statuses.find((s) => s.id !== target.id)?.name ?? ""}」へ移動します。元に戻せません。`}
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
          className="flex items-center gap-2 border-t st-border px-4 py-3 outline-none"
        >
          {STATUS_COLORS.map((color, i) => (
            <span
              key={color.value}
              role="option"
              aria-label={color.name}
              aria-selected={i === colorIndex}
              className={`h-5 w-5 rounded-full transition-transform ${
                i === colorIndex
                  ? "scale-110 ring-2 ring-[var(--st-text-secondary)] ring-offset-2"
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
