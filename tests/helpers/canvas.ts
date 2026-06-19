import { vi } from "vitest";

export interface MockCanvasOptions {
  imageDataBuffer?: ArrayBuffer;
  thumbnail?: string | null;
  context?: MockCanvasRenderingContext2D | null;
}

export interface MockCanvasRenderingContext2D {
  drawImage: ReturnType<typeof vi.fn>;
  getImageData: ReturnType<typeof vi.fn>;
}

export function createMockContext(
  opts: Pick<MockCanvasOptions, "imageDataBuffer"> = {},
): MockCanvasRenderingContext2D {
  const { imageDataBuffer = new ArrayBuffer(224 * 224 * 4) } = opts;
  return {
    drawImage: vi.fn(),
    getImageData: vi.fn(() => ({ data: { buffer: imageDataBuffer } })),
  };
}

export function mockCanvas(
  // eslint-disable-next-line @typescript-eslint/no-deprecated
  originalCreateElement: typeof document.createElement,
  opts: MockCanvasOptions = {},
): MockCanvasRenderingContext2D | null {
  const {
    imageDataBuffer = new ArrayBuffer(224 * 224 * 4),
    thumbnail = "data:image/jpeg;base64,THUMB",
    context,
  } = opts;

  const ctx =
    context === undefined ? createMockContext({ imageDataBuffer }) : context;

  // jsdom canvas is not fully implemented; we replace it with a minimal mock.
  // eslint-disable-next-line @typescript-eslint/no-deprecated
  document.createElement = vi.fn((tagName: string) => {
    if (tagName !== "canvas") {
      return originalCreateElement.call(document, tagName);
    }
    return {
      width: 0,
      height: 0,
      getContext: vi.fn(() => ctx),
      toDataURL: vi.fn(() => thumbnail ?? "data:image/jpeg;base64,MOCK"),
    } as unknown as HTMLCanvasElement;
  });

  return ctx;
}

export function installMockCanvas(opts: MockCanvasOptions = {}): {
  restore: () => void;
  ctx: MockCanvasRenderingContext2D | null;
} {
  // The helper intentionally snapshots and restores the live DOM helper.
  // eslint-disable-next-line @typescript-eslint/no-deprecated, @typescript-eslint/unbound-method
  const originalCreateElement = document.createElement;
  const ctx = mockCanvas(originalCreateElement, opts);

  return {
    restore: () => {
      // eslint-disable-next-line @typescript-eslint/no-deprecated
      document.createElement = originalCreateElement;
    },
    ctx,
  };
}
