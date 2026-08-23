import { useEffect, useRef, useState, type RefObject } from "react";
import { trackProgress } from "../lib/motion";

/**
 * 対象要素（sticky トラック）のスクロール進捗 0→1 を返す。
 * disabled が true のときは計算せず、常に終端の 1 を返す。
 * これは動き低減時に「最終状態で静止させる」ための逃げ道になっている。
 */
export function useTrackProgress(
  ref: RefObject<HTMLElement | null>,
  disabled = false,
): number {
  const [progress, setProgress] = useState(disabled ? 1 : 0);
  const frame = useRef(0);

  useEffect(() => {
    if (disabled) {
      setProgress(1);
      return;
    }

    const measure = () => {
      const el = ref.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      // 文書先頭からのトラック上端。offsetTop は offsetParent 依存で壊れやすいので使わない
      const top = rect.top + window.scrollY;
      setProgress(
        trackProgress(window.scrollY, top, rect.height, window.innerHeight),
      );
    };

    const onScroll = () => {
      cancelAnimationFrame(frame.current);
      frame.current = requestAnimationFrame(measure);
    };

    measure();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      cancelAnimationFrame(frame.current);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [ref, disabled]);

  return progress;
}
