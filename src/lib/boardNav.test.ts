import { describe, expect, it } from "vitest";
import {
  buildLanes,
  filterTasks,
  locateTask,
  nextSelectedTaskId,
  selectionAfterDelete,
} from "./boardNav";
import { statuses, tasks } from "@/test/fixtures";

const lanes = buildLanes(statuses, tasks);

describe("filterTasks", () => {
  it("空クエリなら全件返す", () => {
    expect(filterTasks(tasks, "")).toHaveLength(6);
  });

  it("タイトルの部分一致で絞り込む", () => {
    expect(filterTasks(tasks, "牛").map((t) => t.id)).toEqual(["t-a", "t-c"]);
  });

  it("前後の空白を無視する", () => {
    expect(filterTasks(tasks, "  牛丼  ").map((t) => t.id)).toEqual(["t-c"]);
  });

  it("英字は大文字小文字を区別しない", () => {
    const withAscii = [...tasks, { ...tasks[0], id: "t-g", title: "Release Note" }];
    expect(filterTasks(withAscii, "release").map((t) => t.id)).toEqual(["t-g"]);
  });

  it("一致しなければ空配列", () => {
    expect(filterTasks(tasks, "存在しない")).toEqual([]);
  });
});

describe("buildLanes", () => {
  it("ステータスをposition昇順に並べる", () => {
    expect(lanes.map((l) => l.status.id)).toEqual(["st-todo", "st-doing", "st-check", "st-done"]);
  });

  it("各レーンのタスクをposition昇順に並べる", () => {
    expect(lanes[0].tasks.map((t) => t.id)).toEqual(["t-a", "t-b", "t-c"]);
  });

  it("タスクの無いレーンも空配列で残す", () => {
    expect(lanes[2].tasks).toEqual([]);
  });

  it("statusesの入力順が乱れていてもposition順に直す", () => {
    const shuffled = [statuses[3], statuses[1], statuses[0], statuses[2]];
    expect(buildLanes(shuffled, tasks).map((l) => l.status.id)).toEqual([
      "st-todo",
      "st-doing",
      "st-check",
      "st-done",
    ]);
  });
});

describe("locateTask", () => {
  it("レーン番号と行番号を返す", () => {
    expect(locateTask(lanes, "t-e")).toEqual({ lane: 1, row: 1 });
  });

  it("存在しないIDには null を返す", () => {
    expect(locateTask(lanes, "t-zzz")).toBeNull();
  });
});

describe("nextSelectedTaskId", () => {
  it("未選択で↓なら一番左の空でないレーンの先頭を選ぶ", () => {
    expect(nextSelectedTaskId(lanes, null, "down")).toBe("t-a");
  });

  it("未選択で↑なら選択しないまま", () => {
    expect(nextSelectedTaskId(lanes, null, "up")).toBeNull();
  });

  it("未選択で←→なら選択しないまま", () => {
    expect(nextSelectedTaskId(lanes, null, "left")).toBeNull();
    expect(nextSelectedTaskId(lanes, null, "right")).toBeNull();
  });

  it("タスクが1件も無ければ↓でも選択しない", () => {
    expect(nextSelectedTaskId(buildLanes(statuses, []), null, "down")).toBeNull();
  });

  it("一番左のレーンが空なら↓は次に空でないレーンの先頭を選ぶ", () => {
    const onlyDoing = buildLanes(
      statuses,
      tasks.filter((t) => t.statusId === "st-doing"),
    );
    expect(nextSelectedTaskId(onlyDoing, null, "down")).toBe("t-d");
  });

  it("↓で同レーンの次の行へ進む", () => {
    expect(nextSelectedTaskId(lanes, "t-a", "down")).toBe("t-b");
  });

  it("最終行で↓なら選択は動かない", () => {
    expect(nextSelectedTaskId(lanes, "t-c", "down")).toBe("t-c");
  });

  it("↑で同レーンの前の行へ戻る", () => {
    expect(nextSelectedTaskId(lanes, "t-c", "up")).toBe("t-b");
  });

  it("行0で↑なら選択を外して検索バーへ戻る", () => {
    expect(nextSelectedTaskId(lanes, "t-a", "up")).toBeNull();
  });

  it("→で右隣のレーンへ移り、行番号を維持する", () => {
    expect(nextSelectedTaskId(lanes, "t-b", "right")).toBe("t-e");
  });

  it("→で移った先が短いレーンなら最終行に着地する", () => {
    expect(nextSelectedTaskId(lanes, "t-c", "right")).toBe("t-e");
  });

  it("→は空のレーンを飛ばす", () => {
    // 進行中(行0) → 確認中は空なので飛ばして 完了(行0)
    expect(nextSelectedTaskId(lanes, "t-d", "right")).toBe("t-f");
  });

  it("←は空のレーンを飛ばす", () => {
    expect(nextSelectedTaskId(lanes, "t-f", "left")).toBe("t-d");
  });

  it("右端のレーンで→なら選択は動かない", () => {
    expect(nextSelectedTaskId(lanes, "t-f", "right")).toBe("t-f");
  });

  it("左端のレーンで←なら選択は動かない", () => {
    expect(nextSelectedTaskId(lanes, "t-a", "left")).toBe("t-a");
  });

  it("選択中のIDがレーンに存在しなければ選択を外す", () => {
    expect(nextSelectedTaskId(lanes, "t-zzz", "down")).toBeNull();
  });
});

describe("selectionAfterDelete", () => {
  it("同レーンの1つ下を選ぶ", () => {
    expect(selectionAfterDelete(lanes, "t-a")).toBe("t-b");
  });

  it("最終行なら1つ上を選ぶ", () => {
    expect(selectionAfterDelete(lanes, "t-c")).toBe("t-b");
  });

  it("レーンに1件しか無ければ選択を外す", () => {
    expect(selectionAfterDelete(lanes, "t-f")).toBeNull();
  });

  it("存在しないIDなら選択を外す", () => {
    expect(selectionAfterDelete(lanes, "t-zzz")).toBeNull();
  });
});
