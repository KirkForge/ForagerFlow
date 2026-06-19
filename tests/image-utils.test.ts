import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createThumbnailDataUrl } from "@/services/image-utils";
import { installMockCanvas } from "./helpers/canvas";

describe("createThumbnailDataUrl", () => {
  let canvas: ReturnType<typeof installMockCanvas>;

  beforeEach(() => {
    canvas = installMockCanvas();
  });

  afterEach(() => {
    canvas.restore();
    vi.restoreAllMocks();
  });

  function withCanvas(opts: Parameters<typeof installMockCanvas>[0]): void {
    canvas.restore();
    canvas = installMockCanvas(opts);
  }

  it("returns a data URL for an image element", () => {
    withCanvas({ thumbnail: "data:image/jpeg;base64,thumb1" });
    const img = new Image();
    Object.defineProperty(img, "naturalWidth", { value: 200 });
    Object.defineProperty(img, "naturalHeight", { value: 100 });

    expect(createThumbnailDataUrl(img)).toBe("data:image/jpeg;base64,thumb1");
  });

  it("returns null when source dimensions are zero", () => {
    withCanvas({ thumbnail: null });
    const img = new Image();
    Object.defineProperty(img, "naturalWidth", { value: 0 });
    Object.defineProperty(img, "naturalHeight", { value: 0 });

    expect(createThumbnailDataUrl(img)).toBeNull();
  });

  it("returns null when canvas context is unavailable", () => {
    withCanvas({ context: null });

    const img = new Image();
    Object.defineProperty(img, "naturalWidth", { value: 100 });
    Object.defineProperty(img, "naturalHeight", { value: 100 });

    expect(createThumbnailDataUrl(img)).toBeNull();
  });

  it("returns null for unsupported source types", () => {
    canvas.restore();
    expect(createThumbnailDataUrl({} as HTMLImageElement)).toBeNull();
  });

  it("swallows canvas errors and returns null", () => {
    canvas.restore();
    const originalCreateElement = document.createElement;
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
    withCanvas({ thumbnail: "data:image/jpeg;base64,vid" });
    const video = document.createElement(
      "video",
    ) as unknown as HTMLVideoElement;
    Object.defineProperty(video, "videoWidth", { value: 200 });
    Object.defineProperty(video, "videoHeight", { value: 100 });

    expect(createThumbnailDataUrl(video)).toBe("data:image/jpeg;base64,vid");
  });

  it("returns null when source dimensions are zero for video", () => {
    withCanvas({ thumbnail: null });
    const video = document.createElement(
      "video",
    ) as unknown as HTMLVideoElement;
    Object.defineProperty(video, "videoWidth", { value: 0 });
    Object.defineProperty(video, "videoHeight", { value: 0 });

    expect(createThumbnailDataUrl(video)).toBeNull();
  });

  it("returns null when toDataURL throws", () => {
    canvas.restore();
    const originalCreateElement = document.createElement;
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
