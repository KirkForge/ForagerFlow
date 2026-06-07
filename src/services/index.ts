export { CameraService } from "./camera";
export type { CaptureResult } from "./camera";
export { registerServiceWorker, updateOnlineStatus } from "./connectivity";
export {
  saveIdentification,
  getHistory,
  clearHistory,
} from "./history";
export type { HistoryEntry } from "./history";
// `deleteEntry` is intentionally NOT re-exported here: it lives in
// ./history/delete-entry.ts and is dynamically imported by main.ts
// when a history row's delete button is tapped. Re-exporting it would
// re-introduce the static-import path that broke Vite's code-splitting.
export { processFileInput } from "./image-input";
export { initWebVitals } from "./web-vitals";
