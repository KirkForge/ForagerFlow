import { describe, it, expect, vi, afterEach } from "vitest";
import { createRequire } from "node:module";

interface AssetLinksModule {
  normalizeFingerprint: (fingerprint: string) => string;
  generateAssetLinks: () => string;
}

const require = createRequire(import.meta.url);
const { normalizeFingerprint, generateAssetLinks } = require(
  "../scripts/generate-assetlinks.cjs",
) as AssetLinksModule;

describe("generate-assetlinks", () => {
  afterEach(() => {
    delete process.env["TWA_SHA256_FINGERPRINT"];
    vi.restoreAllMocks();
  });

  it("normalizes a fingerprint to upper-case colon pairs", () => {
    expect(normalizeFingerprint("aabbcc00")).toBe("AA:BB:CC:00");
  });

  it("uses a placeholder when no fingerprint is provided", () => {
    const warnSpy = vi
      .spyOn(console, "warn")
      .mockImplementation(() => undefined);

    const content = generateAssetLinks();

    expect(content).toContain(
      "00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00",
    );
    expect(content).toContain("delegate_permission/common.handle_all_urls");
    expect(content).toContain("com.kirkforge.foragerflow");
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("TWA_SHA256_FINGERPRINT not set"),
    );

    warnSpy.mockRestore();
  });

  it("writes normalized fingerprint from environment", () => {
    process.env["TWA_SHA256_FINGERPRINT"] =
      "aa:bb:cc:dd:ee:ff:00:11:22:33:44:55:66:77:88:99:aa:bb:cc:dd:ee:ff:00:11:22:33:44:55:66:77:88:99";

    const content = generateAssetLinks();

    expect(content).toContain(
      "AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99",
    );
    expect(content).toContain("delegate_permission/common.handle_all_urls");
    expect(content).toContain("com.kirkforge.foragerflow");
  });
});
