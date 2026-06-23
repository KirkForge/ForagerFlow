/// <reference types="vite/client" />

declare module "*.json" {
  const value: Record<string, unknown>;
  export default value;
}

declare global {
  interface ImportMetaEnv {
    readonly DEV: boolean;
    readonly PROD: boolean;
    readonly VITE_MAX_INFERENCE_RETRIES?: string;
    readonly VITE_RETRY_DELAY_MS?: string;
    readonly VITE_CAPTURE_SIZE?: string;
    readonly VITE_HISTORY_LIMIT?: string;
    readonly VITE_APP_VERSION?: string;
    readonly VITE_BVRA_MIN_FREE_MB?: string;
    readonly VITE_DIMA806_MIN_FREE_MB?: string;
    readonly VITE_STORAGE_ESTIMATE_TIMEOUT_MS?: string;
    readonly VITE_TELEMETRY_ENDPOINT?: string;
    readonly VITE_FEATURE_TELEMETRY?: string;
    readonly [key: string]: string | boolean | undefined;
  }

  interface ImportMeta {
    readonly env: ImportMetaEnv;
    readonly dirname: string;
    readonly url: string;
  }
}

// Injected by Vite at build time from package.json version.
declare const __APP_VERSION__: string;
