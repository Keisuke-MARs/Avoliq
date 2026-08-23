import { layerPointerEvents } from "../lib/motion";

interface StatementProps {
  opacity: number;
  y: number;
}

export function Statement({ opacity, y }: StatementProps) {
  return (
    <div
      className="w-full text-center"
      style={{
        opacity,
        transform: `translateY(${y}px)`,
        pointerEvents: layerPointerEvents(opacity),
      }}
    >
      <h2 className="mx-auto max-w-[40rem] text-[clamp(1.75rem,5vw,2.5rem)] font-semibold leading-[1.4] tracking-[-0.03em]">
        タスクを増やさない。
        <br />
        迷いを減らす。
      </h2>
      <p className="mx-auto mt-5 max-w-[35rem] text-sm leading-[2] text-av-body">
        管理するために書くのではなく、次の一歩を選ぶために書く。
        <br className="hidden sm:inline" />
        だから Avoliq には、溜めるための機能がありません。
      </p>
    </div>
  );
}
