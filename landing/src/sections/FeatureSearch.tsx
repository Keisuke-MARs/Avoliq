import { Reveal } from "../components/Reveal";
import { Shot } from "../components/Shot";

export function FeatureSearch() {
  return (
    <section className="bg-av-surface px-6 py-28">
      <div className="mx-auto max-w-[64rem]">
        <Reveal>
          <div className="text-[11px] uppercase tracking-[0.14em] text-av-azure">
            Capture
          </div>
          <h2 className="mt-3 max-w-[28rem] text-[clamp(1.6rem,4vw,2.25rem)] font-semibold leading-[1.45] tracking-[-0.03em]">
            その場で検索、
            <br />
            その場で作成。
          </h2>
          <p className="mt-4 max-w-[32rem] text-sm leading-[1.95] text-av-body">
            検索欄に打った文字が、そのままタスク名になります。
            探して見つからなければ、Enter を押すだけでそれが新しいタスクになる。
            「あとで書こう」と思って忘れる余地がありません。
          </p>
        </Reveal>

        <Reveal delay={0.08} className="mt-12">
          <Shot
            src={`${import.meta.env.BASE_URL}shots/search.png`}
            alt="検索欄にタスク名を入力した状態で、Enter でそのまま新規作成できると案内されている画面"
          />
        </Reveal>
      </div>
    </section>
  );
}
