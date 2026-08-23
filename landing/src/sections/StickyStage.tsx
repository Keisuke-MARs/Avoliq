import { useRef } from "react";
import { PaletteMock } from "../components/PaletteMock";
import { useTrackProgress } from "../hooks/useTrackProgress";
import { usePrefersReducedMotion } from "../hooks/usePrefersReducedMotion";
import { demoState, stageState } from "../lib/motion";
import { Hero } from "./Hero";

export function StickyStage() {
  const trackRef = useRef<HTMLDivElement>(null);
  const reduced = usePrefersReducedMotion();
  const p = useTrackProgress(trackRef, reduced);
  const s = stageState(p);
  const demo = demoState(s.demo);

  return (
    <div ref={trackRef} className="relative h-[400vh]">
      <div className="sticky top-0 flex h-screen items-center justify-center overflow-hidden">
        {/* 背後の発光 */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            opacity: s.glowOpacity,
            background:
              "radial-gradient(60% 70% at 50% 78%, rgba(10,132,255,0.34), transparent 62%), radial-gradient(50% 70% at 12% 0%, rgba(97,94,255,0.22), transparent 62%)",
          }}
        />

        <div
          style={{
            opacity: s.palette.opacity,
            filter: `blur(${s.palette.blur}px)`,
            transform: `translateY(${s.palette.y}px) scale(${s.palette.scale})`,
            willChange: "transform, opacity, filter",
          }}
        >
          <PaletteMock demo={demo} />
        </div>

        <Hero opacity={s.hero.opacity} y={s.hero.y} />
      </div>
    </div>
  );
}
