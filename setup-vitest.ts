// Vitest の全テストファイルで共通に走るセットアップ。
import "@testing-library/jest-dom/vitest";
import { afterEach, vi } from "vitest";
import { cleanup } from "@testing-library/react";

// jsdom は scrollIntoView を実装していないため、呼ばれても落ちないようスタブする。
Element.prototype.scrollIntoView = vi.fn();

afterEach(() => {
  cleanup();
});
