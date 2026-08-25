import { beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "./api";
import { createImageUploader, MAX_IMAGE_BYTES } from "./taskImage";

vi.mock("./api", () => ({ imageCreate: vi.fn() }));

const imageCreateMock = vi.mocked(api.imageCreate);

/** 指定の形式・サイズのFileを作る。中身は問わないので0埋めでよい。 */
function makeFile(type: string, size: number): File {
  return new File([new Uint8Array(size)], "shot.png", { type });
}

describe("createImageUploader", () => {
  beforeEach(() => {
    imageCreateMock.mockResolvedValue("img-1");
  });

  it("保存したidをavoliq-imgのURLにして返す", async () => {
    const upload = createImageUploader(() => "task-1");

    await expect(upload(makeFile("image/png", 4))).resolves.toBe(
      "avoliq-img://img-1",
    );
  });

  it("taskIdとMIMEとbase64をAPIへ渡す", async () => {
    const upload = createImageUploader(() => "task-1");

    // 0が3バイト = base64で "AAAA"
    await upload(makeFile("image/png", 3));

    expect(imageCreateMock).toHaveBeenCalledWith("task-1", "image/png", "AAAA");
  });

  it("対応していない形式は投げる", async () => {
    const upload = createImageUploader(() => "task-1");

    await expect(upload(makeFile("image/svg+xml", 4))).rejects.toThrow(
      "この形式の画像は貼り付けられません",
    );
    expect(imageCreateMock).not.toHaveBeenCalled();
  });

  it("上限を超えるサイズは投げる", async () => {
    const upload = createImageUploader(() => "task-1");

    await expect(
      upload(makeFile("image/png", MAX_IMAGE_BYTES + 1)),
    ).rejects.toThrow("画像が大きすぎます（10MBまで）");
    expect(imageCreateMock).not.toHaveBeenCalled();
  });

  it("タスクが選ばれていなければ投げる", async () => {
    const upload = createImageUploader(() => null);

    await expect(upload(makeFile("image/png", 4))).rejects.toThrow(
      "タスクが選択されていません",
    );
    expect(imageCreateMock).not.toHaveBeenCalled();
  });

  it("生成時ではなく呼ばれた時点のタスクidを使う", async () => {
    // エディタはマウント中1度しか作られないので、値を焼き付けていないことを確かめる
    let current = "task-1";
    const upload = createImageUploader(() => current);
    current = "task-2";

    await upload(makeFile("image/png", 3));

    expect(imageCreateMock).toHaveBeenCalledWith("task-2", "image/png", "AAAA");
  });
});
