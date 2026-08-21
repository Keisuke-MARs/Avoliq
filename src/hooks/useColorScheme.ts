import { useEffect, useState } from "react";

const DARK_QUERY = "(prefers-color-scheme: dark)";

/**
 * OSのカラースキームを購読する唯一のフック。
 *
 * 真偽値を返すだけでなく、documentElement の .dark クラスを切り替える副作用を持つ。
 * CSS 側は @media (prefers-color-scheme: dark) を使わず .dark クラスだけを見るため、
 * このフックが色の切り替えの単一の入口になる。
 * アプリ全体で Palette.tsx の1箇所からのみ呼ぶこと（購読を増やさない）。
 */
export function useColorScheme(): boolean {
  const [isDark, setIsDark] = useState(
    () =>
      typeof window !== "undefined" && window.matchMedia(DARK_QUERY).matches,
  );

  useEffect(() => {
    const query = window.matchMedia(DARK_QUERY);
    // マウント時点の値がstateの初期値とズレている可能性があるので取り直す
    setIsDark(query.matches);
    const handle = (event: MediaQueryListEvent) => setIsDark(event.matches);
    query.addEventListener("change", handle);
    return () => query.removeEventListener("change", handle);
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", isDark);
  }, [isDark]);

  return isDark;
}
