import { logger } from "@/core/logger";
import { t } from "@/i18n";

export function registerServiceWorker(): void {
  if ("serviceWorker" in navigator) {
    // Log and swallow — a missing SW is non-fatal.
    navigator.serviceWorker.register("/sw.js").catch((err: unknown) => {
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
