import { useEffect, useState } from "react";

/** OSのダークモード設定(prefers-color-scheme)を購読する */
export function usePrefersDark(): boolean {
  const [isDark, setIsDark] = useState(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches,
  );

  useEffect(() => {
    const query = window.matchMedia("(prefers-color-scheme: dark)");
    const handle = (event: MediaQueryListEvent) => setIsDark(event.matches);
    query.addEventListener("change", handle);
    return () => query.removeEventListener("change", handle);
  }, []);

  return isDark;
}
