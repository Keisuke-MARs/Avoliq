import { getCurrentWindow } from "@tauri-apps/api/window";
import { useEffect } from "react";
import { flushDetail } from "../lib/detailBridge";

/**
 * パレットが隠れる・フォーカスを失う・WebViewが非表示になる瞬間に、
 * 詳細画面の保留中の自動保存を確定させる。Escで即閉じても内容を失わないための保険。
 */
export function useFlushOnHide(): void {
  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | null = null;

    void getCurrentWindow()
      .onFocusChanged(({ payload: focused }) => {
        if (!focused) flushDetail();
      })
      .then((fn) => {
        if (disposed) fn();
        else unlisten = fn;
      });

    const handleVisibility = () => {
      if (document.visibilityState === "hidden") flushDetail();
    };
    const handleUnload = () => flushDetail();

    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("beforeunload", handleUnload);

    return () => {
      disposed = true;
      unlisten?.();
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("beforeunload", handleUnload);
    };
  }, []);
}
