import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { CameraService } from "@/services/camera";
import { installMockCanvas } from "./helpers/canvas";
import { sleep } from "./helpers/promises";

function createMockTrack(
  torchCapable = false,
): MediaStreamTrack {
  return {
    stop: vi.fn(),
    getCapabilities: vi.fn(() =>
      torchCapable ? { torch: true } : {},
    ),
    applyConstraints: vi.fn().mockResolvedValue(undefined),
  } as unknown as MediaStreamTrack;
}

function createMockStream(track?: MediaStreamTrack): MediaStream {
  const t = track ?? createMockTrack();
  return {
    getTracks: vi.fn(() => [t]),
    getVideoTracks: vi.fn(() => [t]),
  } as unknown as MediaStream;
}

function createMockVideoElement(): HTMLVideoElement {
  return {
    videoWidth: 640,
    videoHeight: 480,
    readyState: HTMLMediaElement.HAVE_ENOUGH_DATA,
    srcObject: null,
    play: vi.fn().mockResolvedValue(undefined),
    pause: vi.fn(),
  } as unknown as HTMLVideoElement;
}

describe("CameraService", () => {
  let camera: CameraService;
  let canvas: ReturnType<typeof installMockCanvas>;
  let originalMediaDevices: Navigator["mediaDevices"];

  beforeEach(() => {
    camera = new CameraService(224);
    canvas = installMockCanvas();
    originalMediaDevices = navigator.mediaDevices;
  });

  afterEach(() => {
    camera.stop();
    canvas.restore();
    vi.restoreAllMocks();
    Object.defineProperty(navigator, "mediaDevices", {
      value: originalMediaDevices,
      configurable: true,
      writable: true,
    });
  });

  function installMediaDevices(stream: MediaStream): void {
    Object.defineProperty(navigator, "mediaDevices", {
      value: {
        getUserMedia: vi.fn().mockResolvedValue(stream),
      },
      configurable: true,
      writable: true,
    });
  }

  it("starts the camera and captures a frame", async () => {
    const stream = createMockStream();
    installMediaDevices(stream);

    const video = createMockVideoElement();
    await camera.start(video);

    const result = camera.capture();
    expect(result).not.toBeNull();
    expect(result!.width).toBe(224);
    expect(result!.height).toBe(224);
    expect(result!.thumbnail).toBeDefined();
  });

  it("returns null when the video element is not ready", async () => {
    const video = {
      ...createMockVideoElement(),
      readyState: 0,
    } as unknown as HTMLVideoElement;

    installMediaDevices(createMockStream());
    await camera.start(video);

    expect(camera.capture()).toBeNull();
  });

  it("stops the camera and releases tracks", async () => {
    const trackStop = vi.fn();
    const stream = {
      getTracks: vi.fn(() => [
        { stop: trackStop } as unknown as MediaStreamTrack,
      ]),
    } as unknown as MediaStream;

    installMediaDevices(stream);

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
          await sleep(10);
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

  it("detects torch support from video track capabilities", async () => {
    const track = createMockTrack(true);
    installMediaDevices(createMockStream(track));

    const video = createMockVideoElement();
    await camera.start(video);

    expect(camera.torchSupported()).toBe(true);
  });

  it("reports torch unsupported when no video track has torch", async () => {
    installMediaDevices(createMockStream());

    const video = createMockVideoElement();
    await camera.start(video);

    expect(camera.torchSupported()).toBe(false);
  });

  it("toggles torch on and off", async () => {
    const track = createMockTrack(true);
    installMediaDevices(createMockStream(track));

    const video = createMockVideoElement();
    await camera.start(video);

    expect(camera.isTorchOn()).toBe(false);
    expect(await camera.setTorch(true)).toBe(true);
    expect(camera.isTorchOn()).toBe(true);
    expect(track.applyConstraints).toHaveBeenCalledWith({
      advanced: [{ torch: true }],
    });

    expect(await camera.setTorch(false)).toBe(true);
    expect(camera.isTorchOn()).toBe(false);
    expect(track.applyConstraints).toHaveBeenLastCalledWith({
      advanced: [{ torch: false }],
    });
  });

  it("returns false when torch is not supported", async () => {
    installMediaDevices(createMockStream());

    const video = createMockVideoElement();
    await camera.start(video);

    expect(await camera.setTorch(true)).toBe(false);
    expect(camera.isTorchOn()).toBe(false);
  });

  it("returns false when applyConstraints fails", async () => {
    const track = createMockTrack(true);
    track.applyConstraints = vi.fn().mockRejectedValue(new Error("denied"));
    installMediaDevices(createMockStream(track));

    const video = createMockVideoElement();
    await camera.start(video);

    expect(await camera.setTorch(true)).toBe(false);
    expect(camera.isTorchOn()).toBe(false);
  });

  it("resets torch state when stopped", async () => {
    const track = createMockTrack(true);
    installMediaDevices(createMockStream(track));

    const video = createMockVideoElement();
    await camera.start(video);
    await camera.setTorch(true);
    camera.stop();

    expect(camera.isTorchOn()).toBe(false);
  });
});
