import { Circle } from "lucide-react";
import { TaskCard } from "./TaskCard";
import type { Status, Task } from "@/types";

interface LaneProps {
  status: Status;
  tasks: Task[];
  selectedTaskId: string | null;
}

export function Lane({ status, tasks, selectedTaskId }: LaneProps) {
  return (
    <section
      data-testid="lane"
      data-status-id={status.id}
      className="flex flex-1 min-w-0 flex-col"
    >
      <header className="mb-2 flex items-center gap-1.5 px-1">
        {/*
          ステータスのアイコンは常に Circle 1種類で、色だけをステータス色に塗る。
          ユーザーがステータスを自由に追加・改名できるため、
          名前やposition順でアイコンを出し分けるとカスタムステータスで破綻するため。
        */}
        <Circle size={10} stroke={status.color} fill={status.color} strokeWidth={2} />
        <span
          className="text-[12px] font-semibold"
          style={{ color: "var(--av-text-secondary)" }}
        >
          {status.name}
        </span>
        <span
          data-testid="lane-count"
          className="ml-auto text-[11px] tabular-nums"
          style={{ color: "var(--av-text-muted)" }}
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
