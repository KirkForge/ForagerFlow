import { logger } from "@/core/logger";

export function registerServiceWorker(): void {
  if ("serviceWorker" in navigator) {
    // Do not throw from inside .catch: a thrown value inside a
    // Promise's rejection handler creates a fresh rejected
    // promise that nothing is awaiting, which the browser
    // surfaces as "Uncaught (in promise)". Log and move on —
    // a missing service worker degrades the app to "online
    // only" but does not justify crashing init.
    navigator.serviceWorker.register("/sw.js").catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      logger.warn(`Service Worker registration failed: ${message}`);
    });
  }
}

export function updateOnlineStatus(badge: HTMLElement): void {
  const online = navigator.onLine;
  badge.textContent = online ? "Online" : "Offline";
  badge.style.color = online ? "var(--accent)" : "var(--warn)";
}
