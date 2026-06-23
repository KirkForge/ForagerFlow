import { AppController } from "@/app";
import { logger } from "@/core/logger";
import { initLocale, t } from "@/i18n";

initLocale();

const controller = new AppController();
controller.init().catch((err: unknown) => {
  logger.error("App initialization failed:", err);
  const status = document.getElementById("status");
  if (status) {
    status.textContent = t("status.initError");
  }
});
