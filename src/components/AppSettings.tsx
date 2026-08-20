import { disable, enable, isEnabled } from "@tauri-apps/plugin-autostart";
import { Keyboard, Power } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { formatAccelerator, toAccelerator } from "../lib/accelerator";
import { settingGet, settingSet } from "../lib/api";

const DEFAULT_HOTKEY = "Alt+Space";

/** アプリ設定タブ。ログイン時自動起動のON/OFFとグローバルホットキーの変更。 */
export function AppSettings() {
  const [autostartOn, setAutostartOn] = useState(false);
  const [hotkey, setHotkey] = useState(DEFAULT_HOTKEY);
  const [capturing, setCapturing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const captureRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    void (async () => {
      setAutostartOn(await isEnabled());
      const saved = await settingGet("hotkey");
      if (saved !== null && saved !== "") setHotkey(saved);
    })();
  }, []);

  const toggleAutostart = async () => {
    try {
      if (autostartOn) {
        await disable();
        setAutostartOn(false);
      } else {
        await enable();
        setAutostartOn(true);
      }
    } catch (caught) {
      setError(`自動起動の設定を変更できませんでした: ${String(caught)}`);
    }
  };

  const handleCaptureKeyDown = async (
    event: React.KeyboardEvent<HTMLButtonElement>,
  ) => {
    event.preventDefault();
    event.stopPropagation();

    if (event.key === "Escape") {
      setCapturing(false);
      return;
    }

    const accelerator = toAccelerator(event);
    if (accelerator === null) return; // 修飾キー単体などは無視して押し直しを待つ

    setCapturing(false);
    setError(null);
    const previous = hotkey;
    setHotkey(accelerator);
    try {
      // Rust側のsetting_setはkey==="hotkey"のとき、保存したうえで
      // panel::reregister_hotkey(&app) を呼ぶ(アクセラレータはsettingsから読まれる)
      await settingSet("hotkey", accelerator);
    } catch (caught) {
      setHotkey(previous);
      setError(String(caught));
      // Rust側は「保存が先・再登録が後」なので、失敗しても新しい値がDBに残っている。
      // 元のキーで保存し直して再登録させ、次回起動時に壊れた設定が使われないようにする
      try {
        await settingSet("hotkey", previous);
      } catch {
        // 復旧にも失敗した場合は、上のエラー表示から手動で直してもらう
      }
    }
  };

  return (
    <div className="flex flex-col gap-1 p-3 text-sm">
      <div className="flex items-center gap-3 rounded-lg px-3 py-2">
        <Power size={14} className="shrink-0 text-neutral-500" />
        <span className="flex-1 text-neutral-900">ログイン時に自動起動</span>
        <button
          type="button"
          role="switch"
          aria-label="ログイン時に自動起動"
          aria-checked={autostartOn}
          onClick={() => void toggleAutostart()}
          className={`relative h-6 w-10 shrink-0 rounded-full transition-colors ${
            autostartOn ? "bg-[#34C759]" : "bg-black/15"
          }`}
        >
          <span
            className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
              autostartOn ? "translate-x-[18px]" : "translate-x-0.5"
            }`}
          />
        </button>
      </div>

      <div className="flex items-center gap-3 rounded-lg px-3 py-2">
        <Keyboard size={14} className="shrink-0 text-neutral-500" />
        <span className="flex-1 text-neutral-900">呼び出しホットキー</span>
        <span className="rounded border border-black/10 bg-black/[0.03] px-2 py-0.5 text-xs font-medium text-neutral-700">
          {formatAccelerator(hotkey)}
        </span>
        <button
          ref={captureRef}
          type="button"
          aria-label="ホットキーを変更"
          onClick={() => {
            setCapturing(true);
            captureRef.current?.focus();
          }}
          onKeyDown={capturing ? (event) => void handleCaptureKeyDown(event) : undefined}
          className={`rounded-md px-2 py-1 text-xs transition-colors ${
            capturing
              ? "bg-[#007AFF] text-white"
              : "text-neutral-600 hover:bg-black/5"
          }`}
        >
          {capturing ? "キーを押してください" : "変更"}
        </button>
      </div>

      {error !== null && (
        <p
          role="alert"
          className="mx-3 mt-1 rounded-md bg-[#FF3B30]/10 px-3 py-2 text-xs leading-relaxed text-[#FF3B30]"
        >
          {error}
        </p>
      )}
    </div>
  );
}
