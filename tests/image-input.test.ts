import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { processFileInput } from "@/services/image-input";
import { installMockCanvas, createMockContext } from "./helpers/canvas";

interface MockImageElement {
  onload: (() => void) | null;
  onerror: (() => void) | null;
  naturalWidth: number;
  naturalHeight: number;
  src: string;
}

function installImageMock(
  opts: {
    naturalWidth?: number;
    naturalHeight?: number;
    fail?: boolean;
  } = {},
): () => void {
  const originalImage = globalThis.Image;
  const { naturalWidth = 400, naturalHeight = 400, fail = false } = opts;

  globalThis.Image = vi.fn(function Image() {
    const img: MockImageElement = {
      onload: null,
      onerror: null,
      naturalWidth,
      naturalHeight,
      src: "",
    };

    Object.defineProperty(img, "src", {
      configurable: true,
      get() {
        return img.src;
      },
      set() {
        queueMicrotask(() => {
          if (fail) {
            img.onerror?.();
          } else {
            img.onload?.();
          }
        });
      },
    });

    return img;
  }) as unknown as typeof Image;

  return () => {
    globalThis.Image = originalImage;
  };
}

describe("processFileInput", () => {
  let canvas: ReturnType<typeof installMockCanvas>;
  let restoreImage: (() => void) | undefined;
  let originalCreateObjectURL: typeof URL.createObjectURL;
  let originalRevokeObjectURL: typeof URL.revokeObjectURL;

  beforeEach(() => {
    canvas = installMockCanvas();
    originalCreateObjectURL = URL.createObjectURL;
    originalRevokeObjectURL = URL.revokeObjectURL;
    URL.createObjectURL = vi.fn(() => "blob:mock");
    URL.revokeObjectURL = vi.fn();
  });

  afterEach(() => {
    if (restoreImage) {
      restoreImage();
      restoreImage = undefined;
    }
    canvas.restore();
    URL.createObjectURL = originalCreateObjectURL;
    URL.revokeObjectURL = originalRevokeObjectURL;
    vi.restoreAllMocks();
  });

  function withCanvas(opts: Parameters<typeof installMockCanvas>[0]): void {
    canvas.restore();
    canvas = installMockCanvas(opts);
  }

  it("resolves with buffer, dimensions and thumbnail", async () => {
    restoreImage = installImageMock();
    withCanvas({ thumbnail: "data:image/jpeg;base64,THUMB" });
    const file = new File([], "mushroom.jpg", { type: "image/jpeg" });
    const result = await processFileInput(file);

    expect(result.width).toBe(224);
    expect(result.height).toBe(224);
    expect(result.thumbnail).toBe("data:image/jpeg;base64,THUMB");
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:mock");
  });

  it("rejects when canvas context is unavailable", async () => {
    restoreImage = installImageMock();
    withCanvas({ context: null });

    const file = new File([], "mushroom.jpg", { type: "image/jpeg" });
    await expect(processFileInput(file)).rejects.toThrow(
      "Failed to get canvas context",
    );
  });

  it("rejects when image fails to load", async () => {
    restoreImage = installImageMock({ fail: true });

    const file = new File([], "broken.jpg", { type: "image/jpeg" });
    await expect(processFileInput(file)).rejects.toThrow(
      "Failed to load image file",
    );
  });

  it("centers crop on non-square images", async () => {
    restoreImage = installImageMock({ naturalWidth: 600, naturalHeight: 400 });
    const drawImage = vi.fn();
    const ctx = createMockContext({
      imageDataBuffer: new ArrayBuffer(112 * 112 * 4),
    });
    ctx.drawImage = drawImage;
    withCanvas({
      thumbnail: "data:image/jpeg;base64,T",
      context: ctx,
    });

    const file = new File([], "wide.jpg", { type: "image/jpeg" });
    await processFileInput(file, 112);

    expect(drawImage).toHaveBeenCalledWith(
      expect.anything(),
      100,
      0,
      400,
      400,
      0,
      0,
      112,
      112,
    );
  });
});
