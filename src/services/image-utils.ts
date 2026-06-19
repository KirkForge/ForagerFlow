export interface ThumbnailOptions {
  size?: number;
  quality?: number;
  type?: string;
}

export function drawCenterCrop(
  ctx: CanvasRenderingContext2D,
  source: CanvasImageSource,
  srcWidth: number,
  srcHeight: number,
  dstSize: number,
): void {
  const sz = Math.min(srcWidth, srcHeight);
  const sx = (srcWidth - sz) / 2;
  const sy = (srcHeight - sz) / 2;
  ctx.drawImage(source, sx, sy, sz, sz, 0, 0, dstSize, dstSize);
}

export function createThumbnailDataUrl(
  source: HTMLImageElement | HTMLVideoElement,
  options: ThumbnailOptions = {},
): string | null {
  const { size = 96, quality = 0.7, type = "image/jpeg" } = options;

  try {
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    const sourceWidth =
      source instanceof HTMLVideoElement
        ? source.videoWidth
        : source.naturalWidth;
    const sourceHeight =
      source instanceof HTMLVideoElement
        ? source.videoHeight
        : source.naturalHeight;

    if (sourceWidth === 0 || sourceHeight === 0) return null;

    drawCenterCrop(ctx, source, sourceWidth, sourceHeight, size);
    return canvas.toDataURL(type, quality);
  } catch {
    return null;
  }
}
