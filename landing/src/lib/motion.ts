/**
 * スクロール進捗（0→1）から演出用のスタイル値を導く純粋関数群。
 * React には依存させない。ここを固めておけば、見た目の調整が数値の調整だけで済む。
 *
 * 設計書: docs/superpowers/specs/2026-08-23-avoliq-landing-page-design.md
 */

export function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

/** p を区間 [a, b] の中で 0→1 に正規化する。区間外は端に丸める */
export function range(p: number, a: number, b: number): number {
  if (b === a) return p >= b ? 1 : 0;
  return clamp((p - a) / (b - a), 0, 1);
}

/**
 * sticky トラックのスクロール進捗を返す。
 * トラックがビューポートより低い場合は進捗を持てないので 0 を返す。
 */
export function trackProgress(
  scrollY: number,
  trackTop: number,
  trackHeight: number,
  viewportHeight: number,
): number {
  const travel = trackHeight - viewportHeight;
  if (travel <= 0) return 0;
  return clamp((scrollY - trackTop) / travel, 0, 1);
}

export interface PaletteStyle {
  /** px。下方向が正 */
  y: number;
  scale: number;
  /** px */
  blur: number;
  opacity: number;
}

export interface StageState {
  palette: PaletteStyle;
  glowOpacity: number;
  hero: { opacity: number; y: number };
  statement: { opacity: number; y: number };
  keyboard: { opacity: number };
  /** 操作実演のタイムライン 0→1 */
  demo: number;
}

export function stageState(p: number): StageState {
  // 「開く」演出（ぼけ→鮮明、縮小→等倍）はマウント時に一度だけ再生する CSS アニメーション
  // （index.css の intro キーフレーム）が担う。ここでは p=0 の時点で
  // 「すでに開ききった状態」を返し、02 背景へ退く / 03 前へ出るの2区間だけを扱う。
  const back = range(p, 0.16, 0.3);
  const fore = range(p, 0.36, 0.48);

  return {
    palette: {
      y: 70 * back - 64 * fore,
      scale: (1 - 0.3 * back) * (1 + 0.34 * fore),
      blur: back * (1 - fore) * 3,
      opacity: clamp(1 - 0.45 * back * (1 - fore), 0, 1),
    },
    glowOpacity: clamp(
      0.7 + 0.3 * fore - 0.25 * back * (1 - fore),
      0,
      1,
    ),
    hero: {
      // 0.12-0.2: Heroテキストがフェードアウトする
      opacity: clamp(1 - range(p, 0.12, 0.2), 0, 1),
      // 0.12-0.22: 上へ抜けていく移動。opacityが0になった後も少しだけ動き続けて余韻を残す
      y: -40 * range(p, 0.12, 0.22),
    },
    statement: {
      // 0.17-0.24でフェードイン、0.31-0.38でフェードアウトする
      opacity: clamp(range(p, 0.17, 0.24) * (1 - range(p, 0.31, 0.38)), 0, 1),
      // 0.17-0.26: 現れながら上へ寄っていく移動。opacityが0.24で出そろった後も
      // 0.26まで動きが続き、フェードインの終わりより少し遅れて静止する
      y: 20 * (1 - range(p, 0.17, 0.26)),
    },
    keyboard: {
      // 0.37-0.44: Keyboardの見出しとキーキャップがフェードインする
      opacity: range(p, 0.37, 0.44),
    },
    demo: range(p, 0.5, 0.92),
  };
}

/**
 * 重ねたテキスト層のうち、実質見えていないものの当たり判定を消す。
 * 消さないと、見えていないセクションのリンクが押せてしまう。
 */
export function layerPointerEvents(opacity: number): "none" | "auto" {
  return opacity < 0.5 ? "none" : "auto";
}

/** 実演で光らせるキーの数。KeyboardSection の KEYS 配列と一致させること */
export const DEMO_KEY_COUNT = 4;

export interface DemoState {
  /** 光っているキーの添字。光っていなければ -1 */
  litKey: number;
  /** 選択枠が乗っているカードの添字。乗っていなければ -1 */
  selectedCard: number;
  chipOn: boolean;
  cardMoved: boolean;
}

/** 実演の進捗 d(0→1) を、パレット内で起きる出来事に変換する */
export function demoState(d: number): DemoState {
  if (d <= 0) {
    return { litKey: -1, selectedCard: -1, chipOn: false, cardMoved: false };
  }

  let litKey = -1;
  for (let i = 0; i < DEMO_KEY_COUNT; i += 1) {
    const from = i * 0.22;
    if (d >= from && d < from + 0.24) {
      litKey = i;
      break;
    }
  }

  let selectedCard = -1;
  if (d < 0.24) selectedCard = 0;
  else if (d < 0.46) selectedCard = 1;
  else selectedCard = 2;

  return {
    litKey,
    selectedCard,
    chipOn: d >= 0.52,
    cardMoved: d >= 0.74,
  };
}
