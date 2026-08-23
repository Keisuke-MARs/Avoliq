import { useEffect, useState } from "react";

const QUERY = "(prefers-reduced-motion: reduce)";

/** OS の「視差効果を減らす」設定を見て、演出を切るかどうかを返す */
export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia(QUERY).matches;
  });

  useEffect(() => {
    const mql = window.matchMedia(QUERY);
    // マウント時点の値がstateの初期値とズレている可能性があるので取り直す
    setReduced(mql.matches);
    const onChange = (e: MediaQueryListEvent) => setReduced(e.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  return reduced;
}
