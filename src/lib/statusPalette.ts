import presets from "../../design/status-presets.json";

/**
 * ステータス色のプリセットパレット。
 *
 * 実値は design/status-presets.json が唯一のソースで、Rust 側のデフォルトステータスも
 * 同じファイルを読む。片方だけ変えてズレることが構造的に起きないようにするため。
 * 先頭4件が新規ボードのデフォルトステータスの色になる。
 *
 * macOSのシステムカラーを踏襲するが、ブランドの行動色 #0A84FF と見分けがつかない
 * #007AFF は入れない（選択状態とステータスが混同されるため）。
 */
export const STATUS_COLORS: readonly { name: string; value: string }[] = presets;

export type StatusColor = string;
