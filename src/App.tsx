import { Palette } from "@/components/Palette";

export default function App() {
  // Escの処理はuseKeyboard（Palette内で呼ばれる）に統合済み。
  // 計画書1由来のグローバルEscリスナーはTask 8でここから撤去した（二重処理防止）。
  // ホットキー登録失敗の通知はuseHotkeyErrorToast（Palette内で呼ばれる）に統合済み。
  // 計画書1由来の暫定インライン表示はTask 12でここから撤去した（トーストとの二重表示防止）。

  return <Palette />;
}
