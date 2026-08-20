import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registerDetailBridge } from "../lib/detailBridge";
import { useFlushOnHide } from "./useFlushOnHide";

const onFocusChanged = vi.fn();

vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({
    onFocusChanged: (handler: (event: { payload: boolean }) => void) => {
      onFocusChanged(handler);
      return Promise.resolve(() => undefined);
    },
  }),
}));

describe("useFlushOnHide", () => {
  let flush: ReturnType<typeof vi.fn<() => void>>;

  beforeEach(() => {
    flush = vi.fn<() => void>();
    onFocusChanged.mockClear();
    registerDetailBridge({ flush, focusTitle: vi.fn<() => void>() });
  });

  afterEach(() => {
    registerDetailBridge(null);
  });

  it("ウィンドウのフォーカスが外れるとフラッシュする", async () => {
    renderHook(() => useFlushOnHide());

    await vi.waitFor(() => expect(onFocusChanged).toHaveBeenCalled());
    const handler = onFocusChanged.mock.calls[0][0];

    handler({ payload: false });
    expect(flush).toHaveBeenCalledTimes(1);

    handler({ payload: true });
    expect(flush).toHaveBeenCalledTimes(1);
  });

  it("WebViewが非表示になるとフラッシュする", () => {
    renderHook(() => useFlushOnHide());

    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => "hidden",
    });
    document.dispatchEvent(new Event("visibilitychange"));

    expect(flush).toHaveBeenCalledTimes(1);
  });
});
