import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ConfirmDialog } from "./ConfirmDialog";

describe("ConfirmDialog", () => {
  it("タイトルと説明を表示する", () => {
    render(
      <ConfirmDialog
        title="ボードを削除しますか？"
        description="このボードのタスクとステータスもすべて削除されます。"
        confirmLabel="削除する"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.getByText("ボードを削除しますか？")).toBeInTheDocument();
    expect(
      screen.getByText(
        "このボードのタスクとステータスもすべて削除されます。",
      ),
    ).toBeInTheDocument();
  });

  it("EnterでonConfirmが呼ばれる", async () => {
    const onConfirm = vi.fn();
    const user = userEvent.setup();
    render(
      <ConfirmDialog
        title="削除しますか？"
        description="元に戻せません。"
        confirmLabel="削除する"
        onConfirm={onConfirm}
        onCancel={vi.fn()}
      />,
    );

    await user.keyboard("{Enter}");

    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("EscでonCancelが呼ばれる", async () => {
    const onCancel = vi.fn();
    const user = userEvent.setup();
    render(
      <ConfirmDialog
        title="削除しますか？"
        description="元に戻せません。"
        confirmLabel="削除する"
        onConfirm={vi.fn()}
        onCancel={onCancel}
      />,
    );

    await user.keyboard("{Escape}");

    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
