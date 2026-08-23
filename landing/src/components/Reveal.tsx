import type { ReactNode } from "react";
import { useReveal } from "../hooks/useReveal";

interface RevealProps {
  children: ReactNode;
  /** 秒。複数要素をずらして出すときに使う */
  delay?: number;
  className?: string;
}

export function Reveal({ children, delay = 0, className = "" }: RevealProps) {
  const [ref, shown] = useReveal<HTMLDivElement>();

  return (
    <div
      ref={ref}
      className={[
        // Tailwind v4 では translate-* が transform ではなくネイティブの translate プロパティを出力する。
        // そのため transition の対象には transform ではなく translate を指定する必要がある。
        "transition-[opacity,translate] duration-700 ease-av motion-reduce:transition-none",
        shown ? "translate-y-0 opacity-100" : "translate-y-[18px] opacity-0",
        "motion-reduce:translate-y-0 motion-reduce:opacity-100",
        className,
      ].join(" ")}
      style={{ transitionDelay: `${delay}s` }}
    >
      {children}
    </div>
  );
}
