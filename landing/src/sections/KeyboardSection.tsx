import { Keycap } from "../components/Keycap";
import { layerPointerEvents } from "../lib/motion";

/** 実演で光らせるキー。数は motion.ts の DEMO_KEY_COUNT と一致させること（テストで縛っている） */
export const KEYS = ["↓", "↓", "⌘K", "⌘→"];

export function KeyboardHeading({ opacity }: { opacity: number }) {
  return (
    <div
      className="w-full text-center"
      style={{ opacity, pointerEvents: layerPointerEvents(opacity) }}
    >
      <div className="text-[11px] uppercase tracking-[0.14em] text-av-azure">
        Keyboard
      </div>
      <h2 className="mt-3 text-[clamp(1.6rem,4.4vw,2.25rem)] font-semibold tracking-[-0.03em]">
        手は、ホームポジションから離れない。
      </h2>
      <p className="mx-auto mt-3.5 max-w-[33rem] text-sm leading-[1.9] text-av-body">
        矢印で選び、⌘K でタグを付け、⌘→ で次のステータスへ。
        <br className="hidden sm:inline" />
        マウスに持ち替える瞬間が、そもそも要りません。
      </p>
    </div>
  );
}

export function KeycapRow({
  opacity,
  litKey,
}: {
  opacity: number;
  litKey: number;
}) {
  return (
    <div className="flex flex-wrap justify-center gap-2" style={{ opacity }}>
      {KEYS.map((k, i) => (
        <Keycap key={`${k}-${i}`} label={k} lit={litKey === i} />
      ))}
    </div>
  );
}
