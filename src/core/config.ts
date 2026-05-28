/**
 * Runtime configuration for ForagerFlow.
 * Values come from Vite env vars (prefixed with VITE_) or fall back to defaults.
 * Feature flags allow gradual rollout of new capabilities.
 */

function envBool(key: string, fallback: boolean): boolean {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  const val: string | undefined = import.meta.env[key];
  if (val === undefined) return fallback;
  return val === "true" || val === "1";
}

function envString(key: string, fallback: string): string {
  return (import.meta.env[key] as string | undefined) ?? fallback;
}

function envNumber(key: string, fallback: number): number {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  const val: string | undefined = import.meta.env[key];
  if (val === undefined) return fallback;
  const num = Number(val);
  return Number.isFinite(num) ? num : fallback;
}

export const config = {
  /** Maximum inference retries before giving up */
  maxInferenceRetries: envNumber("VITE_MAX_INFERENCE_RETRIES", 3),

  /** Delay between retries in ms (multiplied by attempt count) */
  retryDelayMs: envNumber("VITE_RETRY_DELAY_MS", 1000),

  /** Camera capture resolution (square pixels) */
  captureSize: envNumber("VITE_CAPTURE_SIZE", 224),

  /** Maximum history entries to keep in IndexedDB */
  historyLimit: envNumber("VITE_HISTORY_LIMIT", 200),

  /** App version from package.json, overridden by env */
  appVersion: envString("VITE_APP_VERSION", "2.1.0"),

  /** Feature flags */
  features: {
    /** Enable web vitals collection */
    webVitals: envBool("VITE_FEATURE_WEB_VITALS", true),

    /** Enable telemetry recording */
    telemetry: envBool("VITE_FEATURE_TELEMETRY", true),

    /** Enable history persistence */
    history: envBool("VITE_FEATURE_HISTORY", true),

    /** Enable model switching at runtime */
    modelSwitch: envBool("VITE_FEATURE_MODEL_SWITCH", true),
  },
} as const;

/** Type-safe config key lookup */
export type AppConfig = typeof config;
