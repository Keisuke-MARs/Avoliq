import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { Palette } from "@/components/Palette";

// Rust側 panel.rs の HOTKEY_ERROR_EVENT と同じ文字列
const HOTKEY_ERROR_EVENT = "hotkey-error";
// Rust側 repo.rs の HOTKEY_ERROR_SETTING_KEY と同じ文字列
const HOTKEY_ERROR_SETTING_KEY = "hotkeyError";

export default function App() {
  const [hotkeyError, setHotkeyError] = useState("");

  // Escの処理はuseKeyboard（Palette内で呼ばれる）に統合済み。
  // 計画書1由来のグローバルEscリスナーはTask 8でここから撤去した（二重処理防止）。

  useEffect(() => {
    // ホットキー登録に失敗したらメッセージを出す（別キーへの変更は設定画面で行う）
    const unlisten = listen<string>(HOTKEY_ERROR_EVENT, (event) => {
      setHotkeyError(event.payload);
    });
    return () => {
      void unlisten.then((dispose) => dispose());
    };
  }, []);

  useEffect(() => {
    // 起動直後のイベントは listen が間に合わず取りこぼすので、settings からも読む
    void invoke<string | null>("setting_get", {
      key: HOTKEY_ERROR_SETTING_KEY,
    }).then((stored) => {
      if (stored !== null && stored !== "") {
        setHotkeyError(stored);
      }
    });
  }, []);

  return (
    <>
      {hotkeyError !== "" && (
        <p
          data-testid="hotkey-error"
          className="fixed left-1/2 top-2 z-50 -translate-x-1/2 rounded bg-red-600 px-3 py-1 text-[12px] text-white shadow-lg"
        >
          {hotkeyError}
        </p>
      )}
      <Palette />
    </>
  );
}
