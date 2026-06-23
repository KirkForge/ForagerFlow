import { describe, it, expect } from "vitest";
import {
  parseByteRange,
  createRangedResponse,
  estimateResponseSize,
  shouldCacheLargeAsset,
  hasEnoughStorageToCache,
} from "@/sw-utils";

function makeResponse(body: Uint8Array): Response {
  return new Response(body, {
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Length": String(body.length),
    },
  });
}

describe("parseByteRange", () => {
  it("parses a closed range", () => {
    expect(parseByteRange("bytes=0-9", 100)).toEqual({ start: 0, end: 9 });
  });

  it("parses an open-ended range", () => {
    expect(parseByteRange("bytes=90-", 100)).toEqual({ start: 90, end: 99 });
  });

  it("parses a suffix range", () => {
    expect(parseByteRange("bytes=-10", 100)).toEqual({ start: 90, end: 99 });
  });

  it("clamps the end to the last byte", () => {
    expect(parseByteRange("bytes=90-200", 100)).toEqual({ start: 90, end: 99 });
  });

  it("returns null for non-bytes units", () => {
    expect(parseByteRange("items=0-9", 100)).toBeNull();
  });

  it("returns null for multipart ranges", () => {
    expect(parseByteRange("bytes=0-9,20-29", 100)).toBeNull();
  });

  it("returns null when start is past the end of the resource", () => {
    expect(parseByteRange("bytes=100-", 100)).toBeNull();
  });

  it("returns null for malformed ranges", () => {
    expect(parseByteRange("bytes=foo", 100)).toBeNull();
    expect(parseByteRange("bytes=9-0", 100)).toBeNull();
  });
});

describe("createRangedResponse", () => {
  it("returns a 206 response for a valid range", async () => {
    const body = new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    const source = makeResponse(body);

    const response = await createRangedResponse(source, "bytes=2-5");

    expect(response.status).toBe(206);
    expect(response.headers.get("content-range")).toBe("bytes 2-5/10");
    expect(response.headers.get("content-length")).toBe("4");
    expect(response.headers.get("accept-ranges")).toBe("bytes");
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(
      new Uint8Array([2, 3, 4, 5]),
    );
  });

  it("ignores the range when no content-length is known", async () => {
    const source = new Response(new Uint8Array([0, 1, 2, 3]), {
      headers: { "Content-Type": "application/octet-stream" },
    });
    const response = await createRangedResponse(source, "bytes=0-1");
    expect(response.status).toBe(200);
  });

  it("ignores invalid range syntax and returns the full response", async () => {
    const body = new Uint8Array([0, 1, 2, 3]);
    const source = makeResponse(body);

    const response = await createRangedResponse(source, "bytes=garbage");

    expect(response.status).toBe(200);
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(body);
  });
});

describe("estimateResponseSize", () => {
  it("reads content-length when present", () => {
    const response = makeResponse(new Uint8Array(42));
    expect(estimateResponseSize(response)).toBe(42);
  });

  it("returns null when content-length is missing", () => {
    const response = new Response(new Uint8Array(10));
    expect(estimateResponseSize(response)).toBeNull();
  });
});

describe("shouldCacheLargeAsset", () => {
  it("returns true when within quota fraction and free-space budget", () => {
    expect(
      shouldCacheLargeAsset(50, 100, 1000, 0.85, 50),
    ).toBe(true);
  });

  it("returns false when projected usage exceeds quota fraction", () => {
    expect(
      shouldCacheLargeAsset(100, 760, 1000, 0.85, 0),
    ).toBe(false);
  });

  it("returns false when projected free space is below minimum", () => {
    expect(
      shouldCacheLargeAsset(100, 800, 1000, 1.0, 200),
    ).toBe(false);
  });

  it("returns true when quota is unavailable", () => {
    expect(
      shouldCacheLargeAsset(100, 0, 0, 0.85, 0),
    ).toBe(true);
  });
});

describe("hasEnoughStorageToCache", () => {
  it("allows caching when estimate has room", () => {
    const response = makeResponse(new Uint8Array(50));
    const ok = hasEnoughStorageToCache(
      response,
      { usage: 100, quota: 1000 },
      0.85,
      50,
    );
    expect(ok).toBe(true);
  });

  it("denies caching when estimate is exhausted", () => {
    const response = makeResponse(new Uint8Array(200));
    const ok = hasEnoughStorageToCache(
      response,
      { usage: 760, quota: 1000 },
      0.85,
      0,
    );
    expect(ok).toBe(false);
  });
});
