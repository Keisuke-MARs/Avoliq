export interface AcceleratorInput {
  code: string;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
}

/** KeyboardEvent.code から Tauri アクセラレータのキー名を得る。対象外はnull。 */
function toKeyName(code: string): string | null {
  if (code.startsWith("Key")) return code.slice(3);
  if (code.startsWith("Digit")) return code.slice(5);
  if (/^F([1-9]|1[0-9]|2[0-4])$/.test(code)) return code;
  if (code === "Space") return "Space";
  if (code === "Enter") return "Enter";
  if (code === "Tab") return "Tab";
  if (code === "Backquote") return "`";
  if (code === "Minus") return "-";
  if (code === "Equal") return "=";
  return null;
}

/**
 * KeyboardEventをTauriのアクセラレータ文字列(例: "Alt+Space")へ変換する。
 * グローバルホットキーとして成立しない組み合わせ(修飾キーなしの通常キー等)はnull。
 * macOSでは Super が ⌘ に対応する。
 */
export function toAccelerator(event: AcceleratorInput): string | null {
  const key = toKeyName(event.code);
  if (key === null) return null;

  const parts: string[] = [];
  if (event.ctrlKey) parts.push("Control");
  if (event.altKey) parts.push("Alt");
  if (event.shiftKey) parts.push("Shift");
  if (event.metaKey) parts.push("Super");

  // ファンクションキーだけは修飾キーなしでもグローバルホットキーになれる
  const isFunctionKey = /^F([1-9]|1[0-9]|2[0-4])$/.test(key);
  if (parts.length === 0 && !isFunctionKey) return null;

  parts.push(key);
  return parts.join("+");
}

const SYMBOLS: Record<string, string> = {
  Control: "⌃",
  Alt: "⌥",
  Shift: "⇧",
  Super: "⌘",
  CommandOrControl: "⌘",
};

/** アクセラレータ文字列をmacOSの記号表記(例: "⌥Space")へ整形する */
export function formatAccelerator(accelerator: string): string {
  return accelerator
    .split("+")
    .map((part) => SYMBOLS[part] ?? part)
    .join("");
}
