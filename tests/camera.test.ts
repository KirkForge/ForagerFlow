import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { CameraService } from "@/services/camera";
import { installMockCanvas } from "./helpers/canvas";
import { sleep } from "./helpers/promises";

function createMockTrack(
  torchCapable = false,
  focusModes: string[] = [],
  exposureModes: string[] = [],
): MediaStreamTrack {
  const caps: Record<string, unknown> = {};
  if (torchCapable) caps["torch"] = true;
  if (focusModes.length > 0) caps["focusMode"] = focusModes;
  if (exposureModes.length > 0) caps["exposureMode"] = exposureModes;
  return {
    stop: vi.fn(),
    getCapabilities: vi.fn(() => caps),
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

  it("maps DOM touch points to normalized video coordinates", () => {
    const video = {
      videoWidth: 640,
      videoHeight: 480,
      getBoundingClientRect: () => ({
        left: 0,
        top: 0,
        width: 320,
        height: 320,
      }),
    } as unknown as HTMLVideoElement;

    // Element is square (320x320), video is 4:3 landscape (640x480). With
    // cover, height fills and width is cropped: scale = 320/480 ≈ 0.667,
    // scaled width = 426.67, offsetX = (320 - 426.67) / 2 ≈ -53.33.
    const topLeft = CameraService.mapDomPointToNormalized(video, 0, 0);
    expect(topLeft).not.toBeNull();
    if (!topLeft) return;
    expect(topLeft.x).toBeCloseTo(0.125, 5);
    expect(topLeft.y).toBeCloseTo(0, 5);

    const center = CameraService.mapDomPointToNormalized(video, 160, 160);
    expect(center).toEqual({ x: 0.5, y: 0.5 });

    const bottomRight = CameraService.mapDomPointToNormalized(video, 320, 320);
    expect(bottomRight).not.toBeNull();
    if (!bottomRight) return;
    expect(bottomRight.x).toBeCloseTo(0.875, 5);
    expect(bottomRight.y).toBeCloseTo(1, 5);
  });

  it("returns null when video dimensions are not available", () => {
    const video = {
      videoWidth: 0,
      videoHeight: 0,
      getBoundingClientRect: () => ({
        left: 0,
        top: 0,
        width: 320,
        height: 320,
      }),
    } as unknown as HTMLVideoElement;

    expect(CameraService.mapDomPointToNormalized(video, 100, 100)).toBeNull();
  });

  it("detects focus support from video track capabilities", async () => {
    const track = createMockTrack(false, ["continuous", "manual"]);
    installMediaDevices(createMockStream(track));

    const video = createMockVideoElement();
    await camera.start(video);

    expect(camera.focusSupported()).toBe(true);
  });

  it("detects exposure support as focus support", async () => {
    const track = createMockTrack(false, [], ["auto", "manual"]);
    installMediaDevices(createMockStream(track));

    const video = createMockVideoElement();
    await camera.start(video);

    expect(camera.focusSupported()).toBe(true);
  });

  it("reports focus unsupported when no manual modes are available", async () => {
    const track = createMockTrack(false, ["continuous"], ["auto"]);
    installMediaDevices(createMockStream(track));

    const video = createMockVideoElement();
    await camera.start(video);

    expect(camera.focusSupported()).toBe(false);
  });

  it("applies focus and exposure constraints on tap", async () => {
    const track = createMockTrack(false, ["manual"], ["manual"]);
    installMediaDevices(createMockStream(track));

    const video = createMockVideoElement();
    await camera.start(video);

    expect(await camera.focusAt(0.5, 0.5)).toBe(true);
    expect(track.applyConstraints).toHaveBeenCalledWith({
      advanced: [
        {
          focusMode: "manual",
          exposureMode: "manual",
          pointsOfInterest: [{ x: 0.5, y: 0.5 }],
        },
      ],
    });
  });

  it("applies only supported constraint modes on tap", async () => {
    const track = createMockTrack(false, ["manual"], []);
    installMediaDevices(createMockStream(track));

    const video = createMockVideoElement();
    await camera.start(video);

    expect(await camera.focusAt(0.25, 0.75)).toBe(true);
    expect(track.applyConstraints).toHaveBeenCalledWith({
      advanced: [
        {
          focusMode: "manual",
          pointsOfInterest: [{ x: 0.25, y: 0.75 }],
        },
      ],
    });
  });

  it("returns false when focus and exposure are unsupported", async () => {
    installMediaDevices(createMockStream());

    const video = createMockVideoElement();
    await camera.start(video);

    expect(await camera.focusAt(0.5, 0.5)).toBe(false);
  });

  it("returns false when applyConstraints fails for focus", async () => {
    const track = createMockTrack(false, ["manual"]);
    track.applyConstraints = vi.fn().mockRejectedValue(new Error("denied"));
    installMediaDevices(createMockStream(track));

    const video = createMockVideoElement();
    await camera.start(video);

    expect(await camera.focusAt(0.5, 0.5)).toBe(false);
  });
});
