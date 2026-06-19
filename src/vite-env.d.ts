/// <reference types="vite/client" />

declare module "*.json" {
  const value: Record<string, unknown>;
  export default value;
}

declare global {
  interface ImportMetaEnv {
    readonly DEV: boolean;
    readonly PROD: boolean;
  }

  interface ImportMeta {
    readonly env: ImportMetaEnv;
    readonly dirname: string;
    readonly url: string;
  }
}

// Injected by Vite at build time from package.json version.
declare const __APP_VERSION__: string;
