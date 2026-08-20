/**
 * ステータス色のプリセットパレット。
 * macOSのシステムカラーに合わせ、デフォルトステータス4色を先頭に置く。
 */
export const STATUS_COLORS = [
  { name: "グレー", value: "#8E8E93" },
  { name: "ブルー", value: "#007AFF" },
  { name: "オレンジ", value: "#FF9500" },
  { name: "グリーン", value: "#34C759" },
  { name: "レッド", value: "#FF3B30" },
  { name: "パープル", value: "#AF52DE" },
  { name: "ピンク", value: "#FF2D55" },
  { name: "ティール", value: "#5AC8FA" },
] as const;

export type StatusColor = (typeof STATUS_COLORS)[number]["value"];
