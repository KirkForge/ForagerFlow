/**
 * Shared image utilities for camera capture and file preprocessing.
 * Keeps thumbnail generation in one place so both paths produce identical output.
 */

export interface ThumbnailOptions {
  size?: number;
  quality?: number;
  type?: string;
}

export function createThumbnailDataUrl(
  source: CanvasImageSource,
  options: ThumbnailOptions = {},
): string | null {
  const { size = 96, quality = 0.7, type = "image/jpeg" } = options;

  try {
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    let sourceWidth = 0;
    let sourceHeight = 0;

    if (source instanceof HTMLVideoElement) {
      sourceWidth = source.videoWidth;
      sourceHeight = source.videoHeight;
    } else if (source instanceof HTMLImageElement) {
      sourceWidth = source.naturalWidth;
      sourceHeight = source.naturalHeight;
    } else if (source instanceof ImageBitmap) {
      sourceWidth = source.width;
      sourceHeight = source.height;
    } else if (source instanceof OffscreenCanvas) {
      sourceWidth = source.width;
      sourceHeight = source.height;
    } else {
      return null;
    }

    if (sourceWidth === 0 || sourceHeight === 0) return null;

    const sz = Math.min(sourceWidth, sourceHeight);
    const sx = (sourceWidth - sz) / 2;
    const sy = (sourceHeight - sz) / 2;
    ctx.drawImage(source, sx, sy, sz, sz, 0, 0, size, size);

    return canvas.toDataURL(type, quality);
  } catch {
    // Thumbnails are best-effort; failures must not break inference.
    return null;
  }
}
