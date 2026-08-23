import { describe, expect, it } from "vitest";
import { DEMO_KEY_COUNT } from "../lib/motion";
import { KEYS } from "./KeyboardSection";

describe("KeyboardSection", () => {
  it("キーの数が実演のタイムラインと一致している", () => {
    // 片方だけ増減すると、最後のキーが永遠に光らない等の静かな不具合になる
    expect(KEYS.length).toBe(DEMO_KEY_COUNT);
  });
});
