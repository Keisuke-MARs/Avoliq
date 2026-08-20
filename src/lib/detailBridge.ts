/**
 * 詳細画面(TaskDetail)の内部処理を、画面外(キーボードディスパッチャやウィンドウイベント)から
 * 叩くための橋渡し。TaskDetailがマウント時に登録し、アンマウント時にnullで解除する。
 */
export interface DetailBridge {
  /** 保留中の自動保存を即座に実行する */
  flush: () => void;
  /** タイトル入力へフォーカスする */
  focusTitle: () => void;
}

let bridge: DetailBridge | null = null;

/** 詳細画面の橋渡しを登録する。nullを渡すと解除する。 */
export function registerDetailBridge(next: DetailBridge | null): void {
  bridge = next;
}

/** 保留中の自動保存を即座に実行する。詳細画面が開いていない場合は何もしない。 */
export function flushDetail(): void {
  bridge?.flush();
}

/** 詳細画面のタイトル入力へフォーカスする。開いていない場合は何もしない。 */
export function focusDetailTitle(): void {
  bridge?.focusTitle();
}
