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
        "transition-[background-color,box-shadow,transform] duration-500 ease-av",
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
      {children}
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
            className={demo.cardMoved ? "translate-x-[104%]" : ""}
          >
            <span
              className={[
                "absolute right-2 h-3 w-7 rounded bg-av-azure/45",
                "transition-[opacity,transform] duration-300 ease-av",
                demo.chipOn ? "scale-100 opacity-100" : "scale-50 opacity-0",
              ].join(" ")}
            />
          </Card>
        </Lane>

        <Lane title="Done">
          <Card label={DONE[0]} selected={false} />
          <Card label={DONE[1]} selected={false} />
        </Lane>
      </div>
    </div>
  );
}
