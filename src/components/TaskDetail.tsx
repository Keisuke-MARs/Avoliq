import { ja } from "@blocknote/core/locales";
import { useCreateBlockNote } from "@blocknote/react";
import { BlockNoteView } from "@blocknote/shadcn";
import { ArrowLeft, ChevronLeft, ChevronRight } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useDebouncedSave } from "../hooks/useDebouncedSave";
import { registerDetailBridge } from "../lib/detailBridge";
import { reflowStrayMarkdownTables } from "../lib/markdownTableFix";
import { useAppStore } from "../store/appStore";

interface TaskDetailProps {
  /** OSのカラースキーム。購読はPalette側で行い、ここでは受け取るだけ */
  isDark: boolean;
}

/**
 * タスク詳細画面。BlockNoteでNotion風にMarkdownを編集し、500msデバウンスで自動保存する。
 * 保存ボタンは無く、Escでボードへ戻る前に保留分をフラッシュする。
 */
export function TaskDetail({ isDark }: TaskDetailProps) {
  const tasks = useAppStore((state) => state.tasks);
  const statuses = useAppStore((state) => state.statuses);
  const selectedTaskId = useAppStore((state) => state.selectedTaskId);
  // ⌘Nで直近作成したタスクのid。既存タスクをたまたま既定タイトルと同名にしていても
  // 誤ってタイトル全選択にならないよう、タイトル文字列ではなくidで「新規作成直後」を判定する
  const pendingNewTaskId = useAppStore((state) => state.pendingNewTaskId);
  const setView = useAppStore((state) => state.setView);
  const updateTaskContent = useAppStore((state) => state.updateTaskContent);
  const updateTaskTitle = useAppStore((state) => state.updateTaskTitle);
  const moveSelectedTask = useAppStore((state) => state.moveSelectedTask);

  const task = tasks.find((item) => item.id === selectedTaskId) ?? null;
  const status = statuses.find((item) => item.id === task?.statusId) ?? null;

  const [title, setTitle] = useState(task?.title ?? "");
  const titleRef = useRef<HTMLInputElement>(null);
  /**
   * タイトル欄でEnterを1回受けたかどうか。
   * 日本語入力では変換確定のEnterが isComposing を立てずに届くことがあり
   * (WebKitはcompositionendをkeydownより先に出す)、変換を確定しただけのつもりで
   * 本文へフォーカスが飛んでしまう。そこでEnterは2回続けて押されたときだけ本文へ移す。
   * 間に入力(変換確定を含む)や他のキーが挟まったら、また1回目からやり直す。
   */
  const titleEnterArmedRef = useRef(false);

  // エディタのUI文言(スラッシュメニュー・プレースホルダ等)を日本語にする
  const editor = useCreateBlockNote({ dictionary: ja });
  // 初期読み込み中のonChangeを保存として拾わないためのフラグ
  const loadingRef = useRef(true);

  const contentSave = useDebouncedSave<string>((markdown) => {
    if (task === null) return;
    void updateTaskContent(task.id, markdown);
  }, 500);

  const titleSave = useDebouncedSave<string>((value) => {
    if (task === null) return;
    void updateTaskTitle(task.id, value);
  }, 500);

  const flushAll = useCallback(() => {
    contentSave.flush();
    titleSave.flush();
  }, [contentSave, titleSave]);

  // 画面外(useKeyboardのEsc・ウィンドウのフォーカス喪失)から叩けるように登録する
  useEffect(() => {
    registerDetailBridge({
      flush: flushAll,
      focusTitle: () => {
        titleRef.current?.focus();
        titleRef.current?.select();
      },
    });
    return () => registerDetailBridge(null);
  }, [flushAll]);

  // Markdown文字列をBlockNoteのブロックへ変換して流し込む(タスクが変わったときだけ)
  useEffect(() => {
    if (task === null) return;
    loadingRef.current = true;
    // 手打ちテーブルが空行区切りの段落として保存されていた場合に備え、読込前に連結し直す
    // (詳しくはreflowStrayMarkdownTablesのコメント参照)
    const blocks = editor.tryParseMarkdownToBlocks(
      reflowStrayMarkdownTables(task.contentMd),
    );
    editor.replaceBlocks(
      editor.document,
      blocks.length > 0 ? blocks : [{ type: "paragraph" }],
    );
    loadingRef.current = false;
    // contentMdは保存のたびに変わるが、再流し込みするとカーソルが飛ぶのでidだけを見る
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, task?.id]);

  // 詳細画面を開いた瞬間の自動フォーカス。
  // このコンポーネントはPalette側でタスクIDごとにkey指定され直すため、タスクが変わるたびに
  // 必ず再マウントされる=マウント時1回の判定でよい。
  // 「新規作成直後」の判定はタイトル文字列(NEW_TASK_TITLE)ではなくpendingNewTaskId(id)で行う。
  // タイトル文字列で判定すると、既存タスクをたまたま既定タイトルと同名にしていた場合にも
  // 開くたびタイトル全選択になってしまうため。
  // 一致すれば「打てば上書き」できるようタイトルを全選択、それ以外(カードから開いた/検索から
  // 作成した、など既に中身がある場合)は本文から即タイプできるようにする。
  useEffect(() => {
    if (task === null) return;
    const isJustCreated = task.id === pendingNewTaskId;
    // 判定に使ったら用済みなので消す(次にdetailを開いたときに誤って再利用されないように)
    if (pendingNewTaskId !== null) {
      useAppStore.setState({ pendingNewTaskId: null });
    }
    if (isJustCreated) {
      titleRef.current?.focus();
      titleRef.current?.select();
    } else {
      editor.focus();
    }
    // マウント時のみ判定すればよいため依存配列は空でよい
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleEditorChange = useCallback(() => {
    if (loadingRef.current) return;
    // 0.54系ではblocksToMarkdownLossyは同期でstringを返す
    const markdown = editor.blocksToMarkdownLossy(editor.document);
    contentSave.schedule(markdown);
  }, [contentSave, editor]);

  const handleBack = useCallback(() => {
    flushAll();
    setView("board");
  }, [flushAll, setView]);

  if (task === null) {
    return (
      <div className="flex h-full items-center justify-center text-sm st-text-2">
        タスクが選択されていません
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-2 px-8 pb-3 pt-4">
        <button
          type="button"
          aria-label="ボードに戻る (Esc)"
          onClick={handleBack}
          className="flex items-center gap-1 rounded-md px-2 py-1 text-sm st-text-2 transition-colors st-btn-ghost"
        >
          <ArrowLeft size={16} />
          <span>ボード</span>
        </button>

        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            aria-label="前のステータスへ (⌘←)"
            onClick={() => void moveSelectedTask("left")}
            className="rounded-md p-1 st-text-2 transition-colors st-btn-ghost"
          >
            <ChevronLeft size={16} />
          </button>
          <span
            className="rounded-full px-3 py-1 text-xs font-medium"
            style={{
              backgroundColor: `${status?.color ?? "#8E8E93"}1F`,
              color: status?.color ?? "#8E8E93",
            }}
          >
            {status?.name ?? "未分類"}
          </span>
          <button
            type="button"
            aria-label="次のステータスへ (⌘→)"
            onClick={() => void moveSelectedTask("right")}
            className="rounded-md p-1 st-text-2 transition-colors st-btn-ghost"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </header>

      <input
        ref={titleRef}
        value={title}
        onChange={(event) => {
          setTitle(event.target.value);
          titleSave.schedule(event.target.value);
          // 文字が入った(変換が確定した)時点で、直前のEnterとは連続していない
          titleEnterArmedRef.current = false;
        }}
        onBlur={() => {
          // 一度タイトル欄から離れたら「続けて2回」ではないので待機を捨てる
          // (ステータスボタンを押して戻ってきた場合など)
          titleEnterArmedRef.current = false;
        }}
        onKeyDown={(event) => {
          // IMEが処理中のキーでは何も起こさない。keyCode 229 は isComposing を立てない
          // 環境での合図。待機は捨てる: 変換を始めた/取り消した時点で直前のEnterとは
          // 連続していないため(取り消しは値が変わらずonChangeが来ないので、ここで捨てる)。
          // なお、変換確定のEnterがこの枝に入る環境では確定直後にinput(onChange)が続き、
          // どのみち待機は解除される。ここで「1回目」として数えても押下回数は変わらない
          if (event.nativeEvent.isComposing || event.keyCode === 229) {
            titleEnterArmedRef.current = false;
            return;
          }

          // Tabは日本語入力と無関係なので従来どおり1回で本文へ移す
          if (event.key === "Tab" && !event.shiftKey) {
            event.preventDefault();
            titleEnterArmedRef.current = false;
            editor.focus();
            return;
          }

          if (event.key !== "Enter") {
            titleEnterArmedRef.current = false;
            return;
          }

          // Enterで改行やフォームの送信をさせない(タイトルは1行)
          event.preventDefault();
          // キーリピート(押しっぱなし)は2回押しに数えない
          if (event.repeat) return;
          if (!titleEnterArmedRef.current) {
            // 1回目。変換確定のEnterの可能性があるのでここでは移動しない
            titleEnterArmedRef.current = true;
            return;
          }
          // 2回目。本文へ入力を続けられるようにする(⌘Tで再度タイトルへ往復できる)
          titleEnterArmedRef.current = false;
          editor.focus();
        }}
        aria-label="タスクのタイトル"
        placeholder="タイトルを入力"
        className="mx-8 mb-3 bg-transparent text-xl font-semibold st-text-1 outline-none st-input"
      />

      <div className="min-h-0 flex-1 overflow-y-auto pb-4">
        <BlockNoteView
          editor={editor}
          theme={isDark ? "dark" : "light"}
          onChange={handleEditorChange}
        />
      </div>
    </div>
  );
}
