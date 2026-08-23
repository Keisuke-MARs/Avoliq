import { Reveal } from "../components/Reveal";
import { Shot } from "../components/Shot";

export function FeatureBoard() {
  return (
    <section className="bg-av-surface px-6 pb-28">
      <div className="mx-auto max-w-[64rem]">
        <Reveal>
          <div className="text-[11px] uppercase tracking-[0.14em] text-av-azure">
            Organize
          </div>
          <h2 className="mt-3 max-w-[28rem] text-[clamp(1.6rem,4vw,2.25rem)] font-semibold leading-[1.45] tracking-[-0.03em]">
            ボードとタグで、
            <br />
            並べ替えずに整える。
          </h2>
          <p className="mt-4 max-w-[32rem] text-sm leading-[1.95] text-av-body">
            ステータスごとにレーンが並び、⌘K でタグを付け外しします。
            検索欄に # と打てば候補が出て、そのまま絞り込めます。
            レーンの名前も色も並び順も、あとから変えられます。
          </p>
        </Reveal>

        <Reveal delay={0.08} className="mt-12">
          <Shot
            src={`${import.meta.env.BASE_URL}shots/board.png`}
            alt="3つのレーンにカードが並び、カードにタグが付いているボード画面"
          />
        </Reveal>
      </div>
    </section>
  );
}
