import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

// Rust側 panel.rs の HOTKEY_ERROR_EVENT と同じ文字列
const HOTKEY_ERROR_EVENT = "hotkey-error";
// Rust側 repo.rs の HOTKEY_ERROR_SETTING_KEY と同じ文字列
const HOTKEY_ERROR_SETTING_KEY = "hotkeyError";

function App() {
  const [hotkeyError, setHotkeyError] = useState("");

  useEffect(() => {
    // Escでパレットを閉じる。NSPanelなのでRust側のhideを呼ぶ必要がある
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        void invoke("palette_hide");
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

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
    <div className="palette-shell">
      <span className="palette-title">smartTask</span>
      {hotkeyError !== "" && <p className="palette-error">{hotkeyError}</p>}
    </div>
  );
}

export default App;
