import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useHotkeyErrorToast } from "./useHotkeyErrorToast";
import * as api from "../lib/api";

const listen = vi.fn();
const toastError = vi.fn();

vi.mock("@tauri-apps/api/event", () => ({
  listen: (name: string, handler: unknown) => {
    listen(name, handler);
    return Promise.resolve(() => undefined);
  },
}));

vi.mock("sonner", () => ({
  toast: { error: (...args: unknown[]) => toastError(...args) },
}));

vi.mock("../lib/api", () => ({
  settingGet: vi.fn(),
}));

describe("useHotkeyErrorToast", () => {
  beforeEach(() => {
    listen.mockClear();
    toastError.mockClear();
    vi.mocked(api.settingGet).mockResolvedValue("");
  });

  it("hotkey-errorイベントでトーストを出す", async () => {
    renderHook(() => useHotkeyErrorToast());

    await vi.waitFor(() => expect(listen).toHaveBeenCalled());
    expect(listen.mock.calls[0][0]).toBe("hotkey-error");

    const handler = listen.mock.calls[0][1] as (event: {
      payload: string;
    }) => void;
    handler({ payload: "ホットキー Alt+Space を登録できませんでした" });

    expect(toastError).toHaveBeenCalledWith(
      "ホットキーを登録できませんでした",
      expect.objectContaining({
        description: expect.stringContaining("Alt+Space"),
      }),
    );
  });

  it("起動時にsettingsへ記録済みの失敗も拾う", async () => {
    vi.mocked(api.settingGet).mockResolvedValue(
      "ホットキー Alt+Space を登録できませんでした",
    );

    renderHook(() => useHotkeyErrorToast());

    await vi.waitFor(() => expect(toastError).toHaveBeenCalledTimes(1));
  });

  it("記録が空なら何も出さない", async () => {
    renderHook(() => useHotkeyErrorToast());

    await vi.waitFor(() => expect(api.settingGet).toHaveBeenCalledWith("hotkeyError"));
    expect(toastError).not.toHaveBeenCalled();
  });
});
