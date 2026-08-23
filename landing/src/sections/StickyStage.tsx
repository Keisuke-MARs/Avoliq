import { useRef } from "react";
import { PaletteMock } from "../components/PaletteMock";
import { useTrackProgress } from "../hooks/useTrackProgress";
import { usePrefersReducedMotion } from "../hooks/usePrefersReducedMotion";
import { demoState, stageState } from "../lib/motion";
import { Hero } from "./Hero";
import { KeyboardHeading, KeycapRow } from "./KeyboardSection";
import { Statement } from "./Statement";

export function StickyStage() {
  const trackRef = useRef<HTMLDivElement>(null);
  const reduced = usePrefersReducedMotion();
  const p = useTrackProgress(trackRef, reduced);
  const s = stageState(p);
  const demo = demoState(s.demo);

  // 動きを減らす設定のときは、sticky と進捗連動をやめて3セクションを普通に縦へ並べる。
  // useTrackProgress は動き低減時に進捗を 1 に固定するので、そのまま描くと
  // Hero と Statement が消えたままになり、情報が欠けてしまう。
  if (reduced) {
    return (
      <div>
        <section className="flex min-h-screen flex-col items-center justify-center gap-10 px-6 py-24">
          <Hero opacity={1} y={0} />
          {/* パレットはページ全体で1枚だけ、という原則は静止時も守る。
              実演の途中（タグが付いた状態）で止めて、機能が伝わる絵にする。
              終端(1)にするとカードが移動後の位置で止まり、文脈なしでは意味が読めない */}
          <PaletteMock demo={demoState(0.6)} />
        </section>

        <section className="flex min-h-[70vh] items-center justify-center px-6 py-24">
          <Statement opacity={1} y={0} />
        </section>

        <section className="flex min-h-[70vh] flex-col items-center justify-center gap-10 px-6 py-24">
          <KeyboardHeading opacity={1} />
          <KeycapRow opacity={1} litKey={-1} />
        </section>
      </div>
    );
  }

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
          {/* テキスト層: Hero / Statement / Keyboard の見出しを同じセルに重ねてクロスフェードさせる */}
          <div className="grid w-full [&>*]:col-start-1 [&>*]:row-start-1">
            {/*
              登場演出（av-intro-hero）とスクロール演出（Hero に渡す opacity/y の
              インラインstyle）は別の要素に分ける。同じ要素に両方を掛けると、
              インラインstyleが毎フレーム再設定されてCSSアニメーションと競合するため。
              登場演出は Hero だけに掛かればよいので、Statement と Keyboard の見出しは
              ラッパーの外に置く。
            */}
            <div className="av-intro-hero">
              <Hero opacity={s.hero.opacity} y={s.hero.y} />
            </div>
            <Statement opacity={s.statement.opacity} y={s.statement.y} />
            <KeyboardHeading opacity={s.keyboard.opacity} />
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
                // scale だけにする。translate はグリッドの行分けによる重なり防止を
                // 突き破ってしまうため使わない（詳細は motion.ts のコメント参照）。
                transform: `scale(${s.palette.scale})`,
                // このページではパレットは常時アニメーションする唯一の要素であり、
                // 使い回すコンポーネントでもないため、常時 willChange を付けたままにしている。
                willChange: "transform, opacity, filter",
              }}
            >
              <PaletteMock demo={demo} />
            </div>
          </div>

          {/* キーキャップ層 */}
          <KeycapRow opacity={s.keyboard.opacity} litKey={demo.litKey} />
        </div>
      </div>
    </div>
  );
}
