import { useCallback, useEffect, useRef } from "react";

export interface DebouncedSave<T> {
  /** 値の保存を予約する。遅延時間内に再度呼ぶと後の値で上書きされる。 */
  schedule: (value: T) => void;
  /** 保留中の保存を即座に実行する。保留が無ければ何もしない。 */
  flush: () => void;
}

/**
 * 値の変更を指定ミリ秒デバウンスして保存する。
 * Escでの離脱やウィンドウ非表示に備えて、保留分を確定させるflushを返す。
 */
export function useDebouncedSave<T>(
  save: (value: T) => void | Promise<void>,
  delayMs = 500,
): DebouncedSave<T> {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRef = useRef<{ value: T } | null>(null);
  const saveRef = useRef(save);
  // 常に最新のsave関数を参照する(依存配列でタイマーを張り直さないため)
  saveRef.current = save;

  const run = useCallback(() => {
    const pending = pendingRef.current;
    if (pending === null) return;
    pendingRef.current = null;
    void saveRef.current(pending.value);
  }, []);

  const flush = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    run();
  }, [run]);

  const schedule = useCallback(
    (value: T) => {
      pendingRef.current = { value };
      if (timerRef.current !== null) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        run();
      }, delayMs);
    },
    [delayMs, run],
  );

  // アンマウント時に保留分を保存して取りこぼしを防ぐ
  useEffect(() => () => flush(), [flush]);

  return { schedule, flush };
}
