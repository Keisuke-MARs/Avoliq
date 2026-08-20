import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Palette } from "./Palette";
import * as api from "@/lib/api";
import { board, board2, statuses, tasks } from "@/test/fixtures";
// fireEvent / useAppStore / Task はTask 9で追記するテストが使うため、この時点では未使用としてコメントアウトしておく
// import { fireEvent } from "@testing-library/react";
// import { useAppStore } from "@/store/appStore";
// import type { Task } from "@/types";

vi.mock("@/lib/api", () => ({
  boardsList: vi.fn(),
  statusesList: vi.fn(),
  tasksList: vi.fn(),
  taskCreate: vi.fn(),
  taskUpdate: vi.fn(),
  taskMove: vi.fn(),
  taskDelete: vi.fn(),
  taskRestore: vi.fn(),
  hidePalette: vi.fn(),
}));
vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
  Toaster: () => null,
}));

const mocked = vi.mocked(api);

/** パレットを描画し、ボードの読み込み完了まで待つ */
async function renderPalette() {
  const user = userEvent.setup();
  render(<Palette />);
  await waitFor(() => {
    expect(screen.getAllByTestId("task-card").length).toBe(6);
  });
  return user;
}

/** data-selected="true" のカードのタスクIDを返す。1枚も無ければ null */
function selectedCardId(): string | null {
  const selected = screen
    .queryAllByTestId("task-card")
    .find((c) => c.getAttribute("data-selected") === "true");
  return selected?.getAttribute("data-task-id") ?? null;
}

beforeEach(() => {
  mocked.boardsList.mockResolvedValue([board, board2]);
  mocked.statusesList.mockResolvedValue(statuses);
  mocked.tasksList.mockResolvedValue(tasks);
  mocked.hidePalette.mockResolvedValue(undefined);
});

describe("Palette: キーボードの基本動作", () => {
  it("↓で検索バーから一番左のレーンの先頭カードへ移る", async () => {
    const user = await renderPalette();
    await user.keyboard("{ArrowDown}");
    expect(selectedCardId()).toBe("t-a");
  });
});
