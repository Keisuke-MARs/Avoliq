import { Reveal } from "../components/Reveal";

interface Note {
  index: string;
  title: string;
  problem: string;
  choice: string;
  why: string;
  result: string;
}

const NOTES: Note[] = [
  {
    index: "01",
    title: "ウィンドウの作法",
    problem:
      "普通のウィンドウとして出すと、開いた瞬間に作業中のアプリからフォーカスを奪ってしまう。Cmd+Tab の循環にも並んでしまい、「ちょっと見るだけ」の道具にならない。",
    choice: "Tauri v2 と tauri-nspanel による NSPanel 化",
    why: "NSPanel は macOS が Spotlight などに使っているウィンドウ種別で、キー入力は受け取りながら、背後のアプリのアクティブ状態を保てる。同じ振る舞いを通常ウィンドウで再現しようとすると、フォーカス制御を手で組むことになり破綻しやすい。",
    result:
      "Alt + Space で最前面に出て、Esc で消える。背後のエディタはアクティブなままで、閉じた瞬間にカーソルが戻る。",
  },
  {
    index: "02",
    title: "データを閉じる",
    problem:
      "タスクには、他人に見せる前提のない書きかけの考えが入る。同期を前提にすると、置き場所と権限の設計が必要になり、書く手前にためらいが生まれる。",
    choice: "Rust と rusqlite によるローカル SQLite",
    why: "同期を捨てる代わりに、外部通信をゼロにできる。SQLite なら単一ファイルで完結し、バックアップも移行もファイル操作だけで済む。SQLite 自体をビルドに同梱しているので、実行環境に依存しない。",
    result:
      "データは ~/Library/Application Support/Avoliq/avoliq.db ひとつ。壊れてもコピーを戻せば済む。",
  },
  {
    index: "03",
    title: "色を一元管理する",
    problem:
      "shadcn/ui と BlockNote という2つのライブラリがそれぞれ独自の CSS 変数を持っており、放っておくと色の実値が3か所に散る。ライトとダークで別々にずれていき、コントラストの担保もできなくなる。",
    choice: "色の実値を --av-* にだけ置き、他はすべてそこを参照させる",
    why: "実値の置き場所を1か所に決めておけば、モードの追加もコントラストの検証もその1か所を見れば済む。shadcn の CLI が生成する直値をそのまま残すと、この前提が静かに壊れる。",
    result:
      "ライト・ダーク両方の文字色と背景色の組み合わせを WCAG AA 基準で検証済み。色を変えるときに触るファイルは1つ。",
  },
];

export function DesignNotes() {
  return (
    <section id="design-notes" className="bg-av-surface px-6 py-28">
      <div className="mx-auto max-w-[52rem]">
        <Reveal>
          <div className="text-[11px] uppercase tracking-[0.14em] text-av-azure">
            Design Notes
          </div>
          <h2 className="mt-3 text-[clamp(1.6rem,4vw,2.25rem)] font-semibold tracking-[-0.03em]">
            なぜ、この設計にしたか。
          </h2>
        </Reveal>

        <div className="mt-14 flex flex-col gap-16">
          {NOTES.map((note) => (
            <Reveal key={note.index}>
              <article>
                <div className="flex items-baseline gap-4">
                  <span className="text-sm tabular-nums text-av-muted">
                    {note.index}
                  </span>
                  <h3 className="text-xl font-semibold tracking-[-0.02em]">
                    {note.title}
                  </h3>
                </div>

                <dl className="mt-6 flex flex-col gap-5 border-l border-white/10 pl-6">
                  <div>
                    <dt className="text-[11px] uppercase tracking-[0.12em] text-av-muted">
                      課題
                    </dt>
                    <dd className="mt-1.5 text-sm leading-[1.95] text-av-body">
                      {note.problem}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[11px] uppercase tracking-[0.12em] text-av-muted">
                      選んだもの
                    </dt>
                    <dd className="mt-1.5 text-sm leading-[1.95] text-av-ink">
                      {note.choice}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[11px] uppercase tracking-[0.12em] text-av-muted">
                      なぜ
                    </dt>
                    <dd className="mt-1.5 text-sm leading-[1.95] text-av-body">
                      {note.why}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[11px] uppercase tracking-[0.12em] text-av-muted">
                      結果
                    </dt>
                    <dd className="mt-1.5 text-sm leading-[1.95] text-av-body">
                      {note.result}
                    </dd>
                  </div>
                </dl>
              </article>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
