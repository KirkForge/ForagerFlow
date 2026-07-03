import { logger } from "@/core/logger";
import { t } from "@/i18n";

export function registerServiceWorker(): void {
  if ("serviceWorker" in navigator) {
    // Log and swallow — a missing SW is non-fatal.
    // ponytail: built sw.js is an ESM bundle (vite emits `import`), so it must
    // register as a module script or evaluation fails with no controller.
    navigator.serviceWorker
      .register("/sw.js", { type: "module" })
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : String(err);
        logger.warn(`Service Worker registration failed: ${message}`);
      });
  }
}

export function updateOnlineStatus(badge: HTMLElement): void {
  const online = navigator.onLine;
  badge.textContent = online ? t("app.online") : t("app.offline");
  badge.style.color = online ? "var(--accent)" : "var(--warn)";
}

/**
 * True when the active connection is metered mobile data. The Network Information
 * API's `type` is the only field that distinguishes cellular from Wi-Fi; when it
 * is unavailable (Safari, older browsers, jsdom) we fail open and return false
 * so a large model download is never silently blocked on a connection we can't
 * classify.
 */
export function isCellularConnection(): boolean {
  const connection = (
    navigator as { connection?: { type?: string } }
  ).connection;
  return connection?.type === "cellular";
}
