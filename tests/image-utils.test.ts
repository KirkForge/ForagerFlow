import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createThumbnailDataUrl } from "@/services/image-utils";

describe("createThumbnailDataUrl", () => {
  let originalCreateElement: typeof document.createElement;
  let originalImageBitmap: typeof globalThis.ImageBitmap;
  let originalOffscreenCanvas: typeof globalThis.OffscreenCanvas;

  function ensureGlobalConstructors() {
    if (typeof globalThis.ImageBitmap === "undefined") {
      globalThis.ImageBitmap = class {
        width = 100;
        height = 100;
      } as unknown as typeof ImageBitmap;
    }
    if (typeof globalThis.OffscreenCanvas === "undefined") {
      globalThis.OffscreenCanvas = class {
        width = 100;
        height = 100;
        constructor(_w?: number, _h?: number) {
          if (_w !== undefined) this.width = _w;
          if (_h !== undefined) this.height = _h;
        }
      } as unknown as typeof OffscreenCanvas;
    }
  }

  beforeEach(() => {
    originalCreateElement = document.createElement;
    originalImageBitmap = globalThis.ImageBitmap;
    originalOffscreenCanvas = globalThis.OffscreenCanvas;
    ensureGlobalConstructors();
  });

  afterEach(() => {
    document.createElement = originalCreateElement;
    globalThis.ImageBitmap = originalImageBitmap;
    globalThis.OffscreenCanvas = originalOffscreenCanvas;
    vi.restoreAllMocks();
  });

  function mockCanvas(dataUrl: string | null) {
    document.createElement = vi.fn((tagName: string) => {
      if (tagName !== "canvas") {
        return originalCreateElement.call(document, tagName);
      }

      const canvas = {
        width: 0,
        height: 0,
        getContext: vi.fn(() => ({
          drawImage: vi.fn(),
        })),
        toDataURL: vi.fn(() => dataUrl ?? "data:image/jpeg;base64,MOCK"),
      } as unknown as HTMLCanvasElement;

      return canvas;
    }) as typeof document.createElement;
  }

  it("returns a data URL for an image element", () => {
    mockCanvas("data:image/jpeg;base64,thumb1");
    const img = new Image();
    Object.defineProperty(img, "naturalWidth", { value: 200 });
    Object.defineProperty(img, "naturalHeight", { value: 100 });

    const result = createThumbnailDataUrl(img);
    expect(result).toBe("data:image/jpeg;base64,thumb1");
  });

  it("returns null when source dimensions are zero", () => {
    mockCanvas(null);
    const img = new Image();
    Object.defineProperty(img, "naturalWidth", { value: 0 });
    Object.defineProperty(img, "naturalHeight", { value: 0 });

    expect(createThumbnailDataUrl(img)).toBeNull();
  });

  it("returns null when canvas context is unavailable", () => {
    document.createElement = vi.fn((tagName: string) => {
      if (tagName !== "canvas") {
        return originalCreateElement.call(document, tagName);
      }
      return {
        width: 0,
        height: 0,
        getContext: vi.fn(() => null),
      } as unknown as HTMLCanvasElement;
    }) as typeof document.createElement;

    const img = new Image();
    Object.defineProperty(img, "naturalWidth", { value: 100 });
    Object.defineProperty(img, "naturalHeight", { value: 100 });

    expect(createThumbnailDataUrl(img)).toBeNull();
  });

  it("returns null for unsupported source types", () => {
    expect(createThumbnailDataUrl({} as HTMLImageElement)).toBeNull();
  });

  it("swallows canvas errors and returns null", () => {
    document.createElement = vi.fn((tagName: string) => {
      if (tagName !== "canvas") {
        return originalCreateElement.call(document, tagName);
      }
      throw new Error("canvas creation failed");
    }) as typeof document.createElement;

    const img = new Image();
    expect(createThumbnailDataUrl(img)).toBeNull();
  });

  it("returns a thumbnail from a video element", () => {
    mockCanvas("data:image/jpeg;base64,vid");
    const video = document.createElement("video") as unknown as HTMLVideoElement;
    Object.defineProperty(video, "videoWidth", { value: 200 });
    Object.defineProperty(video, "videoHeight", { value: 100 });

    expect(createThumbnailDataUrl(video)).toBe("data:image/jpeg;base64,vid");
  });

  it("returns null when source dimensions are zero for video", () => {
    mockCanvas(null);
    const video = document.createElement("video") as unknown as HTMLVideoElement;
    Object.defineProperty(video, "videoWidth", { value: 0 });
    Object.defineProperty(video, "videoHeight", { value: 0 });

    expect(createThumbnailDataUrl(video)).toBeNull();
  });

  it("returns null when toDataURL throws", () => {
    document.createElement = vi.fn((tagName: string) => {
      if (tagName !== "canvas") {
        return originalCreateElement.call(document, tagName);
      }
      return {
        width: 0,
        height: 0,
        getContext: vi.fn(() => ({
          drawImage: vi.fn(),
        })),
        toDataURL: vi.fn(() => {
          throw new Error("canvas export failed");
        }),
      } as unknown as HTMLCanvasElement;
    }) as typeof document.createElement;

    const img = new Image();
    Object.defineProperty(img, "naturalWidth", { value: 100 });
    Object.defineProperty(img, "naturalHeight", { value: 100 });

    expect(createThumbnailDataUrl(img)).toBeNull();
  });
});
