import type { ReactNode } from "react";
import type { DemoState } from "../lib/motion";

const INBOX = ["LPの構成を決める", "配色トークンを整理"];
const DOING = ["ヒーローを実装する"];
const DONE = ["ブランド資産を作る", "タグ機能"];

interface PaletteMockProps {
  demo: DemoState;
}

function Card({
  label,
  selected,
  children,
  className = "",
}: {
  label: string;
  selected: boolean;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={[
        "relative flex h-8 items-center rounded-md px-2.5 text-[11px] text-av-body",
        // Tailwind v4 では translate-x-* / translate-y-* は transform ではなく
        // ネイティブの CSS translate プロパティを出力する。そのため transition の対象には
        // transform ではなく translate を指定する必要がある（指定を誤ると瞬間移動になる）。
        "transition-[background-color,box-shadow,translate] duration-500 ease-av",
        selected
          ? "bg-av-blue/30 shadow-[0_0_0_1px_var(--color-av-azure)]"
          : "bg-white/10",
        className,
      ].join(" ")}
    >
      <span className="truncate">{label}</span>
      {children}
    </div>
  );
}

function Lane({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex flex-1 flex-col gap-1.5">
      <div className="text-[9px] uppercase tracking-[0.09em] text-av-muted">
        {title}
      </div>
      {/* カード3枚分の高さを常に確保する。挿入の演出でカードが1枚分下がっても
          パレットの枠からはみ出さないようにするため（transform はレイアウトの寸法を変えない）。
          6.75rem = カード高さ 2rem × 3 + カード間 0.375rem × 2 */}
      <div className="flex min-h-[6.75rem] flex-col gap-1.5">{children}</div>
    </div>
  );
}

export function PaletteMock({ demo }: PaletteMockProps) {
  return (
    <div
      className={[
        "w-[min(92vw,460px)] rounded-2xl border border-white/[0.13] p-3",
        "bg-[#141a23]/70 backdrop-blur-2xl",
        "shadow-[0_34px_80px_rgba(0,0,0,0.7),inset_0_1px_0_rgba(255,255,255,0.16)]",
      ].join(" ")}
    >
      <div className="flex h-7 items-center rounded-lg bg-white/[0.08] px-2.5 text-[11px] text-av-muted">
        タスクを検索、または入力して作成
      </div>

      <div className="mt-2.5 flex gap-2">
        <Lane title="Inbox">
          <Card label={INBOX[0]} selected={demo.selectedCard === 0} />
          <Card label={INBOX[1]} selected={demo.selectedCard === 1} />
        </Lane>

        <Lane title="Doing">
          <Card
            label={DOING[0]}
            selected={demo.selectedCard === 2}
            className={[
              // レーン幅とカード幅は flex-1 で一致するので、隣レーンへの移動量は
              // 「レーン幅1つ分 + レーン間の gap-2（0.5rem）」が厳密値になる
              demo.cardMoved ? "translate-x-[calc(100%+0.5rem)]" : "",
              // 移動中は Done レーンのカードと一瞬すれ違うので、必ず手前に出す
              demo.cardMoved ? "z-10" : "",
            ].join(" ")}
          >
            <span
              className={[
                "absolute right-2 h-3 w-7 rounded bg-av-azure/45",
                // scale-* も translate-* と同じ理由で transform ではなく scale プロパティを出力する
                "transition-[opacity,scale] duration-300 ease-av",
                demo.chipOn ? "scale-100 opacity-100" : "scale-50 opacity-0",
              ].join(" ")}
            />
          </Card>
        </Lane>

        <Lane title="Done">
          {/*
            「上に乗る」のではなく「挿入されて既存カードが場所を空ける」ように見せる。
            移動量は「カード1枚分の高さ（h-8 = 2rem）+ カード間の隙間（gap-1.5 = 0.375rem）」。
            高さや隙間の値を変えたときはここも合わせて調整すること。
          */}
          <Card
            label={DONE[0]}
            selected={false}
            className={demo.cardMoved ? "translate-y-[calc(2rem+0.375rem)]" : ""}
          />
          <Card
            label={DONE[1]}
            selected={false}
            className={demo.cardMoved ? "translate-y-[calc(2rem+0.375rem)]" : ""}
          />
        </Lane>
      </div>
    </div>
  );
}
