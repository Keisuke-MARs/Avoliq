/**
 * Keyboard セクションの表示を2つに分けている。
 * 見出し（KeyboardHeading）はテキスト層、キーキャップ列（KeycapRow）は3行目に置くため、
 * ステージのグリッドで属する行が違う。だからコンポーネントも分けている。
 */
import { Keycap } from "../components/Keycap";
import { KEYS } from "../lib/keyboardKeys";
import { layerPointerEvents } from "../lib/motion";

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
    // リンクやクリック対象を含まない（キーキャップは表示のみ）ので、
    // Statement / KeyboardHeading と違って pointer-events の制御は不要。
    <div className="flex flex-wrap justify-center gap-2" style={{ opacity }}>
      {KEYS.map((k, i) => (
        <Keycap key={`${k}-${i}`} label={k} lit={litKey === i} />
      ))}
    </div>
  );
}
