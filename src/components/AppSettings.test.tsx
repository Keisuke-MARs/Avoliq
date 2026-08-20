import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppSettings } from "./AppSettings";
import * as api from "../lib/api";
import * as autostart from "@tauri-apps/plugin-autostart";

vi.mock("../lib/api", () => ({
  settingGet: vi.fn(),
  settingSet: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-autostart", () => ({
  enable: vi.fn(),
  disable: vi.fn(),
  isEnabled: vi.fn(),
}));

describe("AppSettings", () => {
  beforeEach(() => {
    vi.mocked(autostart.isEnabled).mockResolvedValue(false);
    vi.mocked(autostart.enable).mockResolvedValue(undefined);
    vi.mocked(autostart.disable).mockResolvedValue(undefined);
    vi.mocked(api.settingGet).mockResolvedValue("Alt+Space");
    vi.mocked(api.settingSet).mockResolvedValue(undefined);
  });

  it("現在のホットキーを記号表記で表示する", async () => {
    render(<AppSettings />);

    expect(await screen.findByText("⌥Space")).toBeInTheDocument();
  });

  it("自動起動トグルをONにするとenableが呼ばれる", async () => {
    const user = userEvent.setup();
    render(<AppSettings />);

    await user.click(
      await screen.findByRole("switch", { name: "ログイン時に自動起動" }),
    );

    expect(autostart.enable).toHaveBeenCalledTimes(1);
  });

  it("ホットキーを録って保存すると新しいアクセラレータが渡る", async () => {
    const user = userEvent.setup();
    render(<AppSettings />);

    await user.click(
      await screen.findByRole("button", { name: "ホットキーを変更" }),
    );
    await user.keyboard("{Meta>}{Shift>}K{/Shift}{/Meta}");

    await vi.waitFor(() =>
      expect(api.settingSet).toHaveBeenCalledWith("hotkey", "Shift+Super+K"),
    );
  });

  it("登録に失敗したらエラーを表示して元のキーに戻す", async () => {
    vi.mocked(api.settingSet).mockRejectedValue(
      "ホットキー Shift+Super+K を登録できませんでした: already registered",
    );
    const user = userEvent.setup();
    render(<AppSettings />);

    await user.click(
      await screen.findByRole("button", { name: "ホットキーを変更" }),
    );
    await user.keyboard("{Meta>}{Shift>}K{/Shift}{/Meta}");

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "already registered",
    );
    expect(screen.getByText("⌥Space")).toBeInTheDocument();
  });
});
