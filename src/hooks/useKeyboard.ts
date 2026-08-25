import { useEffect } from "react";
import { hidePalette } from "@/lib/api";
import { buildLanes, filterTasks, nextSelectedTaskId } from "@/lib/boardNav";
import { flushDetail, focusDetailTitle } from "@/lib/detailBridge";
import { useAppStore } from "@/store/appStore";
import type { AppState } from "@/store/appStore";

/** 検索入力欄のDOM id。window の keydown ハンドラからフォーカスを移すために使う。 */
export const SEARCH_INPUT_ID = "avoliq-search";

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

/** ⌘⇧←→↑↓ は macOS 標準のテキスト選択（行頭・行末・先頭・末尾まで選択）かどうか */
function isTextSelectionArrow(e: KeyboardEvent): boolean {
  return (
    e.shiftKey &&
    (e.key === "ArrowLeft" ||
      e.key === "ArrowRight" ||
      e.key === "ArrowUp" ||
      e.key === "ArrowDown")
  );
}

/**
 * カード未選択のとき、入力欄の標準操作に譲る⌘ショートカットのキー。
 * カード未選択 = 検索欄にキャレットがある状態で、かつストア側もどれも早期returnするので、
 * 空振りさせるくらいなら標準操作(⌘←→=行頭/行末へ移動、⌘⌫=行頭まで削除)を通す。
 * ⌘Kも未選択では空振りするが、入力欄に⌘Kの標準の意味がない(行末まで削除は⌃K)ため含めない。
 * ⌘Zはカード選択と無関係(lastDeletedTaskId依存)なので、ここに足すと復元が丸ごと死ぬ。
 */
const CARD_REQUIRED_KEYS = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Backspace"];

/** ⌘付きのショートカット。処理したら true を返す */
function handleMetaKey(e: KeyboardEvent, s: AppState): boolean {
  // 検索欄にフォーカスがある状態で ⌘⇧← などを打ったとき、選択操作を奪わずOSへ譲る。
  // カード選択中は入力欄から外れているので何も起きないが、⇧なしの⌘矢印で足りるため実害はない
  if (isTextSelectionArrow(e)) return false;

  if (s.selectedTaskId === null && CARD_REQUIRED_KEYS.includes(e.key)) return false;

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
      // "Z"はCaps Lock対策(このときshiftKeyは立たない)。
      // ⌘⇧Zは入力欄のredoなので、アプリのundoとは別物として扱いOSへ譲る
      if (e.shiftKey) return false;
      void s.undoDelete();
      return true;
    case "n":
    case "N":
      // 新規タスク作成: ボード先頭ステータスへ即時作成し、詳細画面へ遷移する
      void s.createNewTask();
      return true;
    case "p":
    case "P":
      // 検索: 検索バーを空にしてフォーカスを戻す(旧⌘Nと同じ挙動)
      s.setSelectedTask(null);
      s.setSearchQuery("");
      focusSearchInput();
      return true;
    case "k":
    case "K":
      // タグパレットを開く。カード未選択なら openTagPalette 側で無反応になる。
      // board にはBlockNoteエディタが存在せず ⌘K を preventDefault する相手がいないため、
      // detail側(下のhandleDetailKey)にあるdefaultPreventedガードはここには不要(対称性で足さないこと)
      s.openTagPalette();
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

/**
 * 検索欄からの新規作成でEnterを1回受けたかどうかの待機状態。
 * useEffectごとに作り、モジュールに可変の状態を残さない。
 *
 * 日本語入力では変換確定のEnterが isComposing を立てずに届くことがあり
 * (WebKitはcompositionendをkeydownより先に出す)、変換を確定しただけのつもりで
 * タスクが作られてしまう。そこでEnterは2回続けて押されたときだけ作成する
 * (TaskDetailのタイトル欄と同じ作法)。
 * 間に入力(変換確定を含む)や他のキーが挟まったら、また1回目からやり直す。
 */
interface EnterArm {
  armed: boolean;
}

/** ボード画面のキーマップ */
function handleBoardKey(e: KeyboardEvent, s: AppState, arm: EnterArm): void {
  // 素のEnter以外が挟まったら2回押しの待機は捨てる。⌘付きのEnterや、SearchBarがタグ候補の
  // 確定で先に処理したEnter(defaultPrevented)も「別の操作」なので1回目には数えない。
  // ⇧Enterは1行の入力欄では素のEnterと同じ意味しか持たないので、あえて別扱いにしない
  // (TaskDetailのタイトル欄も同じ扱い)
  if (e.key !== "Enter" || e.metaKey || e.ctrlKey || e.altKey || e.defaultPrevented) {
    arm.armed = false;
  }

  if (e.metaKey) {
    // ⌘系は先にhandleMetaKeyへ通す。boardにはBlockNoteのような競合相手がおらず
    // defaultPreventedを立てて先取りする側がいないため、ここではガードしない
    // (対称性のためにガードを足すと下の⌘Kのテストが赤くなる)
    if (handleMetaKey(e, s)) e.preventDefault();
    return;
  }

  // SearchBar のタグ候補選択(↑↓ / Enter)のように、既に処理済みのキーはここでは触らない。
  // 検索欄と board は同じ window の keydown 1本を共有しているので、
  // このガードが無いと「候補を1つ下へ」と「カードを1つ下へ」が同時に起きる。
  // detail側の⌘K(BlockNoteのリンク作成に譲る)と同じ作法。
  if (e.defaultPrevented) return;

  // ⌃ / ⌥ 付きはブラウザ/OS側に任せる
  if (e.ctrlKey || e.altKey) return;

  const lanes = buildLanes(s.statuses, filterTasks(s.tasks, s.searchQuery, s.tags));

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
        // カードを開くのは1回で確定してよい。IMEの変換確定は検索欄(カード未選択)で起きるため
        arm.armed = false;
        s.setView("detail");
        return;
      }
      if (s.searchQuery.trim() === "") {
        // 作れる状態でないうちは待機も持ち越さない(状態を追いやすくするため)
        arm.armed = false;
        return;
      }
      // キーリピート(押しっぱなし)は2回押しに数えない
      if (e.repeat) return;
      if (!arm.armed) {
        // 1回目。変換確定のEnterの可能性があるのでここでは作らない
        arm.armed = true;
        return;
      }
      arm.armed = false;
      void s.createTaskFromSearch();
      return;
    }
    case "ArrowUp":
    case "ArrowDown": {
      // ⇧付きでもここで拾う。検索欄は1行なので ⇧↑↓ には「先頭/末尾まで選択」の
      // 標準の意味があるが、この2キーは「検索欄からレーンへ入る」中心的な操作でもあり、
      // ⇧付きだけ挙動が変わるほうが読みにくいと判断した(既知のトレードオフ)
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
 * Esc=保存を確定してボードへ戻る / ⌘←→=ステータス変更 / ⌘T=タイトルへフォーカス /
 * ⌘N=新規タスク作成 / ⌘P=検索(保存を確定してボード+検索バーへ)
 */
function handleDetailKey(event: KeyboardEvent): void {
  const store = useAppStore.getState();

  if (event.key === "Escape") {
    event.preventDefault();
    flushDetail();
    store.setView("board");
    return;
  }

  if (event.metaKey && (event.key === "k" || event.key === "K")) {
    // @blocknote/react の CreateLinkButton が editorDOMElement に ⌘K のリスナを張っており、
    // 本文にテキスト選択があるときだけ preventDefault してリンク作成UIを出す
    // (stopPropagationはしていないので、このイベントはここまで届く)。
    // その場合はタグパレットを開かずリンク作成に譲る。
    if (event.defaultPrevented) return;
    event.preventDefault();
    // 保留中の自動保存を確定してからタグパレットを開く
    flushDetail();
    store.openTagPalette();
    return;
  }

  // ⌘⇧←→ は本文(BlockNote)やタイトル欄での「行頭・行末まで選択」。
  // ここで preventDefault すると選択が奪われてしまうので、⇧付きはエディタ側へ通す。
  // なお ⌘⇧↑↓ は詳細画面では ⌘↑↓ 自体を扱っていないため、もともと素通りしている
  if (event.metaKey && !event.shiftKey && event.key === "ArrowLeft") {
    event.preventDefault();
    void store.moveSelectedTask("left");
    return;
  }

  if (event.metaKey && !event.shiftKey && event.key === "ArrowRight") {
    event.preventDefault();
    void store.moveSelectedTask("right");
    return;
  }

  if (event.metaKey && (event.key === "t" || event.key === "T")) {
    event.preventDefault();
    focusDetailTitle();
    return;
  }

  if (event.metaKey && (event.key === "n" || event.key === "N")) {
    event.preventDefault();
    // 詳細画面の保留中の自動保存を確定してから、新規タスクを作って詳細を差し替える
    flushDetail();
    void store.createNewTask();
    return;
  }

  if (event.metaKey && (event.key === "p" || event.key === "P")) {
    event.preventDefault();
    flushDetail();
    store.setView("board");
    // viewの切替(TaskDetailのアンマウント・SearchBarの再描画)がDOMへ反映されてから
    // フォーカスを当てないと、切替前のDOMにフォーカスしてしまうことがあるため1フレーム遅らせる。
    // ただしrAF発火までの間に(Escやボード切替などで)別のviewへ遷移している可能性があるので、
    // 実行直前に現在のviewを確認し、boardのままのときだけフォーカスを奪う
    requestAnimationFrame(() => {
      if (useAppStore.getState().view !== "board") return;
      focusSearchInput();
    });
    return;
  }
}

/**
 * window に keydown を1本だけ張り、現在のviewに応じてキーを振り分ける。
 * スイッチャー / 設定は BoardSwitcher / BoardSettings が自前でキー（Escを含む）を
 * 処理するため、ここでは何もしない。
 * （BoardSwitcher・BoardSettings 側の処理とここでのフォールバックが両方効くと、
 *   盤面へ戻した直後に state.view==="board" と判定されて handleBoardKey が
 *   二重発火してしまうため、switcher / settings はここで早期returnして避ける）
 */
export function useKeyboard(): void {
  useEffect(() => {
    const enterArm: EnterArm = { armed: false };

    function onKeyDown(e: KeyboardEvent) {
      // IME変換中のキーは一切拾わない。変換を始めた/確定した時点で直前のEnterとは
      // 連続していないので、検索欄の2回押しの待機もここで捨てる
      if (e.isComposing || e.key === "Process") {
        enterArm.armed = false;
        return;
      }

      const state = useAppStore.getState();

      // タグパレット表示中は TagPalette 自身が全キーを処理する（二重発火の防止）
      if (state.tagPaletteOpen) {
        enterArm.armed = false;
        return;
      }

      if (state.view === "board") {
        handleBoardKey(e, state, enterArm);
        return;
      }
      // board を離れたら「続けて2回」ではないので待機を捨てる
      enterArm.armed = false;
      if (state.view === "detail") {
        handleDetailKey(e);
        return;
      }
      // switcher / settings は各コンポーネント側のハンドラが全キーを処理する
      // (stopPropagationでここへは届かない前提。届いても二重処理しない)
    }

    // 検索欄からフォーカスが外れたら「続けて2回」ではないので待機を捨てる
    // (TaskDetailのタイトル欄のonBlurと同じ役目)。これが無いと、1回目のEnterのあと
    // マウスで別の場所をクリックしてから戻ってきたとき、Enter1回で作られてしまう
    function onFocusOut(e: FocusEvent) {
      if (e.target instanceof HTMLElement && e.target.id === SEARCH_INPUT_ID) {
        enterArm.armed = false;
      }
    }

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("focusout", onFocusOut);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("focusout", onFocusOut);
    };
  }, []);
}
