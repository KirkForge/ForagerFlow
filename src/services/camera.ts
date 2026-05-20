import { CameraError } from "@/core/errors";
import { logger } from "@/core/logger";

export interface CaptureResult {
  buffer: ArrayBuffer;
  width: number;
  height: number;
}

export class CameraService {
  private stream: MediaStream | null = null;
  private videoElement: HTMLVideoElement | null = null;
  private captureSize: number;

  constructor(captureSize = 224) {
    this.captureSize = captureSize;
  }

  async start(videoElement: HTMLVideoElement): Promise<void> {
    this.videoElement = videoElement;
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
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
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");

    if (!ctx) return null;

    const sz = Math.min(video.videoWidth, video.videoHeight);
    const sx = (video.videoWidth - sz) / 2;
    const sy = (video.videoHeight - sz) / 2;
    ctx.drawImage(video, sx, sy, sz, sz, 0, 0, size, size);

    const imageData = ctx.getImageData(0, 0, size, size);
    const buffer = imageData.data.buffer;
    return {
      buffer: buffer as ArrayBuffer,
      width: size,
      height: size,
    };
  }

  stop(): void {
    if (this.stream) {
      this.stream.getTracks().forEach((track) => {
        track.stop();
      });
      this.stream = null;
    }
    if (this.videoElement) {
      this.videoElement.srcObject = null;
    }
  }
}
