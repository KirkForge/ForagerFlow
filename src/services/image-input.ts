import type { CaptureResult } from "@/services/camera";
import { config } from "@/core/config";
import { createThumbnailDataUrl } from "./image-utils";

export function processFileInput(
  file: File,
  size = config.captureSize,
): Promise<CaptureResult> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    // Revoke the blob URL once the image has been decoded (or failed
    // to decode). Without this, every photo the user picks from the
    // file input leaks a blob URL for the lifetime of the document.
    const cleanup = (): void => {
      URL.revokeObjectURL(objectUrl);
    };
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d");

      if (!ctx) {
        cleanup();
        reject(new Error("Failed to get canvas context"));
        return;
      }

      const sz = Math.min(img.naturalWidth, img.naturalHeight);
      const sx = (img.naturalWidth - sz) / 2;
      const sy = (img.naturalHeight - sz) / 2;
      ctx.drawImage(img, sx, sy, sz, sz, 0, 0, size, size);

      const imageData = ctx.getImageData(0, 0, size, size);
      const thumbnail = createThumbnailDataUrl(img);
      cleanup();
      resolve({
        buffer: imageData.data.buffer,
        width: size,
        height: size,
        thumbnail,
      });
    };
    img.onerror = () => {
      cleanup();
      reject(new Error("Failed to load image file"));
    };
    img.src = objectUrl;
  });
}
