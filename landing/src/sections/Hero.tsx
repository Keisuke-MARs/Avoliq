import { layerPointerEvents } from "../lib/motion";

interface HeroProps {
  opacity: number;
  y: number;
}

export function Hero({ opacity, y }: HeroProps) {
  return (
    <div
      className="w-full text-center"
      style={{
        opacity,
        transform: `translateY(${y}px)`,
        // opacity が薄い（=実質見えていない）ときはリンクの当たり判定も消す。
        // テキスト層は Hero / Statement / Keyboard を同じセルに重ねてクロスフェードさせる構造なので、
        // pointer-events を CSS クラスの固定値にすると、見えなくなった後もボタンだけ押せてしまう。
        pointerEvents: layerPointerEvents(opacity),
      }}
    >
      <div className="text-[11px] uppercase tracking-[0.14em] text-av-azure">
        for macOS
      </div>
      <h1 className="mt-3 text-[clamp(3rem,9vw,4.5rem)] font-semibold leading-none tracking-[-0.03em]">
        Avoliq
      </h1>
      <p className="mt-4 text-[clamp(1rem,2.4vw,1.25rem)] font-medium tracking-[-0.01em]">
        直感的に、自然に思考を整え、次へ進める。
      </p>
      <p className="mx-auto mt-3.5 max-w-[34rem] text-sm leading-[1.9] text-av-body">
        Alt + Space。画面の中央にパレットが開いて、キーボードだけでタスクが片づく。
        <br className="hidden sm:inline" />
        用が済んだら Esc で消える。
      </p>
      <div className="mt-7 flex flex-wrap justify-center gap-2.5">
        <a
          href="https://github.com/Keisuke-MARs/Avoliq"
          className="rounded-full bg-av-blue px-5 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-85"
        >
          GitHub で見る
        </a>
        <a
          href="#design-notes"
          className="rounded-full border border-white/20 px-5 py-2.5 text-sm transition-colors hover:bg-white/10"
        >
          設計を読む
        </a>
      </div>
    </div>
  );
}
