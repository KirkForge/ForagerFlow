import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ModelKey } from "@/core/types";

describe("config", () => {
  let originalEnv: Record<string, unknown>;

  beforeEach(() => {
    originalEnv = { ...import.meta.env };
  });

  afterEach(() => {
    Object.assign(import.meta.env, originalEnv);
    vi.resetModules();
  });

  it("uses default values when env vars are missing", async () => {
    delete import.meta.env["VITE_FEATURE_TELEMETRY"];
    delete import.meta.env["VITE_TELEMETRY_ENDPOINT"];
    delete import.meta.env["VITE_MAX_INFERENCE_RETRIES"];
    const { config } = await import("@/core/config");
    expect(config.features.telemetry).toBe(true);
    expect(config.telemetryEndpoint).toBe("");
    expect(config.maxInferenceRetries).toBe(3);
  });

  it("reads telemetry feature flag", async () => {
    import.meta.env["VITE_FEATURE_TELEMETRY"] = "false";
    const { config } = await import("@/core/config");
    expect(config.features.telemetry).toBe(false);
  });

  it("reads string env var", async () => {
    import.meta.env["VITE_TELEMETRY_ENDPOINT"] = "/api/telemetry";
    const { config } = await import("@/core/config");
    expect(config.telemetryEndpoint).toBe("/api/telemetry");
  });

  it("parses numeric env var", async () => {
    import.meta.env["VITE_MAX_INFERENCE_RETRIES"] = "5";
    const { config } = await import("@/core/config");
    expect(config.maxInferenceRetries).toBe(5);
  });

  it("falls back when env number is invalid", async () => {
    import.meta.env["VITE_MAX_INFERENCE_RETRIES"] = "not-a-number";
    const { config } = await import("@/core/config");
    expect(config.maxInferenceRetries).toBe(3);
  });

  it("computes per-model free bytes from MB env vars", async () => {
    import.meta.env["VITE_BVRA_MIN_FREE_MB"] = "200";
    import.meta.env["VITE_DIMA806_MIN_FREE_MB"] = "600";
    const { config } = await import("@/core/config");
    expect(config.minFreeBytesPerModel[ModelKey.BVRA]).toBe(200 * 1024 * 1024);
    expect(config.minFreeBytesPerModel[ModelKey.Dima806]).toBe(
      600 * 1024 * 1024,
    );
  });
});
