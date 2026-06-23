import type { Messages } from "../types";

export const daMessages: Messages = {
  // App meta
  "app.title": "ForagerFlow",
  "app.ariaLabel": "ForagerFlow svampeidentifikation",
  "app.online": "Online",
  "app.offline": "Offline",

  // Model selection
  "model.label": "Model:",
  "model.ariaLabel": "Vælg identifikationsmodel",
  "model.bvra": "Specialist (215 arter, ~90 MB)",
  "model.dima806": "Generel (100 arter, ~330 MB)",

  // Camera
  "camera.ariaLabel": "Live kameravisning",
  "capture.ariaLabel": "Tag billede og identificér svamp",
  "camera.error": "Kameraet er ikke tilgængeligt.",
  "camera.retry": "Prøv kamera igen",
  "camera.choosePhoto": "Vælg et foto",
  "fileInput.ariaLabel": "Vælg en billedfil",

  // Status / misc
  "status.cameraActive": "Kamera aktiv. Tryk på lukkeren for at identificere.",
  "status.cameraError": "Kamerafejl. Prøv filindtastning.",
  "status.cameraNotReady": "Kameraet er ikke klar. Vent et øjeblik.",
  "status.identifying": "Identificerer…",
  "status.processImageError": "Kunne ikke behandle billedet.",
  "status.initError": "Initialisering mislykkedes. Genindlæs venligst.",
  "status.clearHistoryError": "Kunne ikke rydde historikken.",
  "status.historyExported": "Historik eksporteret.",
  "status.exportHistoryError": "Kunne ikke eksportere historikken.",
  "status.historyImported": "Importerede {{count}} historikposter.",
  "status.importHistoryError": "Kunne ikke importere historikken.",

  // Results
  "results.region": "Identifikationsresultater",
  "status.loading": "Indlæser...",
  "predictions.region": "Top forslag",
  "knowledge.region": "Artens detaljer",
  "warning.region": "Advarsel",
  "prediction.verifyOnline": "Bekræft arten online →",
  "prediction.verifyAriaLabel":
    "Bekræft {{species}} online (åbner nyt faneblad)",
  "prediction.edible": "Spiselig",
  "prediction.unknown": "Ukendt",
  "prediction.poisonous": "GIFTIG",
  "prediction.openDetailsAria": "Vis detaljer for {{species}}",

  // Detail panel
  "detail.title": "Artens detaljer",
  "detail.closeAria": "Luk artens detaljer",
  "detail.confidence": "{{pct}}% rå sikkerhed",
  "detail.calibratedScore": "{{pct}}% kalibreret",
  "detail.edibility": "Spiselighed",
  "detail.safetyReminder":
    "Spis aldrig en vild svamp baseret udelukkende på denne app. Få altid bekræftet af en autoriseret svampekyndig.",
  "confidence.reliabilityHigh": "Høj pålidelighed",
  "confidence.reliabilityMedium": "Middel pålidelighed",
  "confidence.reliabilityLow": "Lav pålidelighed",

  // Warnings
  "warning.lowConfidence": "Lav sikkerhed — handle ikke på dette resultat.",
  "warning.toxicLookalike":
    "Kan ikke udelukke en giftig forvekslingsart. Spis den ikke. Få altid bekræftet af en ekspert.",
  "warning.poisonous":
    "Resultatet peger på en potentielt giftig art. Spis den ikke. Få altid bekræftet af en ekspert.",
  "warning.unknown":
    "Spiselighed er ukendt eller ikke bekræftet for denne art. Spis den ikke uden positiv identifikation af en autoriseret svampekyndig.",

  // Knowledge
  "knowledge.fallbackNotes":
    'Ingen spiselighedsdata for "{{species}}". Behandles som potentielt giftig; spis den ikke og få bekræftet af en autoriseret svampekyndig.',
  "knowledge.noData": "Ingen data tilgængelige.",

  // History
  "history.region": "Identifikationshistorik",
  "history.title": "Historik",
  "history.export": "Eksportér",
  "history.import": "Importér",
  "history.importFileAria": "Historik-sikkerhedskopi",
  "history.clear": "Ryd",
  "history.clearAria": "Ryd al historik",
  "history.exportAria": "Eksportér historik til fil",
  "history.importAria": "Importér historik fra fil",
  "history.empty": "Ingen tidligere identifikationer endnu.",
  "history.lastIdentification": "Seneste identifikation",
  "history.thumbnailAlt": "Miniaturebillede af {{species}}",
  "history.confidence": "{{prob}}% sikkerhed",
  "history.deleteEntryAria": "Slet denne post",
  "history.loadError": "Kunne ikke indlæse historikken.",
  "history.location": "Sted: {{lat}}, {{lng}}",

  // Location toggle
  "location.enabled": "GPS-tagning aktiveret (kun lokalt).",
  "location.disabled": "GPS-tagning slået fra.",
  "location.active": "Placering registreret: {{lat}}, {{lng}}",
  "location.denied": "Placering afvist — tjek enhedens tilladelser.",
  "location.unavailable": "Placering ikke tilgængelig lige nu.",
  "location.timeout": "Placering tog for lang tid.",

  // Safety footer
  "safety.footer.text": "Spis aldrig en vild svamp baseret på denne app.",
  "safety.footer.findMycologist": "Find en svampekyndig",

  // Safety modal
  "safety.modal.title": "Før du identificerer en svamp",
  "safety.modal.p1":
    "ForagerFlow kører AI-analyse på din telefon. Den kan tage fejl — også om hvorvidt en svamp er sikker at spise. Fejlidentifikation kan forårsage alvorlig sygdom eller død.",
  "safety.modal.p2":
    "Spis aldrig en vild svamp udelukkende baseret på denne app. Få altid bekræftet af en autoriseret svampekyndig eller dit lokale giftinformationscenter.",
  "safety.modal.bullet1": "Top-1-sikkerhed er ikke en sikkerhedsgaranti.",
  "safety.modal.bullet2":
    '"Spiselig" i resultatpanelet er en modeloutput, ikke en anbefaling.',
  "safety.modal.bullet3":
    "Appen er offline; den kan ikke ringe til nogen nødtjeneste.",
  "safety.modal.ackLabel":
    "Jeg forstår, at denne app ikke erstatter ekspertidentifikation.",
  "safety.modal.continue": "Fortsæt",

  // Model confirm modal
  "modelConfirm.title": "Download en 330 MB model?",
  "modelConfirm.body":
    "Den generelle (dima806) model downloades ved første brug og caches til offline brug. Det kan tage et øjeblik på en langsom forbindelse og bruger cirka 330 MB af enhedens lagerplads.",
  "modelConfirm.cancel": "Annullér",
  "modelConfirm.download": "Download",

  // Storage confirm modal
  "storageConfirm.title": "Lav lagerplads på enheden",
  "storageConfirm.body":
    "Din enhed rapporterer {{freeMB}} MB ledig lagerplads. Den valgte model kræver {{modelSize}}. Fortsæt alligevel?",
  "storageConfirm.cancel": "Annullér",
  "storageConfirm.continue": "Fortsæt alligevel",

  // Clear confirm modal
  "clearConfirm.title": "Ryd al historik?",
  "clearConfirm.body":
    "Dette fjerner permanent alle gemte identifikationer på denne enhed. Det kan ikke fortrydes.",
  "clearConfirm.cancel": "Annullér",
  "clearConfirm.clearAll": "Ryd alt",

  // Status / misc
  "status.error": "Fejl: {{message}}",
  "status.displayError": "Fejl ved visning af resultat.",
};
