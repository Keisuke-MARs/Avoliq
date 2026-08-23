import { Reveal } from "../components/Reveal";

const REPO = "https://github.com/Keisuke-MARs/Avoliq";

export function Footer() {
  return (
    <footer className="relative overflow-hidden bg-av-deep px-6 pb-16 pt-32">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(50% 60% at 50% 0%, rgba(10,132,255,0.20), transparent 70%)",
        }}
      />

      <div className="relative mx-auto max-w-[52rem] text-center">
        <Reveal>
          <h2 className="text-[clamp(1.7rem,4.6vw,2.5rem)] font-semibold leading-[1.4] tracking-[-0.03em]">
            コードは、すべて公開しています。
          </h2>
          <p className="mx-auto mt-4 max-w-[32rem] text-sm leading-[1.95] text-av-body">
            ここに書いた判断が実際にどう実装されているかは、リポジトリで確かめられます。
          </p>
          <div className="mt-8">
            <a
              href={REPO}
              className="inline-block rounded-full bg-av-blue px-6 py-3 text-sm font-medium text-white transition-opacity hover:opacity-85"
            >
              GitHub で見る
            </a>
          </div>
        </Reveal>

        <div className="mt-24 flex flex-col items-center gap-4 border-t border-white/10 pt-10">
          <img
            src={`${import.meta.env.BASE_URL}avoliq-logo.png`}
            alt="Avoliq"
            width={132}
            className="opacity-70"
          />
          <p className="text-xs text-av-muted">
            Avoliq — 直感的に、自然に思考を整え、次へ進める。
          </p>
        </div>
      </div>
    </footer>
  );
}
