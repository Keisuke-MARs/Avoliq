import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FooterHints } from "./FooterHints";

describe("FooterHints", () => {
  it("boardビューではボード操作のヒントを出す", () => {
    render(<FooterHints view="board" />);

    expect(screen.getByText("⌘B")).toBeInTheDocument();
    expect(screen.getByText("ボード切替")).toBeInTheDocument();
  });

  it("boardビューでは⌘Nが新規作成・⌘Pが検索のヒントになる", () => {
    render(<FooterHints view="board" />);

    expect(screen.getByText("⌘N")).toBeInTheDocument();
    expect(screen.getByText("新規作成")).toBeInTheDocument();
    expect(screen.getByText("⌘P")).toBeInTheDocument();
    expect(screen.getByText("検索")).toBeInTheDocument();
  });

  it("detailビューでは詳細画面のヒントに差し替わる", () => {
    render(<FooterHints view="detail" />);

    expect(screen.getByText("⌘T")).toBeInTheDocument();
    expect(screen.getByText("タイトル")).toBeInTheDocument();
    expect(screen.getByText("ボードに戻る")).toBeInTheDocument();
    expect(screen.queryByText("⌘B")).not.toBeInTheDocument();
  });

  it("detailビューにも⌘N(新規作成)・⌘P(検索)のヒントがある", () => {
    render(<FooterHints view="detail" />);

    expect(screen.getByText("⌘N")).toBeInTheDocument();
    expect(screen.getByText("新規作成")).toBeInTheDocument();
    expect(screen.getByText("⌘P")).toBeInTheDocument();
    expect(screen.getByText("検索")).toBeInTheDocument();
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
