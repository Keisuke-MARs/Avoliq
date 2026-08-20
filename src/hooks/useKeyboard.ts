import { useEffect } from "react";
import { hidePalette } from "@/lib/api";
import { buildLanes, filterTasks, nextSelectedTaskId } from "@/lib/boardNav";
import { flushDetail, focusDetailTitle } from "@/lib/detailBridge";
import { useAppStore } from "@/store/appStore";
import type { AppState } from "@/store/appStore";

/** 検索入力欄のDOM id。window の keydown ハンドラからフォーカスを移すために使う。 */
export const SEARCH_INPUT_ID = "smarttask-search";

/** 検索入力欄にフォーカスし、キャレットを末尾に置く */
function focusSearchInput(): void {
  const el = document.getElementById(SEARCH_INPUT_ID);
  if (!(el instanceof HTMLInputElement)) return;
  el.focus();
  const end = el.value.length;
  el.setSelectionRange(end, end);
}

/** 検索入力欄からフォーカスを外す（カード選択中は文字キーを自前で拾うため） */
function blurSearchInput(): void {
  const el = document.getElementById(SEARCH_INPUT_ID);
  if (el instanceof HTMLInputElement) el.blur();
}

/** 検索入力欄に今フォーカスがあるか */
function isSearchInputFocused(): boolean {
  return document.activeElement?.id === SEARCH_INPUT_ID;
}

/** 修飾キーなしで打たれた印字可能な1文字かどうか */
function isPrintableKey(e: KeyboardEvent): boolean {
  return e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey;
}

/** ⌘付きのショートカット。処理したら true を返す */
function handleMetaKey(e: KeyboardEvent, s: AppState): boolean {
  switch (e.key) {
    case "ArrowLeft":
      void s.moveSelectedTask("left");
      return true;
    case "ArrowRight":
      void s.moveSelectedTask("right");
      return true;
    case "ArrowUp":
      void s.reorderSelectedTask("up");
      return true;
    case "ArrowDown":
      void s.reorderSelectedTask("down");
      return true;
    case "Backspace":
      void s.deleteSelectedTask();
      return true;
    case "z":
    case "Z":
      void s.undoDelete();
      return true;
    case "n":
    case "N":
      // 新規タスク: 検索バーを空にしてフォーカスを戻す
      s.setSelectedTask(null);
      s.setSearchQuery("");
      focusSearchInput();
      return true;
    case "b":
    case "B":
      // 遷移先の BoardSwitcher の中身は計画書3の担当
      s.setView("switcher");
      return true;
    case ",":
      // 遷移先の BoardSettings の中身は計画書3の担当
      s.setView("settings");
      return true;
    default:
      break;
  }

  // ⌘1〜9 でボードを直接切り替える
  if (/^[1-9]$/.test(e.key)) {
    const board = s.boards[Number(e.key) - 1];
    if (board !== undefined) void s.selectBoard(board.id);
    return true;
  }
  return false;
}

/** ボード画面のキーマップ */
function handleBoardKey(e: KeyboardEvent, s: AppState): void {
  if (e.metaKey) {
    if (handleMetaKey(e, s)) e.preventDefault();
    return;
  }
  // ⌃ / ⌥ 付きはブラウザ/OS側に任せる
  if (e.ctrlKey || e.altKey) return;

  const lanes = buildLanes(s.statuses, filterTasks(s.tasks, s.searchQuery));

  switch (e.key) {
    case "Escape": {
      e.preventDefault();
      // 次に開いたとき前回の入力が残らないよう、隠す前にクリアする
      s.setSelectedTask(null);
      s.setSearchQuery("");
      void hidePalette();
      return;
    }
    case "Enter": {
      e.preventDefault();
      if (s.selectedTaskId !== null) {
        s.setView("detail");
        return;
      }
      if (s.searchQuery.trim() !== "") void s.createTaskFromSearch();
      return;
    }
    case "ArrowUp":
    case "ArrowDown": {
      e.preventDefault();
      const next = nextSelectedTaskId(lanes, s.selectedTaskId, e.key === "ArrowUp" ? "up" : "down");
      s.setSelectedTask(next);
      // カードを選んだら検索バーのフォーカスを外し、以降の文字キーを自前で拾う
      if (next === null) focusSearchInput();
      else blurSearchInput();
      return;
    }
    case "ArrowLeft":
    case "ArrowRight": {
      // 検索バーにいる間は入力欄のキャレット移動を優先する
      if (s.selectedTaskId === null) return;
      e.preventDefault();
      s.setSelectedTask(
        nextSelectedTaskId(lanes, s.selectedTaskId, e.key === "ArrowLeft" ? "left" : "right"),
      );
      return;
    }
    default:
      break;
  }

  // 検索バーの外で打たれた1文字は、検索バーへ送り込んで絞り込みを始める
  if (isPrintableKey(e) && !isSearchInputFocused()) {
    e.preventDefault();
    s.setSelectedTask(null);
    s.setSearchQuery(s.searchQuery + e.key);
    focusSearchInput();
  }
}

/**
 * 詳細画面のキーマップ。
 * Esc=保存を確定してボードへ戻る / ⌘←→=ステータス変更 / ⌘T=タイトルへフォーカス
 */
function handleDetailKey(event: KeyboardEvent): void {
  const store = useAppStore.getState();

  if (event.key === "Escape") {
    event.preventDefault();
    flushDetail();
    store.setView("board");
    return;
  }

  if (event.metaKey && event.key === "ArrowLeft") {
    event.preventDefault();
    void store.moveSelectedTask("left");
    return;
  }

  if (event.metaKey && event.key === "ArrowRight") {
    event.preventDefault();
    void store.moveSelectedTask("right");
    return;
  }

  if (event.metaKey && (event.key === "t" || event.key === "T")) {
    event.preventDefault();
    focusDetailTitle();
  }
}

/**
 * window に keydown を1本だけ張り、現在のviewに応じてキーを振り分ける。
 * スイッチャー・設定は将来的に各コンポーネント側でキーを処理する想定だが、
 * 現状はまだ専用ハンドラを持たない（ViewPlaceholderのみ）ため、
 * 既存動作を維持してEscで盤面へ戻る導線だけ通してある。
 */
export function useKeyboard(): void {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      // IME変換中のキーは一切拾わない
      if (e.isComposing || e.key === "Process") return;

      const state = useAppStore.getState();
      if (state.view === "board") {
        handleBoardKey(e, state);
        return;
      }
      if (state.view === "detail") {
        handleDetailKey(e);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        state.setView("board");
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
}
