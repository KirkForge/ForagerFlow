import { CameraError } from "@/core/errors";
import { logger } from "@/core/logger";
import { createThumbnailDataUrl, drawCenterCrop } from "./image-utils";

interface CameraCapabilities extends MediaTrackCapabilities {
  focusMode?: string[];
  exposureMode?: string[];
}

interface CameraConstraintSet extends MediaTrackConstraintSet {
  focusMode?: string;
  exposureMode?: string;
  pointsOfInterest?: { x: number; y: number }[];
}

export interface CaptureResult {
  buffer: ArrayBuffer;
  width: number;
  height: number;
  thumbnail: string | null;
}

export class CameraService {
  private stream: MediaStream | null = null;
  private videoElement: HTMLVideoElement | null = null;
  private captureSize: number;
  private starting: Promise<void> | null = null;
  private torchOn = false;

  constructor(captureSize = 224) {
    this.captureSize = captureSize;
  }

  async start(videoElement: HTMLVideoElement): Promise<void> {
    if (this.starting) {
      return this.starting;
    }

    this.starting = this.doStart(videoElement);
    try {
      await this.starting;
    } finally {
      this.starting = null;
    }
  }

  private async doStart(videoElement: HTMLVideoElement): Promise<void> {
    this.stop();
    this.videoElement = videoElement;

    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "environment",
          width: { ideal: 640 },
          height: { ideal: 480 },
        },
      });
      videoElement.srcObject = this.stream;
      await videoElement.play();
      logger.info("Camera started successfully");
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Camera access denied";
      logger.error("Camera error:", message);
      throw new CameraError(message);
    }
  }

  capture(): CaptureResult | null {
    if (!this.videoElement) return null;

    const video = this.videoElement;
    const size = this.captureSize;

    if (
      video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA ||
      video.videoWidth === 0 ||
      video.videoHeight === 0
    ) {
      return null;
    }

    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");

    if (!ctx) return null;

    drawCenterCrop(ctx, video, video.videoWidth, video.videoHeight, size);

    const imageData = ctx.getImageData(0, 0, size, size);
    const buffer = imageData.data.buffer;
    const thumbnail = createThumbnailDataUrl(video);
    return {
      buffer: buffer,
      width: size,
      height: size,
      thumbnail,
    };
  }

  /* eslint-disable @typescript-eslint/no-unnecessary-condition */
  torchSupported(): boolean {
    if (!this.stream) return false;
    for (const track of this.stream.getVideoTracks()) {
      try {
        const caps = track.getCapabilities?.();
        if (caps && "torch" in caps && caps.torch) {
          return true;
        }
      } catch {
        /* ignore capability read failures */
      }
    }
    return false;
  }
  /* eslint-enable @typescript-eslint/no-unnecessary-condition */

  isTorchOn(): boolean {
    return this.torchOn;
  }

  /* eslint-disable @typescript-eslint/no-unnecessary-condition */
  async setTorch(on: boolean): Promise<boolean> {
    if (!this.stream) return false;
    for (const track of this.stream.getVideoTracks()) {
      try {
        const caps = track.getCapabilities?.();
        if (!caps || !("torch" in caps) || !caps.torch) continue;
        const constraints: MediaTrackConstraints = {
          advanced: [{ torch: on } as MediaTrackConstraintSet],
        };
        await track.applyConstraints(constraints);
        this.torchOn = on;
        return true;
      } catch (err) {
        logger.warn("Torch toggle failed:", err);
      }
    }
    return false;
  }
  /* eslint-enable @typescript-eslint/no-unnecessary-condition */

  static mapDomPointToNormalized(
    video: HTMLVideoElement,
    clientX: number,
    clientY: number,
  ): { x: number; y: number } | null {
    if (video.videoWidth === 0 || video.videoHeight === 0) return null;

    const rect = video.getBoundingClientRect();
    const cssX = clientX - rect.left;
    const cssY = clientY - rect.top;

    const elementWidth = rect.width;
    const elementHeight = rect.height;
    const videoWidth = video.videoWidth;
    const videoHeight = video.videoHeight;

    // object-fit: cover scaling: the video is scaled so the smaller
    // dimension fills the element, and the larger dimension is cropped.
    const scale = Math.max(
      elementWidth / videoWidth,
      elementHeight / videoHeight,
    );
    const scaledVideoWidth = videoWidth * scale;
    const scaledVideoHeight = videoHeight * scale;

    const offsetX = (elementWidth - scaledVideoWidth) / 2;
    const offsetY = (elementHeight - scaledVideoHeight) / 2;

    const x = (cssX - offsetX) / scaledVideoWidth;
    const y = (cssY - offsetY) / scaledVideoHeight;

    return {
      x: Math.max(0, Math.min(1, x)),
      y: Math.max(0, Math.min(1, y)),
    };
  }

  /* eslint-disable @typescript-eslint/no-unnecessary-condition */
  async focusAt(x: number, y: number): Promise<boolean> {
    if (!this.stream) return false;
    const point = { x, y };
    for (const track of this.stream.getVideoTracks()) {
      try {
        const caps = track.getCapabilities?.() as
          | CameraCapabilities
          | undefined;
        if (!caps) continue;
        const focusModes = caps.focusMode;
        const exposureModes = caps.exposureMode;
        const supportsFocus =
          Array.isArray(focusModes) && focusModes.includes("manual");
        const supportsExposure =
          Array.isArray(exposureModes) && exposureModes.includes("manual");
        if (!supportsFocus && !supportsExposure) continue;

        const advancedConstraints: CameraConstraintSet = {};
        if (supportsFocus) advancedConstraints.focusMode = "manual";
        if (supportsExposure) advancedConstraints.exposureMode = "manual";
        if (supportsFocus || supportsExposure) {
          advancedConstraints.pointsOfInterest = [point];
        }

        await track.applyConstraints({
          advanced: [advancedConstraints],
        });
        return true;
      } catch (err) {
        logger.warn("Tap-to-focus failed:", err);
      }
    }
    return false;
  }
  /* eslint-enable @typescript-eslint/no-unnecessary-condition */

  stop(): void {
    if (this.stream) {
      this.stream.getTracks().forEach((track) => {
        track.stop();
      });
      this.torchOn = false;
      this.stream = null;
    }
    if (this.videoElement) {
      this.videoElement.srcObject = null;
      this.videoElement = null;
    }
  }
}
