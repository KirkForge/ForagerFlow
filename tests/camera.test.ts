import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { CameraService } from "@/services/camera";

function installMockCanvas() {
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
        getImageData: vi.fn(() => ({
          data: { buffer: new ArrayBuffer(224 * 224 * 4) },
        })),
      })),
      toDataURL: vi.fn(() => "data:image/jpeg;base64,THUMB"),
    } as unknown as HTMLCanvasElement;
  }) as typeof document.createElement;
  return originalCreateElement;
}

describe("CameraService", () => {
  let camera: CameraService;
  let originalMediaDevices: Navigator["mediaDevices"];

  function createMockStream(): MediaStream {
    const track = {
      stop: vi.fn(),
    } as unknown as MediaStreamTrack;
    return {
      getTracks: vi.fn(() => [track]),
    } as unknown as MediaStream;
  }

  function createMockVideoElement(): HTMLVideoElement {
    return {
      videoWidth: 640,
      videoHeight: 480,
      readyState: 4, // HAVE_ENOUGH_DATA
      srcObject: null,
      play: vi.fn().mockResolvedValue(undefined),
      pause: vi.fn(),
    } as unknown as HTMLVideoElement;
  }

  let originalCreateElement: typeof document.createElement;

  beforeEach(() => {
    camera = new CameraService(224);
    originalMediaDevices = navigator.mediaDevices;
    originalCreateElement = installMockCanvas();
  });

  afterEach(() => {
    camera.stop();
    document.createElement = originalCreateElement;
    vi.restoreAllMocks();
    Object.defineProperty(navigator, "mediaDevices", {
      value: originalMediaDevices,
      configurable: true,
      writable: true,
    });
  });

  it("starts the camera and captures a frame", async () => {
    const stream = createMockStream();
    Object.defineProperty(navigator, "mediaDevices", {
      value: {
        getUserMedia: vi.fn().mockResolvedValue(stream),
      },
      configurable: true,
      writable: true,
    });

    const video = createMockVideoElement();
    await camera.start(video);

    const result = camera.capture();
    expect(result).not.toBeNull();
    expect(result!.width).toBe(224);
    expect(result!.height).toBe(224);
    expect(result!.thumbnail).toBeDefined();
  });

  it("returns null when the video element is not ready", () => {
    const video = {
      ...createMockVideoElement(),
      readyState: 0,
    } as unknown as HTMLVideoElement;

    // Directly set the internal video element by starting first, then mutate.
    Object.defineProperty(navigator, "mediaDevices", {
      value: {
        getUserMedia: vi.fn().mockResolvedValue(createMockStream()),
      },
      configurable: true,
      writable: true,
    });

    return camera.start(video).then(() => {
      const result = camera.capture();
      expect(result).toBeNull();
    });
  });

  it("stops the camera and releases tracks", async () => {
    const trackStop = vi.fn();
    const stream = {
      getTracks: vi.fn(() => [
        { stop: trackStop } as unknown as MediaStreamTrack,
      ]),
    } as unknown as MediaStream;

    Object.defineProperty(navigator, "mediaDevices", {
      value: {
        getUserMedia: vi.fn().mockResolvedValue(stream),
      },
      configurable: true,
      writable: true,
    });

    const video = createMockVideoElement();
    await camera.start(video);
    camera.stop();

    expect(trackStop).toHaveBeenCalled();
    expect(video.srcObject).toBeNull();
  });

  it("serializes concurrent start calls", async () => {
    const stream = createMockStream();
    let callCount = 0;
    Object.defineProperty(navigator, "mediaDevices", {
      value: {
        getUserMedia: vi.fn().mockImplementation(async () => {
          callCount++;
          await new Promise((resolve) => setTimeout(resolve, 10));
          return stream;
        }),
      },
      configurable: true,
      writable: true,
    });

    const video = createMockVideoElement();
    await Promise.all([
      camera.start(video),
      camera.start(video),
      camera.start(video),
    ]);

    expect(callCount).toBe(1);
  });
});
