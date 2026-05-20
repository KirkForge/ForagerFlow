export function registerServiceWorker(): void {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("/sw.js").catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(`Service Worker registration failed: ${message}`);
    });
  }
}

export function updateOnlineStatus(badge: HTMLElement): void {
  const online = navigator.onLine;
  badge.textContent = online ? "Online" : "Offline";
  badge.style.color = online ? "var(--accent)" : "var(--warn)";
}
