/**
 * タグ色のプリセット。ステータス色（statusPalette.ts）より彩度を落として、
 * 「ステータス＝鮮やか / タグ＝くすんだ色」という階層を保つ。
 * value は Rust 側の TAG_COLORS と同じ並び・同じ値でなければならない。
 */
export const TAG_COLORS = [
  { name: "ブルー", value: "#7EA9E8", fgLight: "#4A7CC4" },
  { name: "オレンジ", value: "#E8B478", fgLight: "#B07B32" },
  { name: "グリーン", value: "#7FCF9A", fgLight: "#4D9E6D" },
  { name: "レッド", value: "#E88A85", fgLight: "#C9615B" },
  { name: "パープル", value: "#B98CD8", fgLight: "#8B5FB5" },
  { name: "ピンク", value: "#E88AA6", fgLight: "#C25A7C" },
  { name: "ティール", value: "#8FC9E0", fgLight: "#4F92AE" },
  { name: "グレー", value: "#A8A8AE", fgLight: "#7A7A80" },
  { name: "イエロー", value: "#C9B478", fgLight: "#9A8534" },
] as const;

export interface ChipStyle {
  backgroundColor: string;
  color: string;
}

/**
 * タグチップの配色を返す。選択中かどうかでは変えない。
 * かつては選択中カードがステータス色のベタ塗りだったため白文字へ切り替えていたが、
 * 現在の選択表示は accent の淡い面（.av-card[data-selected="true"]）なので、
 * 白文字にすると淡面に溶けて読めなくなる。選択の合図はリング・淡面・太字が担う。
 * @param hex タグの色（'#RRGGBB'）
 * @param dark ダークモードか
 */
export function tagChipStyle(hex: string, dark: boolean): ChipStyle {
  // 末尾2桁は8bitのアルファ。38 ≒ 22% / 2E ≒ 18%
  if (dark) {
    return { backgroundColor: `${hex}2E`, color: hex };
  }
  const preset = TAG_COLORS.find(
    (candidate) => candidate.value.toLowerCase() === hex.toLowerCase(),
  );
  return { backgroundColor: `${hex}38`, color: preset?.fgLight ?? hex };
}
