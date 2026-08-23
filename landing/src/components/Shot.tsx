interface ShotProps {
  src: string;
  alt: string;
}

export function Shot({ src, alt }: ShotProps) {
  return (
    // 画像に焼き込まれた背景色と同じ色でコンテナを塗り、継ぎ目が見えないようにする。
    // 枠線は付けない（画像の余白の外側に線が出てしまうため）。
    <div className="overflow-hidden rounded-2xl bg-[#0b0f16] shadow-[0_40px_90px_rgba(0,0,0,0.55)]">
      <img
        src={src}
        alt={alt}
        loading="lazy"
        decoding="async"
        // 実画像は1600x1120。遅延読み込みが発火する前にブラウザへ比率を伝え、
        // レイアウトシフト（下のセクションがガクッとずれる現象）を防ぐ。
        width={1600}
        height={1120}
        className="block h-auto w-full"
      />
    </div>
  );
}
