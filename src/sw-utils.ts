export interface ByteRange {
  start: number;
  end: number;
}

export function parseByteRange(
  rangeHeader: string,
  fullSize: number,
): ByteRange | null {
  if (!rangeHeader.startsWith("bytes=")) return null;
  const spec = rangeHeader.slice(6).trim();
  if (spec.includes(",")) return null; // multipart ranges are not supported.

  const dashIndex = spec.indexOf("-");
  if (dashIndex === -1) return null;

  const startStr = spec.slice(0, dashIndex).trim();
  const endStr = spec.slice(dashIndex + 1).trim();

  // Suffix range: bytes=-N means last N bytes.
  if (startStr === "") {
    const suffix = Number(endStr);
    if (!Number.isFinite(suffix) || suffix <= 0) return null;
    const start = Math.max(0, fullSize - suffix);
    return { start, end: fullSize - 1 };
  }

  const start = Number(startStr);
  if (!Number.isFinite(start) || start < 0) return null;

  let end: number;
  if (endStr === "") {
    end = fullSize - 1;
  } else {
    end = Number(endStr);
    if (!Number.isFinite(end) || end < 0) return null;
  }

  if (start > end || start >= fullSize) return null;
  end = Math.min(end, fullSize - 1);
  return { start, end };
}

export async function createRangedResponse(
  source: Response,
  rangeHeader: string,
): Promise<Response> {
  const contentLength = Number(source.headers.get("content-length") ?? NaN);
  if (!Number.isFinite(contentLength) || contentLength <= 0) {
    // Without a known size we cannot satisfy the range; fall back to 200.
    return source;
  }

  const range = parseByteRange(rangeHeader, contentLength);
  if (range === null) {
    // Invalid or unsupported range syntax: ignore range per RFC 7233.
    return source;
  }

  const arrayBuffer = await source.arrayBuffer();
  const sliced = arrayBuffer.slice(range.start, range.end + 1);
  const headers = new Headers(source.headers);
  headers.set("Content-Length", String(sliced.byteLength));
  headers.set(
    "Content-Range",
    `bytes ${String(range.start)}-${String(range.end)}/${String(contentLength)}`,
  );
  headers.set("Accept-Ranges", "bytes");
  return new Response(sliced, {
    status: 206,
    statusText: "Partial Content",
    headers,
  });
}

export function estimateResponseSize(response: Response): number | null {
  const length = Number(response.headers.get("content-length") ?? NaN);
  return Number.isFinite(length) && length > 0 ? length : null;
}

export function shouldCacheLargeAsset(
  assetSize: number | null,
  usage: number,
  quota: number,
  quotaFraction: number,
  minFreeBytes: number,
): boolean {
  if (!Number.isFinite(quota) || quota <= 0) return true; // cannot estimate, be optimistic.
  const projectedUsage = usage + (assetSize ?? 0);
  const projectedFree = quota - projectedUsage;
  return (
    projectedUsage <= quota * quotaFraction && projectedFree >= minFreeBytes
  );
}

export interface StorageEstimateLike {
  quota?: number;
  usage?: number;
}

export function hasEnoughStorageToCache(
  response: Response,
  storage: StorageEstimateLike,
  quotaFraction: number,
  minFreeBytes: number,
): boolean {
  const size = estimateResponseSize(response);
  return shouldCacheLargeAsset(
    size,
    storage.usage ?? 0,
    storage.quota ?? 0,
    quotaFraction,
    minFreeBytes,
  );
}
