// Vitest の全テストファイルで共通に走るセットアップ。
import "@testing-library/jest-dom/vitest";
import { afterEach, vi } from "vitest";
import { cleanup } from "@testing-library/react";

// jsdom は scrollIntoView を実装していないため、呼ばれても落ちないようスタブする。
Element.prototype.scrollIntoView = vi.fn();

// jsdom は matchMedia を実装していないため、usePrefersDark 等が呼んでも落ちないようスタブする。
window.matchMedia =
  window.matchMedia ??
  vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));

afterEach(async () => {
  cleanup();
  // zustand ストアはモジュール単位のシングルトンなので、テストごとに初期状態へ戻す。
  // 第2引数を false（マージ）にすることで、アクション関数はそのまま残る。
  // ここを静的importにすると、setupFilesがテストファイルのvi.mock("@/lib/api", ...)より
  // 先に実行されてしまい、モック前の実体を読み込んでキャッシュしてしまう
  // （結果、テスト側のモックが効かなくなる）。動的importで読み込みを遅延させ、
  // 各テストファイルのモック登録が済んだ後に解決されるようにする。
  const { initialAppState, useAppStore } = await import("./src/store/appStore");
  useAppStore.setState(initialAppState, false);
});
