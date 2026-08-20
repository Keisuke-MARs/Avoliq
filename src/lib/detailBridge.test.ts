import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  flushDetail,
  focusDetailTitle,
  registerDetailBridge,
} from "./detailBridge";

describe("detailBridge", () => {
  beforeEach(() => {
    registerDetailBridge(null);
  });

  it("登録されていないときに呼んでも例外にならない", () => {
    expect(() => flushDetail()).not.toThrow();
    expect(() => focusDetailTitle()).not.toThrow();
  });

  it("登録した関数が呼ばれる", () => {
    const flush = vi.fn();
    const focusTitle = vi.fn();
    registerDetailBridge({ flush, focusTitle });

    flushDetail();
    focusDetailTitle();

    expect(flush).toHaveBeenCalledTimes(1);
    expect(focusTitle).toHaveBeenCalledTimes(1);
  });

  it("nullで登録解除すると呼ばれなくなる", () => {
    const flush = vi.fn();
    registerDetailBridge({ flush, focusTitle: vi.fn() });
    registerDetailBridge(null);

    flushDetail();

    expect(flush).not.toHaveBeenCalled();
  });
});
