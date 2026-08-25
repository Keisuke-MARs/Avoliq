import type { CSSProperties } from "react";
import { TaskCard } from "./TaskCard";
import type { Status, Task } from "@/types";

interface LaneProps {
  status: Status;
  tasks: Task[];
  selectedTaskId: string | null;
}

export function Lane({ status, tasks, selectedTaskId }: LaneProps) {
  // レーンの幅は min-w-0 ではなく min-w-[160px]。min-w-0 はコンテンツ幅より
  // 小さく縮めるために置かれていたが、下限が無いためステータスを増やすほど
  // レーンが潰れる（8レーンで約95px＝2〜3文字で折り返し、実質読めない）。
  // 160px は 880px 幅で5レーンまで横スクロールせずに収まる最大の丸い値
  // （160×5 + gap 48 + padding 24 = 872 ≤ 880）。
  // このときタイトル幅は 160 − 24 − 14 = 122px で、2行なら約19文字。
  return (
    <section
      data-testid="lane"
      data-status-id={status.id}
      className="flex flex-1 min-w-[160px] flex-col"
    >
      <header className="mb-2 flex items-center gap-1.5 px-1">
        {/*
          ステータスのアイコンは常に丸1種類で、色だけをステータス色に塗る。
          ユーザーがステータスを自由に追加・改名できるため、
          名前やposition順でアイコンを出し分けるとカスタムステータスで破綻するため。
        */}
        <span
          className="av-status-dot h-2.5 w-2.5 shrink-0 rounded-full"
          style={{ "--av-status": status.color } as CSSProperties}
        />
        <span
          className="text-[12px] font-semibold"
          style={{ color: "var(--av-text-secondary)" }}
        >
          {status.name}
        </span>
        <span
          data-testid="lane-count"
          className="ml-auto text-[11px] tabular-nums"
          style={{ color: "var(--av-text-secondary)" }}
        >
          {tasks.length}
        </span>
      </header>
      <div className="flex-1 space-y-1.5 overflow-y-auto pb-1">
        {tasks.length === 0 && (
          <div
            className="rounded-lg border border-dashed px-3 py-4 text-center text-xs"
            style={{
              borderColor: "var(--av-hairline)",
              color: "var(--av-text-muted)",
            }}
          >
            なし
          </div>
        )}
        {tasks.map((task) => (
          <TaskCard
            key={task.id}
            task={task}
            statusColor={status.color}
            selected={task.id === selectedTaskId}
          />
        ))}
      </div>
    </section>
  );
}
