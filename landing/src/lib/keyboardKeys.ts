/**
 * 実演で光らせるキー。
 * motion.ts の実演タイムラインと KeyboardSection の表示の両方がここを参照するので、
 * 数がズレることが構造的に起きない。
 */
export const KEYS = ["↓", "↓", "⌘K", "⌘→"] as const;
