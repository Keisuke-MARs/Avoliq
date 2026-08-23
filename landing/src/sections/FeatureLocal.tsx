import { Reveal } from "../components/Reveal";

const FACTS = [
  {
    head: "ファイル1つ",
    body: "~/Library/Application Support/Avoliq/avoliq.db",
  },
  {
    head: "通信ゼロ",
    body: "外部への送信も、外部からの取得もありません",
  },
  {
    head: "バックアップは複製",
    body: "そのファイルをコピーするだけで完了します",
  },
];

export function FeatureLocal() {
  return (
    <section className="relative overflow-hidden bg-av-deep px-6 py-32">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(45% 55% at 50% 50%, rgba(97,94,255,0.16), transparent 70%)",
        }}
      />

      <div className="relative mx-auto max-w-[56rem] text-center">
        <Reveal>
          <div className="text-[11px] uppercase tracking-[0.14em] text-av-azure">
            Local only
          </div>
          <h2 className="mx-auto mt-4 max-w-[36rem] text-[clamp(1.9rem,5.2vw,2.9rem)] font-semibold leading-[1.4] tracking-[-0.03em]">
            書いたものは、
            <br />
            この端末から出ません。
          </h2>
          <p className="mx-auto mt-5 max-w-[34rem] text-sm leading-[2] text-av-body">
            アカウントも同期もありません。そのかわり、誰にも見せない
            考えごとを、そのまま書き留められます。
          </p>
        </Reveal>

        <Reveal delay={0.1} className="mt-14">
          <dl className="grid gap-4 sm:grid-cols-3">
            {FACTS.map((f) => (
              <div
                key={f.head}
                className="rounded-2xl border border-white/10 bg-av-surface/70 px-5 py-6 text-left"
              >
                <dt className="text-sm font-semibold">{f.head}</dt>
                <dd className="mt-2 break-all text-xs leading-[1.8] text-av-body">
                  {f.body}
                </dd>
              </div>
            ))}
          </dl>
        </Reveal>
      </div>
    </section>
  );
}
