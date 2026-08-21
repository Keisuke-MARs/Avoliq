import { Tag as TagIcon } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { TagPaletteRow, type TagRow } from "@/components/TagPaletteRow";
import { useAppStore } from "@/store/appStore";
import type { Tag } from "@/types";

/** フォーカス制御の分岐に使うモード（BoardSwitcher/StatusSettingsと同じ作法） */
type Mode = "list" | "rename" | "confirm-delete";

/**
 * ⌘Kで開くタグ付与・管理オーバーレイ。
 * viewは増やさず、board / detail の上に重ねる。付け外し・作成・改名・削除がこの1枚で完結する。
 */
export function TagPalette() {
  const tasks = useAppStore((s) => s.tasks);
  const allTags = useAppStore((s) => s.tags);
  const selectedTaskId = useAppStore((s) => s.selectedTaskId);
  const closeTagPalette = useAppStore((s) => s.closeTagPalette);
  const toggleTaskTag = useAppStore((s) => s.toggleTaskTag);
  const createTagAndAttach = useAppStore((s) => s.createTagAndAttach);
  const renameTag = useAppStore((s) => s.renameTag);
  const deleteTag = useAppStore((s) => s.deleteTag);

  const [query, setQuery] = useState("");
  // ハイライトはindexではなくタグidで持つ。トグルすると付与済み/使用件数で並び替わるため、
  // indexだけで管理すると「押した直後に別の行を指してしまう」事故が起きる
  // (idで持てば、並び替わっても同じタグを指し続ける)。nullは「着地点なし」。
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);
  /** IME変換中かどうか。変換中はハイライトを外してEnterの着地点を消す */
  const composingRef = useRef(false);
  /**
   * 「次のkeydownがEnterなら1回だけ無視する」フラグ。
   * WebKitは compositionend を keydown より先に発火するため、isComposing だけでは
   * 変換確定のEnterを取りこぼす(TaskDetailのタイトル欄が過去にこれで事故った)。
   * 時間ではなく「次の1イベント」に依存させるので確実。待機はどのキーでも解除する
   * (確定後に別のキーを打てば、次のEnterは通常どおり効く)。
   * 注意: compositionend はEnterでの確定以外(IME候補をマウスで選ぶ/ライブ変換の自動確定/
   * 他所クリックによる確定)でも発火する。その場合、直後に押した「本気のEnter」が1回だけ
   * 無視されるが、対象は可逆なトグルなのでもう一度押せば戻る(設計上許容している)。
   */
  const swallowEnterRef = useRef(false);
  // composingRef を false に戻すのは onCompositionEnd の1箇所だけ。
  // パレットを閉じるときにアンマウントされる前提(Task 17で `{tagPaletteOpen && <TagPalette />}`
  // のようにマウント/アンマウントで開閉する想定)でこの設計にしている。もしCSSでの
  // 表示/非表示切り替えに変えるなら、閉じるタイミングで composingRef.current = false に
  // リセットする処理を別途足すこと(でないと変換中に閉じた場合、ハイライトが永久に復活しなくなる)。

  const task = tasks.find((t) => t.id === selectedTaskId) ?? null;

  const rows = useMemo<TagRow[]>(() => {
    const q = query.trim().toLowerCase();
    const counts = new Map<string, number>();
    for (const t of tasks) {
      for (const id of t.tagIds) counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    const visible = allTags.filter((t) => q === "" || t.name.toLowerCase().includes(q));
    const decorate = (tag: Tag): TagRow => ({
      tag,
      attached: task?.tagIds.includes(tag.id) ?? false,
      count: counts.get(tag.id) ?? 0,
    });
    // 付与済みは task.tagIds の順（= tags.position 昇順）、未付与は使用件数の降順
    const attached = (task?.tagIds ?? [])
      .map((id) => visible.find((t) => t.id === id))
      .filter((t): t is Tag => t !== undefined)
      .map(decorate);
    const rest = visible
      .filter((t) => !(task?.tagIds.includes(t.id) ?? false))
      .map(decorate)
      .sort((a, b) => b.count - a.count || a.tag.position - b.tag.position);
    return [...attached, ...rest];
  }, [allTags, tasks, task, query]);

  const trimmedQuery = query.trim();
  // 完全一致するタグが既にあるなら「作成」は出さない（大文字小文字は無視）
  const canCreate =
    trimmedQuery !== "" &&
    !allTags.some((t) => t.name.trim().toLowerCase() === trimmedQuery.toLowerCase());

  // ConfirmDialogは自分でフォーカスを取るので、ここでは list / rename の2モードだけ面倒を見ればよい
  const mode: Mode =
    confirmDeleteId !== null ? "confirm-delete" : renamingId !== null ? "rename" : "list";

  /**
   * ⌘Kで開く直前にフォーカスがあった要素を覚えておき、閉じるときに戻す。
   * board側はuseKeyboardの印字キー処理(検索欄へフォーカスを戻す)で自己修復するが、
   * detail側はBlockNoteエディタへのフォーカスがTaskDetailマウント時の1回しか走らないため、
   * ここで戻してやらないとフォーカスが宙に浮いたまま(document.body)になり、
   * 本文を再クリックするまで入力できなくなる(C-1)。
   * マウント/アンマウントちょうど1回だけ走らせたいので、モードが変わるたびに走る
   * 下のフォーカス制御effectとは別に、空配列のeffectとして独立させている
   * (このeffectは他のeffectより先に宣言し、inputRef.focus()より前に実行させること。
   * でないと「パレット自身の入力欄」を覚えてしまう)。
   */
  useEffect(() => {
    const previouslyFocused =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    return () => {
      // 戻す先が既にDOMから消えている場合(詳細画面自体を離れた、タスクが削除されたなど)は
      // 何もしない。isConnectedでなければfocus()は実質何もしないはずだが、念のため明示する。
      if (previouslyFocused !== null && previouslyFocused.isConnected) {
        previouslyFocused.focus();
      }
    };
    // マウント時に一度だけ記憶し、アンマウント時に一度だけ戻したいので依存配列は空でよい
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 絞り込み文字列が変わったときは「今どこにいたか」より予測しやすさを優先し、常に先頭へ戻す
  // (候補が0件になったら着地点なしにする)。
  // ただし変換中はIME入力のたびにqueryが変化するため、ここで先頭へ戻すと
  // onCompositionStartで消したはずの着地点(null)が変換の途中で復活してしまう。
  // 着地点の管理は変換中だけonCompositionStart/Endに任せ、ここでは何もしない。
  useEffect(() => {
    if (composingRef.current) return;
    setHighlightId(rows[0]?.tag.id ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  // トグルによる並び替えなど、クエリ以外の理由でrowsが変わった場合は、
  // ハイライト中のタグがまだ候補に残っていればそのまま追随させ、消えたときだけ先頭へ戻す。
  // これも変換中は素通りさせる。変換中はhighlightIdがnullなのが正常な状態であり、
  // ここで「消えたので先頭へ戻す」と判定して復活させてしまうと着地点消しが台無しになる。
  useEffect(() => {
    if (composingRef.current) return;
    if (highlightId !== null && rows.some((row) => row.tag.id === highlightId)) return;
    setHighlightId(rows[0]?.tag.id ?? null);
  }, [rows, highlightId]);

  // モードが変わるたびにフォーカス先を切り替える(BoardSwitcher/StatusSettingsと同じ作法)。
  // ConfirmDialogを閉じたとき(confirm-delete → list)もここを通るので、
  // 「ダイアログを閉じたらキーボード操作が死ぬ」事故をこの1箇所で防げる。
  useEffect(() => {
    if (mode === "list") inputRef.current?.focus();
    if (mode === "rename") {
      renameInputRef.current?.focus();
      renameInputRef.current?.select();
    }
    // confirm-delete: ConfirmDialogが自分でフォーカスを取るので何もしない
  }, [mode]);

  const highlightIndex = highlightId === null ? -1 : rows.findIndex((row) => row.tag.id === highlightId);

  const moveHighlight = (delta: 1 | -1) => {
    if (rows.length === 0) {
      setHighlightId(null);
      return;
    }
    const base = highlightIndex === -1 ? 0 : highlightIndex;
    const next = Math.min(Math.max(base + delta, 0), rows.length - 1);
    setHighlightId(rows[next]?.tag.id ?? null);
  };

  // 行クリック後もタイピングを続けられるよう、フォーカスは常に入力欄に残す。
  // 行のdivはtabIndexを持たないフォーカス不可能な要素なので、クリック(mousedown)の
  // デフォルト動作を止めないと入力欄からフォーカスが外れ、以後キー操作が効かなくなる。
  const handleRowActivate = (tagId: string) => {
    void toggleTaskTag(tagId);
    inputRef.current?.focus();
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    // window側のハンドラへ漏らさない（useKeyboard 側でも tagPaletteOpen で止めているが二重に守る）
    event.stopPropagation();

    // IMEが処理中のキーは一切拾わない。keyCode 229 は isComposing を立てない環境の合図。
    // ⌘Enter(作成)や⌘⌫(削除)を含む全キーに効かせる。修飾キー付きだからIMEが生成できない
    // というだけで、変換の最中にたまたま同じ物理キーが押される可能性は消せないため
    // (例: 変換中にユーザーが誤って⌘を押しながら確定しようとした場合など)。
    if (event.nativeEvent.isComposing || event.keyCode === 229) return;

    // 変換確定の直後に届くEnterを1回だけ飲み込む。
    // WebKitは compositionend を keydown より先に発火するため、上のisComposingガードだけでは
    // 変換確定のEnterを取りこぼす。待機はどのキーでも解除するので、確定後に別のキーを
    // 打てば次のEnterは通常どおり効く。
    if (swallowEnterRef.current) {
      swallowEnterRef.current = false;
      if (event.key === "Enter") {
        event.preventDefault();
        return;
      }
    }

    if (event.key === "Escape") {
      event.preventDefault();
      closeTagPalette();
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      moveHighlight(1);
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      moveHighlight(-1);
      return;
    }

    if (event.metaKey && event.key === "Enter") {
      // IMEは修飾キー付きEnterを生成しないので、変換確定で誤って作られることがない
      event.preventDefault();
      if (!canCreate) return;
      void createTagAndAttach(trimmedQuery);
      setQuery("");
      return;
    }

    if (event.metaKey && (event.key === "r" || event.key === "R")) {
      event.preventDefault();
      const row = rows[highlightIndex];
      if (row === undefined) return;
      setRenamingId(row.tag.id);
      setRenameValue(row.tag.name);
      return;
    }

    if (event.metaKey && event.key === "Backspace") {
      event.preventDefault();
      const row = rows[highlightIndex];
      if (row === undefined) return;
      setConfirmDeleteId(row.tag.id);
      return;
    }

    if (event.key === "Backspace" && !event.metaKey && query === "") {
      // トークン入力の慣習に合わせ、入力欄が空のときだけ末尾のタグを外す
      const lastId = task?.tagIds[task.tagIds.length - 1];
      if (lastId === undefined) return;
      event.preventDefault();
      void toggleTaskTag(lastId);
      return;
    }

    if (event.key === "Enter" && !event.metaKey) {
      event.preventDefault();
      const row = rows[highlightIndex];
      if (row === undefined) return;
      // トグルは可逆なので、万一の誤爆でももう一度押せば戻る
      void toggleTaskTag(row.tag.id);
      setQuery("");
      return;
    }
  };

  const activeOptionId = highlightId === null ? undefined : `tag-palette-option-${highlightId}`;

  return (
    <div
      data-testid="tag-palette-scrim"
      className="absolute inset-0 z-30 flex items-start justify-center bg-black/[0.18] pt-16 backdrop-blur-[1px]"
      onClick={closeTagPalette}
    >
      <div
        ref={containerRef}
        role="dialog"
        aria-label="タグ"
        // BoardSwitcher/ConfirmDialogと同じく、コンテナ自体をフォーカス可能にしておく
        // (最終的なフォーカスは入力欄に置くが、何らかの理由でフォーカスが外れても
        // documentまで飛ばさずこの中に留めるための保険)
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        // rename中は専用の入力欄側(stopPropagation済み)で処理するので、ここには渡さない。
        // confirm-delete中はConfirmDialog側が処理する(BoardSwitcher/StatusSettingsと同じ作法)。
        onKeyDown={mode === "list" ? handleKeyDown : undefined}
        // relative: ConfirmDialog(absolute inset-0)をこのカードの範囲だけに重ねるため
        // (無指定だと外側のscrim(absolute inset-0)を基準にしてしまい、画面全体を覆ってしまう)
        // ガラス(Palette本体)の上に浮くカードなので、ガラスの二重掛けを避けて
        // ConfirmDialog / トースト / BlockNoteメニューと同じ不透明面(av-surface-raised)にする
        className="av-surface-raised relative flex max-h-[260px] w-[300px] flex-col overflow-hidden rounded-xl shadow-xl"
      >
        <header
          className="flex items-center gap-1.5 border-b px-3 py-2"
          style={{ borderColor: "var(--av-hairline)" }}
        >
          <TagIcon size={13} style={{ color: "var(--av-text-muted)" }} />
          <span
            className="truncate text-[11px]"
            style={{ color: "var(--av-text-secondary)" }}
          >
            {task?.title ?? ""}
          </span>
        </header>

        <input
          ref={inputRef}
          data-testid="tag-palette-input"
          aria-label="タグを検索または作成"
          aria-activedescendant={activeOptionId}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onCompositionStart={() => {
            composingRef.current = true;
            // 変換中はEnterの着地点そのものを消す。これで変換確定Enterが万一漏れても何も起きない
            setHighlightId(null);
          }}
          onCompositionEnd={() => {
            composingRef.current = false;
            // 直後に届くかもしれない変換確定のEnterを1回だけ飲み込む準備をする
            swallowEnterRef.current = true;
            setHighlightId(rows[0]?.tag.id ?? null);
          }}
          autoComplete="off"
          spellCheck={false}
          placeholder="タグ名を入力"
          className="av-input bg-transparent px-3 py-2 text-[13px] outline-none"
          style={{ color: "var(--av-text-primary)" }}
        />

        <div role="listbox" aria-label="タグ候補" className="min-h-0 flex-1 overflow-y-auto px-1.5 pb-1.5">
          {rows.map((row) => (
            <TagPaletteRow
              key={row.tag.id}
              row={row}
              highlighted={row.tag.id === highlightId}
              isRenaming={renamingId === row.tag.id}
              renameValue={renameValue}
              onRenameValueChange={setRenameValue}
              renameInputRef={renameInputRef}
              // list以外(rename中/confirm-delete中)は、どの行のクリックもトグルに繋げない。
              // 「自分が改名中の行か」ではなく「今リスト操作モードか」で止めるのが重要
              // (でないと改名中に別の行をクリックしてトグルが走ってしまう)。
              clickable={mode === "list"}
              onActivate={() => handleRowActivate(row.tag.id)}
              onRenameCommit={() => {
                void renameTag(row.tag.id, renameValue);
                setRenamingId(null);
              }}
              onRenameCancel={() => setRenamingId(null)}
            />
          ))}
        </div>

        {canCreate && mode === "list" && (
          <div
            data-testid="tag-palette-create"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              void createTagAndAttach(trimmedQuery);
              setQuery("");
            }}
            className="flex cursor-default items-center gap-2 border-t px-3 py-1.5 text-[12px]"
            style={{
              borderColor: "var(--av-hairline)",
              color: "var(--av-text-secondary)",
            }}
          >
            <span className="min-w-0 flex-1 truncate">＋「{trimmedQuery}」を作成</span>
            <span className="shrink-0 text-[10px]">⌘⏎</span>
          </div>
        )}

        <footer
          className="flex flex-wrap gap-x-2.5 gap-y-1 border-t px-3 py-1.5 text-[9.5px]"
          style={{
            borderColor: "var(--av-hairline)",
            color: "var(--av-text-muted)",
          }}
        >
          <span>⏎ 付け外し</span>
          <span>⌘⏎ 作成</span>
          <span>⌘R 改名</span>
          <span>⌘⌫ 削除</span>
          <span>Esc 閉じる</span>
        </footer>

        {confirmDeleteId !== null && (
          <ConfirmDialog
            title={`「${allTags.find((t) => t.id === confirmDeleteId)?.name ?? ""}」を削除しますか？`}
            description={`${
              tasks.filter((t) => t.tagIds.includes(confirmDeleteId)).length
            }件のタスクからこのタグが外れます。元に戻せません。`}
            confirmLabel="削除"
            onConfirm={() => {
              void deleteTag(confirmDeleteId);
              setConfirmDeleteId(null);
            }}
            onCancel={() => setConfirmDeleteId(null)}
          />
        )}
      </div>
    </div>
  );
}
