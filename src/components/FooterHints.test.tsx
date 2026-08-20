import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FooterHints } from "./FooterHints";

describe("FooterHints", () => {
  it("boardビューではボード操作のヒントを出す", () => {
    render(<FooterHints view="board" />);

    expect(screen.getByText("⌘B")).toBeInTheDocument();
    expect(screen.getByText("ボード切替")).toBeInTheDocument();
  });

  it("detailビューでは詳細画面のヒントに差し替わる", () => {
    render(<FooterHints view="detail" />);

    expect(screen.getByText("⌘T")).toBeInTheDocument();
    expect(screen.getByText("タイトル")).toBeInTheDocument();
    expect(screen.getByText("ボードに戻る")).toBeInTheDocument();
    expect(screen.queryByText("⌘B")).not.toBeInTheDocument();
  });

  it("switcherビューではボード管理のヒントを出す", () => {
    render(<FooterHints view="switcher" />);

    expect(screen.getByText("新規ボード")).toBeInTheDocument();
  });

  it("settingsビューでは設定のヒントを出す", () => {
    render(<FooterHints view="settings" />);

    expect(screen.getByText("タブ切替")).toBeInTheDocument();
  });
});
