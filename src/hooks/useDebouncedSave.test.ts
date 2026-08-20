import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useDebouncedSave } from "./useDebouncedSave";

describe("useDebouncedSave", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("500ms経過するまで保存は呼ばれない", () => {
    const save = vi.fn();
    const { result } = renderHook(() => useDebouncedSave<string>(save, 500));

    result.current.schedule("あ");
    vi.advanceTimersByTime(499);
    expect(save).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(save).toHaveBeenCalledExactlyOnceWith("あ");
  });

  it("連続入力では最後の値だけが1回保存される", () => {
    const save = vi.fn();
    const { result } = renderHook(() => useDebouncedSave<string>(save, 500));

    result.current.schedule("あ");
    vi.advanceTimersByTime(200);
    result.current.schedule("あい");
    vi.advanceTimersByTime(200);
    result.current.schedule("あいう");
    vi.advanceTimersByTime(500);

    expect(save).toHaveBeenCalledExactlyOnceWith("あいう");
  });

  it("flushで保留中の保存が即座に実行される", () => {
    const save = vi.fn();
    const { result } = renderHook(() => useDebouncedSave<string>(save, 500));

    result.current.schedule("あ");
    result.current.flush();

    expect(save).toHaveBeenCalledExactlyOnceWith("あ");

    // フラッシュ済みなのでタイマー経過で二重保存されない
    vi.advanceTimersByTime(500);
    expect(save).toHaveBeenCalledTimes(1);
  });

  it("保留が無い状態のflushでは保存が呼ばれない", () => {
    const save = vi.fn();
    const { result } = renderHook(() => useDebouncedSave<string>(save, 500));

    result.current.flush();

    expect(save).not.toHaveBeenCalled();
  });

  it("アンマウント時に保留中の保存が実行される", () => {
    const save = vi.fn();
    const { result, unmount } = renderHook(() =>
      useDebouncedSave<string>(save, 500),
    );

    result.current.schedule("あ");
    unmount();

    expect(save).toHaveBeenCalledExactlyOnceWith("あ");
  });
});
