import { ModelKey } from "@/core/types";

function envNumber(key: string, fallback: number): number {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  const val: string | undefined = import.meta.env[key];
  if (val === undefined) return fallback;
  const num = Number(val);
  return Number.isFinite(num) ? num : fallback;
}

function envString(key: string, fallback: string): string {
  return (import.meta.env[key] as string | undefined) ?? fallback;
}

export const config = {
  maxInferenceRetries: envNumber("VITE_MAX_INFERENCE_RETRIES", 3),
  retryDelayMs: envNumber("VITE_RETRY_DELAY_MS", 1000),
  captureSize: envNumber("VITE_CAPTURE_SIZE", 224),
  historyLimit: envNumber("VITE_HISTORY_LIMIT", 200),
  appVersion: envString("VITE_APP_VERSION", __APP_VERSION__),
  minFreeBytesPerModel: {
    [ModelKey.BVRA]: envNumber("VITE_BVRA_MIN_FREE_MB", 150) * 1024 * 1024,
    [ModelKey.Dima806]:
      envNumber("VITE_DIMA806_MIN_FREE_MB", 500) * 1024 * 1024,
  },
  storageEstimateTimeoutMs: envNumber("VITE_STORAGE_ESTIMATE_TIMEOUT_MS", 1500),
  modelIdleUnloadMs: envNumber("VITE_MODEL_IDLE_UNLOAD_MS", 0),
  swModelCacheQuotaFraction: envNumber(
    "VITE_SW_MODEL_CACHE_QUOTA_FRACTION",
    0.85,
  ),
  swMinFreeBytes: envNumber("VITE_SW_MIN_FREE_BYTES", 100) * 1024 * 1024,
  telemetryEndpoint: envString("VITE_TELEMETRY_ENDPOINT", ""),
  syncUrl: envString("VITE_SYNC_URL", ""),
  syncToken: envString("VITE_SYNC_TOKEN", ""),
  features: {
    telemetry:
      (import.meta.env["VITE_FEATURE_TELEMETRY"] as string | undefined) !==
      "false",
  },
} as const;
