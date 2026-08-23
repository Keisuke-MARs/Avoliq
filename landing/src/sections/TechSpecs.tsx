import { Reveal } from "../components/Reveal";

const SPECS: { area: string; value: string }[] = [
  { area: "アプリ基盤", value: "Tauri v2（macOS 専用 / tauri-nspanel で NSPanel 化）" },
  { area: "フロントエンド", value: "React 19 + TypeScript + Vite" },
  { area: "スタイル", value: "Tailwind CSS v4 + shadcn/ui（Base UI ベース）+ lucide-react" },
  { area: "状態管理", value: "zustand" },
  { area: "エディタ", value: "BlockNote 0.54.0（バージョン固定）" },
  { area: "バックエンド", value: "Rust + rusqlite（SQLite 同梱ビルド）" },
  { area: "テスト", value: "Vitest + Testing Library / cargo test" },
  { area: "動作要件", value: "macOS 専用。NSPanel などのプライベート API に依存" },
];

export function TechSpecs() {
  return (
    // pb-28 のみで pt を持たない: 直前の DesignNotes と同じ bg-av-surface が続くため、
    // 境界で余白を二重に取らずに1枚の帯として繋げる意図的な設計
    <section className="bg-av-surface px-6 pb-28">
      <div className="mx-auto max-w-[52rem]">
        <Reveal>
          <div className="text-[11px] uppercase tracking-[0.14em] text-av-azure">
            Tech Specs
          </div>
          <h2 className="mt-3 text-[clamp(1.6rem,4vw,2.25rem)] font-semibold tracking-[-0.03em]">
            技術仕様
          </h2>
        </Reveal>

        <Reveal delay={0.06} className="mt-10">
          <dl className="divide-y divide-white/10 border-y border-white/10">
            {SPECS.map((s) => (
              <div
                key={s.area}
                className="grid gap-1 py-5 sm:grid-cols-[10rem_1fr] sm:gap-6"
              >
                <dt className="text-[13px] text-av-muted">{s.area}</dt>
                <dd className="text-sm leading-[1.8]">{s.value}</dd>
              </div>
            ))}
          </dl>
        </Reveal>
      </div>
    </section>
  );
}
