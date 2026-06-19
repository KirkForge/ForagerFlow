import { CameraError } from "@/core/errors";
import { logger } from "@/core/logger";
import { createThumbnailDataUrl } from "./image-utils";

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

  constructor(captureSize = 224) {
    this.captureSize = captureSize;
  }

  async start(videoElement: HTMLVideoElement): Promise<void> {
    // Serialize concurrent start() calls so rapid retries don't create
    // multiple overlapping MediaStreams.
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
    // Stop any existing stream before acquiring a new one.
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

    // Guard against capturing before the stream has produced a frame.
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

    const sz = Math.min(video.videoWidth, video.videoHeight);
    const sx = (video.videoWidth - sz) / 2;
    const sy = (video.videoHeight - sz) / 2;
    ctx.drawImage(video, sx, sy, sz, sz, 0, 0, size, size);

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

  stop(): void {
    if (this.stream) {
      this.stream.getTracks().forEach((track) => {
        track.stop();
      });
      this.stream = null;
    }
    if (this.videoElement) {
      this.videoElement.srcObject = null;
      this.videoElement = null;
    }
  }
}
