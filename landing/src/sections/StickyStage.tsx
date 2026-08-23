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
      <div className="sticky top-0 h-screen overflow-hidden">
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

        {/*
          重なりを数値（top-[14vh] 等）で個別に避けるのではなく、グリッドの行を分けることで
          構造的に起きないようにする。ビューポートの高さが変わっても、行が分かれている限り
          テキスト層とパレット層は絶対に重ならない。
        */}
        <div className="absolute inset-0 grid grid-rows-[auto_auto_auto] content-center justify-items-center gap-y-10 px-6">
          {/* テキスト層: Hero / Statement / Keyboard の見出しを同じセルに重ねてクロスフェードさせる。
              このタスクでは Hero のみ */}
          <div className="grid w-full [&>*]:col-start-1 [&>*]:row-start-1">
            {/*
              登場演出（av-intro-hero）とスクロール演出（Hero に渡す opacity/y の
              インラインstyle）は別の要素に分ける。同じ要素に両方を掛けると、
              インラインstyleが毎フレーム再設定されてCSSアニメーションと競合するため。
            */}
            <div className="av-intro-hero">
              <Hero opacity={s.hero.opacity} y={s.hero.y} />
            </div>
          </div>

          {/* パレット層
              外側の div（av-intro-palette）にマウント時一度きりの登場演出を掛け、
              内側の div にスクロール由来の transform/opacity/filter を毎フレーム設定する。
              同じ要素に両方を書くと、インラインstyleの再設定でCSSアニメーションが
              上書き・中断されてしまうため、層を分けて衝突を避けている。 */}
          <div className="av-intro-palette">
            <div
              style={{
                opacity: s.palette.opacity,
                filter: `blur(${s.palette.blur}px)`,
                transform: `translateY(${s.palette.y}px) scale(${s.palette.scale})`,
                // このページではパレットは常時アニメーションする唯一の要素であり、
                // 使い回すコンポーネントでもないため、常時 willChange を付けたままにしている。
                willChange: "transform, opacity, filter",
              }}
            >
              <PaletteMock demo={demo} />
            </div>
          </div>

          {/* キーキャップ層: Task 6 で Keyboard セクションが使う。いまは空 */}
          <div />
        </div>
      </div>
    </div>
  );
}
