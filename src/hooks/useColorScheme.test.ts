import { renderHook, act } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useColorScheme } from "./useColorScheme";

/** matchMedia を差し替え、登録されたリスナーを手で発火できるようにする */
function stubMatchMedia(initialMatches: boolean) {
  const listeners = new Set<(event: MediaQueryListEvent) => void>();
  window.matchMedia = vi.fn().mockImplementation((media: string) => ({
    matches: initialMatches,
    media,
    onchange: null,
    addEventListener: (_type: string, handler: (event: MediaQueryListEvent) => void) =>
      listeners.add(handler),
    removeEventListener: (_type: string, handler: (event: MediaQueryListEvent) => void) =>
      listeners.delete(handler),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia;
  return {
    emit(matches: boolean) {
      for (const handler of listeners) {
        handler({ matches } as MediaQueryListEvent);
      }
    },
    get listenerCount() {
      return listeners.size;
    },
  };
}

describe("useColorScheme", () => {
  beforeEach(() => {
    document.documentElement.classList.remove("dark");
  });

  afterEach(() => {
    document.documentElement.classList.remove("dark");
  });

  it("OSがダークなら true を返し、documentElement に dark を付ける", () => {
    stubMatchMedia(true);
    const { result } = renderHook(() => useColorScheme());
    expect(result.current).toBe(true);
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });

  it("OSがライトなら false を返し、dark を外す", () => {
    stubMatchMedia(false);
    document.documentElement.classList.add("dark");
    const { result } = renderHook(() => useColorScheme());
    expect(result.current).toBe(false);
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });

  it("OS設定の変化に追従して dark をトグルする", () => {
    const media = stubMatchMedia(false);
    const { result } = renderHook(() => useColorScheme());
    expect(document.documentElement.classList.contains("dark")).toBe(false);

    act(() => media.emit(true));
    expect(result.current).toBe(true);
    expect(document.documentElement.classList.contains("dark")).toBe(true);

    act(() => media.emit(false));
    expect(result.current).toBe(false);
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });

  it("アンマウントでリスナーを解除する", () => {
    const media = stubMatchMedia(false);
    const { unmount } = renderHook(() => useColorScheme());
    expect(media.listenerCount).toBe(1);
    unmount();
    expect(media.listenerCount).toBe(0);
  });
});
