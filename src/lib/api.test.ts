import { beforeEach, describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import * as api from "./api";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

const invokeMock = vi.mocked(invoke);

describe("Tauri invoke ラッパー", () => {
  beforeEach(() => {
    invokeMock.mockResolvedValue(undefined);
  });

  it("boards_list は引数なしで呼ぶ", async () => {
    await api.boardsList();
    expect(invokeMock).toHaveBeenCalledWith("boards_list");
  });

  it("statuses_list は boardId を camelCase で渡す", async () => {
    await api.statusesList("board-1");
    expect(invokeMock).toHaveBeenCalledWith("statuses_list", { boardId: "board-1" });
  });

  it("tasks_list は boardId を camelCase で渡す", async () => {
    await api.tasksList("board-1");
    expect(invokeMock).toHaveBeenCalledWith("tasks_list", { boardId: "board-1" });
  });

  it("task_create は boardId / statusId / title を渡す", async () => {
    await api.taskCreate("board-1", "st-todo", "牛乳を買う");
    expect(invokeMock).toHaveBeenCalledWith("task_create", {
      boardId: "board-1",
      statusId: "st-todo",
      title: "牛乳を買う",
    });
  });

  it("task_move は newIndex を camelCase で渡す", async () => {
    await api.taskMove("t-a", "st-doing", 0);
    expect(invokeMock).toHaveBeenCalledWith("task_move", {
      id: "t-a",
      statusId: "st-doing",
      newIndex: 0,
    });
  });

  it("task_update は未指定の項目に null を渡す", async () => {
    await api.taskUpdate("t-a", "新しいタイトル", null);
    expect(invokeMock).toHaveBeenCalledWith("task_update", {
      id: "t-a",
      title: "新しいタイトル",
      contentMd: null,
    });
  });

  it("status_update は未指定の項目に null を渡す", async () => {
    await api.statusUpdate("st-todo", null, "#FF0000");
    expect(invokeMock).toHaveBeenCalledWith("status_update", {
      id: "st-todo",
      name: null,
      color: "#FF0000",
    });
  });

  it("status_reorder は newIndex を camelCase で渡す", async () => {
    await api.statusReorder("st-todo", 2);
    expect(invokeMock).toHaveBeenCalledWith("status_reorder", { id: "st-todo", newIndex: 2 });
  });

  it("setting_set は key と value を渡す", async () => {
    await api.settingSet("hotkey", "Alt+Space");
    expect(invokeMock).toHaveBeenCalledWith("setting_set", { key: "hotkey", value: "Alt+Space" });
  });

  it("palette_hide は引数なしで呼ぶ", async () => {
    await api.hidePalette();
    expect(invokeMock).toHaveBeenCalledWith("palette_hide");
  });
});
