import * as api from "./api";

/** 本文から画像を参照するURLスキーム。Rust側の IMAGE_URL_SCHEME と一致させる。 */
const IMAGE_URL_SCHEME = "avoliq-img";

/** 受け付ける画像の形式。Rust側の ALLOWED_IMAGE_MIME と一致させる。 */
export const ALLOWED_IMAGE_MIME: readonly string[] = [
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
];

/** 画像1枚の上限(10MB)。Rust側の MAX_IMAGE_BYTES と一致させる。 */
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

/**
 * FileReaderでdata URI化し、base64の本体部分だけを取り出す。
 * "data:image/png;base64,XXXX" の XXXX だけがRust側に要る。
 */
function readAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("画像を読み取れませんでした"));
    reader.onload = () => {
      const result = reader.result;
      const comma = typeof result === "string" ? result.indexOf(",") : -1;
      if (typeof result !== "string" || comma < 0) {
        reject(new Error("画像を読み取れませんでした"));
        return;
      }
      resolve(result.slice(comma + 1));
    };
    reader.readAsDataURL(file);
  });
}

/**
 * BlockNoteの uploadFile に渡す関数を作る。
 * 検証に落ちたらErrorを投げる(BlockNote側がアップロード失敗として扱う)。
 * 戻り値の avoliq-img://<id> が、そのまま本文のMarkdownに保存される。
 *
 * タスクidを関数で受けるのは、エディタがマウント中に1度しか作られないため。
 * 生成時の値をクロージャに焼き付けず、呼ばれた時点の値を読む。
 */
export function createImageUploader(
  getTaskId: () => string | null,
): (file: File) => Promise<string> {
  return async (file: File) => {
    // 同じ検査をRust側でも行う。あちらが正で、ここは無駄なIPCを省くための前段
    if (!ALLOWED_IMAGE_MIME.includes(file.type)) {
      throw new Error("この形式の画像は貼り付けられません");
    }
    if (file.size > MAX_IMAGE_BYTES) {
      throw new Error("画像が大きすぎます（10MBまで）");
    }

    const taskId = getTaskId();
    if (taskId === null) {
      throw new Error("タスクが選択されていません");
    }

    const dataBase64 = await readAsBase64(file);
    const id = await api.imageCreate(taskId, file.type, dataBase64);
    return `${IMAGE_URL_SCHEME}://${id}`;
  };
}
