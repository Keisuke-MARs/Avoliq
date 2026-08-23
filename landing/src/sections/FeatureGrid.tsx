import { Reveal } from "../components/Reveal";

const ITEMS = [
  {
    title: "Markdown の詳細エディタ",
    body: "本文は BlockNote で編集します。入力は自動保存され、パレットを閉じるときに確実に書き出されます。",
  },
  {
    title: "複数ボードの切り替え",
    body: "用途ごとにボードを分けて、⌘B で行き来します。仕事と私用を混ぜずに済みます。",
  },
  {
    title: "削除の取り消し",
    body: "削除はソフトデリートです。⌘Z を押せば、消す前と同じ位置に戻ります。",
  },
  {
    title: "メニューバー常駐",
    body: "Dock を占有せず、メニューバーに置いておけます。ログイン時の自動起動も設定から選べます。",
  },
  {
    title: "ライト・ダークの両対応",
    body: "システムの外観に追従します。コントラストは両方のモードで WCAG AA 基準を満たすよう検証しています。",
  },
  {
    title: "常に出ているキーのヒント",
    body: "画面下部に、いまの画面で使えるキーが常時表示されます。覚える前から使えます。",
  },
];

export function FeatureGrid() {
  return (
    <section className="bg-av-bg px-6 py-28">
      <div className="mx-auto max-w-[64rem]">
        <Reveal>
          <h2 className="text-[clamp(1.5rem,3.6vw,2rem)] font-semibold tracking-[-0.03em]">
            そのほかの機能
          </h2>
        </Reveal>

        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {ITEMS.map((item, i) => (
            <Reveal key={item.title} delay={0.04 * i}>
              <div className="h-full rounded-2xl border border-white/10 bg-av-surface/60 px-6 py-7">
                <h3 className="text-[15px] font-semibold">{item.title}</h3>
                <p className="mt-3 text-[13px] leading-[1.85] text-av-body">
                  {item.body}
                </p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
