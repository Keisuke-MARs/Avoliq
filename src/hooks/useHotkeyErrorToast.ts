import { listen } from "@tauri-apps/api/event";
import { useEffect } from "react";
import { toast } from "sonner";
import { settingGet } from "../lib/api";

const HOTKEY_ERROR_EVENT = "hotkey-error";

function showToast(message: string): void {
  toast.error("ホットキーを登録できませんでした", {
    description: `${message} 設定 (⌘,) のアプリタブから別のキーへ変更してください。`,
    duration: 10000,
  });
}

/**
 * ホットキー登録失敗を通知する。
 * 起動直後の発火を取りこぼさないよう、イベント購読とsettingsの記録の両方を見る。
 */
export function useHotkeyErrorToast(): void {
  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | null = null;
    let shown = false;

    const show = (message: string) => {
      if (shown || message === "") return;
      shown = true;
      showToast(message);
    };

    void listen<string>(HOTKEY_ERROR_EVENT, (event) => {
      show(event.payload);
    }).then((fn) => {
      if (disposed) fn();
      else unlisten = fn;
    });

    void settingGet("hotkeyError").then((message) => {
      if (!disposed && message !== null) show(message);
    });

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);
}
