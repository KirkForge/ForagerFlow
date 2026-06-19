export { CameraService } from "./camera";
export type { CaptureResult } from "./camera";
export { registerServiceWorker, updateOnlineStatus } from "./connectivity";
export {
  saveIdentification,
  getHistory,
  clearHistory,
  exportHistory,
  importHistory,
} from "./history";
export type { HistoryEntry, HistoryBackup } from "./history";
// deleteEntry is dynamically imported in app.ts for code-splitting.
export { processFileInput } from "./image-input";
export { initWebVitals } from "./web-vitals";
