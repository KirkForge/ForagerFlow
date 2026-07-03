import { AppController } from "@/app";
import { recordCrash } from "@/core";
import { logger } from "@/core/logger";
import { initLocale, t } from "@/i18n";
import { applySafetyLinks } from "@/i18n/safety";

initLocale();
applySafetyLinks();

function showFatalStatus(message: string): void {
  const status = document.getElementById("status");
  if (status) {
    status.textContent = message;
  }
}

if (typeof window !== "undefined") {
  window.addEventListener("error", (event: ErrorEvent) => {
    logger.error("Unhandled error:", event.error ?? event.message);
    recordCrash(event.error ?? event.message, "window.error");
    showFatalStatus(t("status.initError"));
  });
  window.addEventListener(
    "unhandledrejection",
    (event: PromiseRejectionEvent) => {
      logger.error("Unhandled promise rejection:", event.reason);
      recordCrash(event.reason, "unhandledrejection");
      showFatalStatus(t("status.initError"));
    },
  );
}

const controller = new AppController();
controller.init().catch((err: unknown) => {
  logger.error("App initialization failed:", err);
  recordCrash(err, "AppController.init");
  showFatalStatus(t("status.initError"));
});
