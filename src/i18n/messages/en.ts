import type { Messages } from "../types";

export const enMessages: Messages = {
  // App meta
  "app.title": "ForagerFlow",
  "app.ariaLabel": "ForagerFlow mushroom identifier",
  "app.online": "Online",
  "app.offline": "Offline",

  // Model selection
  "model.label": "Model:",
  "model.ariaLabel": "Select inference model",
  "model.bvra": "Specialist (215 classes, ~90 MB)",
  "model.dima806": "General (100 classes, ~330 MB)",

  // Camera
  "camera.ariaLabel": "Live camera preview",
  "capture.ariaLabel": "Capture and identify mushroom",
  "camera.error": "Camera unavailable.",
  "camera.retry": "Retry camera",
  "camera.choosePhoto": "Choose a photo",
  "fileInput.ariaLabel": "Select an image file",

  // Status / misc
  "status.cameraActive": "Camera active. Tap shutter to identify.",
  "status.cameraError": "Camera error. Try file input.",
  "status.cameraNotReady": "Camera not ready. Wait a moment.",
  "status.identifying": "Identifying…",
  "status.processImageError": "Failed to process image.",
  "status.initError": "Failed to initialize. Please reload.",
  "status.clearHistoryError": "Failed to clear history.",
  "status.historyExported": "History exported.",
  "status.exportHistoryError": "Failed to export history.",
  "status.historyImported": "Imported {{count}} history entries.",
  "status.importHistoryError": "Failed to import history.",

  // Results
  "results.region": "Inference results",
  "status.loading": "Loading...",
  "predictions.region": "Top predictions",
  "knowledge.region": "Species details",
  "warning.region": "Warning",
  "prediction.verifyOnline": "Verify this species online →",
  "prediction.verifyAriaLabel": "Verify {{species}} online (opens in new tab)",
  "prediction.edible": "Edible",
  "prediction.unknown": "Unknown",
  "prediction.poisonous": "POISONOUS",
  "prediction.openDetailsAria": "Show details for {{species}}",

  // Detail panel
  "detail.title": "Species details",
  "detail.closeAria": "Close species details",
  "detail.confidence": "{{pct}}% raw confidence",
  "detail.calibratedScore": "{{pct}}% calibrated",
  "detail.edibility": "Edibility",
  "detail.safetyReminder":
    "Never eat a wild mushroom based solely on this app. Always verify with a certified mycologist.",
  "confidence.reliabilityHigh": "High reliability",
  "confidence.reliabilityMedium": "Medium reliability",
  "confidence.reliabilityLow": "Low reliability",

  // Comparison
  "comparison.title": "Compare species",
  "comparison.closeAria": "Close comparison",
  "comparison.toggle": "Compare",
  "comparison.show": "Show comparison",
  "comparison.selectAria": "Select {{species}} for comparison",
  "comparison.maxReached": "Max {{max}} species",

  // Warnings
  "warning.lowConfidence": "Low confidence — do not act on this prediction.",
  "warning.toxicLookalike":
    "Cannot rule out a toxic lookalike. Do not consume. Always verify with a certified expert.",
  "warning.poisonous":
    "This prediction indicates a potentially poisonous species. Do not consume. Always verify with a certified expert.",
  "warning.unknown":
    "Edibility unknown or unverified for this species. Do not consume without positive identification by a certified mycologist.",

  // Knowledge
  "knowledge.fallbackNotes":
    'No edibility data on file for "{{species}}". Treating as potentially poisonous; do not consume and verify with a certified mycologist.',
  "knowledge.noData": "No data available.",

  // History
  "history.region": "Identification history",
  "history.title": "History",
  "history.export": "Export",
  "history.import": "Import",
  "history.importFileAria": "History backup file",
  "history.clear": "Clear",
  "history.clearAria": "Clear all history",
  "history.exportAria": "Export history to file",
  "history.importAria": "Import history from file",
  "history.empty": "No past identifications yet.",
  "history.lastIdentification": "Last identification",
  "history.thumbnailAlt": "Thumbnail for {{species}}",
  "history.confidence": "{{prob}}% confidence",
  "history.deleteEntryAria": "Delete this entry",
  "history.loadError": "Unable to load history.",
  "history.location": "Location: {{lat}}, {{lng}}",

  // Location toggle
  "location.enabled": "GPS tagging enabled (local only).",
  "location.disabled": "GPS tagging disabled.",
  "location.active": "Location captured: {{lat}}, {{lng}}",
  "location.denied": "Location denied — check device permissions.",
  "location.unavailable": "Location unavailable right now.",
  "location.timeout": "Location took too long.",

  // Safety footer
  "safety.footer.text": "Never eat a wild mushroom based on this app.",
  "safety.footer.findMycologist": "Find a mycologist",

  // Safety modal
  "safety.modal.title": "Before you identify a mushroom",
  "safety.modal.p1":
    "ForagerFlow runs AI inference on your phone. It can be wrong — including about whether a mushroom is safe to eat. Misidentification can cause severe illness or death.",
  "safety.modal.p2":
    "Do not eat any wild mushroom based solely on this app. Always verify with a certified mycologist or your local poison control center.",
  "safety.modal.bullet1": "Top-1 confidence is not a safety guarantee.",
  "safety.modal.bullet2":
    '"Edible" in the result panel is a model output, not a recommendation.',
  "safety.modal.bullet3":
    "This app is offline; it cannot call any safety service.",
  "safety.modal.ackLabel":
    "I understand this app is not a substitute for expert identification.",
  "safety.modal.continue": "Continue",

  // Model confirm modal
  "modelConfirm.title": "Download a 330 MB model?",
  "modelConfirm.body":
    "The General (dima806) model will be downloaded on first use and cached for offline use. This may take a moment on a slow connection and will use approximately 330 MB of your device's storage.",
  "modelConfirm.cancel": "Cancel",
  "modelConfirm.download": "Download",

  // Storage confirm modal
  "storageConfirm.title": "Low device storage",
  "storageConfirm.body":
    "Your device reports {{freeMB}} MB of free storage. The selected model needs {{modelSize}}. Continue anyway?",
  "storageConfirm.cancel": "Cancel",
  "storageConfirm.continue": "Continue anyway",

  // Clear confirm modal
  "clearConfirm.title": "Clear all history?",
  "clearConfirm.body":
    "This will permanently remove every saved identification on this device. This cannot be undone.",
  "clearConfirm.cancel": "Cancel",
  "clearConfirm.clearAll": "Clear all",

  // Status / misc
  "status.error": "Error: {{message}}",
  "status.displayError": "Error displaying result.",
};
