# Changelog

All notable changes to ForagerFlow are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com).

## [Unreleased]

### Fixed
- **`pnpm verify:inference` was wired to a script that required an image
  input** but the package.json was passing model + label paths. Rewrote
  `scripts/test-inference.py` with two explicit modes: `smoke` (zero-input
  shape + finiteness check, matches the gate `release.yml` runs in-workflow)
  and `top5` (the previous e2e image-based top-5 helper, kept as a dev tool).
  `package.json` now invokes `python3 scripts/test-inference.py smoke ...`.
  Running the smoke test against the locally-exported ONNX weights passes
  for both `fungitastic.onnx` (215 classes) and `dima806.onnx` (100).

### Added
- **History thumbnails.** Camera frames and file inputs generate a small JPEG thumbnail via `src/services/image-utils.ts`; the thumbnail is stored with each history entry and rendered in the history list.
- **Expanded test suite.** Added real IndexedDB history tests (`fake-indexeddb`), camera tests, image-utils tests, inference-service tests with a mocked `Worker`, and safety-UI tests. Suite grew to 90 tests across 14 files.
- **Telemetry handlers.** Implemented localStorage buffering with rotation, an optional beacon sink for `VITE_TELEMETRY_ENDPOINT`, and a dev console sink; telemetry is gated by a feature flag and configured via `.env.example`.
- **Playwright e2e smoke tests.** Two tests run against the built `dist/` bundle via `pnpm preview`: first-run safety acknowledgement and persistence across reloads.
- **First-run safety modal.** Full-screen `<dialog>` with a `showModal()` top layer. The "Continue" button is disabled until the acknowledgement checkbox is checked. Acceptance is persisted in `localStorage["ff:safety-ack-v1"]`.
- **Sticky safety footer.** Always-visible 32 px band at the bottom of the viewport with the text *"Never eat a wild mushroom based on this app."*
- **Capture button busy state.** `data-busy="true"` disables the button and shows a spinner while inference runs, preventing double submits.
- **Camera-permission fallback.** A full-width "Choose a photo" button taps the hidden file input when camera access is unavailable.
- **Last-identification callout.** The most recent history entry is shown above the camera viewfinder on startup; hidden when history is empty.
- **Clear-history confirm modal.** Requires confirmation before deleting IndexedDB history.
- **dima806 capability gate.** Hidden on low-memory or slow-connection devices; on capable devices, first use shows a size warning and caches acceptance in `localStorage["ff:dima-confirm-v1"]`.
- **Pre-model-load storage confirm.** `inferenceService.switchModel()` checks `navigator.storage.estimate()` and shows a confirm modal when free space is below 500 MB; acceptance resumes the load via `resumeStorageConfirm(token)`.
- **Verify-this-species link.** Each top-1 prediction appends a Google search anchor built with `URL`/`searchParams` to prevent host injection.
- **`pnpm verify:dist` and `pnpm verify:inference` scripts.** Wired `scripts/test-dist.py` and `scripts/test-inference.py` into `package.json` for CI gating.

### Changed
- **README cleanup.** Removed the false claim that CI runs "No Python" and corrected the `pnpm e2e:ci` description to `CI=true playwright test`. Added Configuration section pointing at `.env.example`. Tightened Safety and Repository name sections.
- **`src/services/history.ts` split into a barrel + dynamic sub-module.** Static imports live in `history/index.ts`; `deleteEntry` is dynamically imported from `history/delete-entry.ts` for code splitting, removing the mixed-import build warning.
- **`scripts/verify-labels.cjs` repointed at `src/data/`.** Now compares `src/data/labels-bvra.json` against `pwa/model/fungitastic-classes.json` and checks knowledge coverage. `pwa/model/` remains the export target and source of truth for the BVRA class list.
- **README rewrite.** Corrected `pwa/` and test-count claims, pointed Setup at `dist/`, and documented safety UI behavior.
- **`InferenceService` event map extended** with `storageConfirm: { modelKey, freeBytes, token }`.

### Removed
- **Legacy `pwa/` app directory.** Removed `pwa/index.html`, `pwa/sw.js`, `pwa/css/style.css`, `pwa/manifest.json`, and `pwa/js/*`. `pwa/model/` remains the export target.

### Fixed
- **Vite "mixed dynamic+static import" build warning** for `src/services/history.ts` — see Changed.
- **README inconsistency** that claimed `pwa/` was served and that there were 56 tests.
- **In-app safety message** could be missed by returning users; it is now shown before camera access with a persistent sticky footer.

## [2.1.0] — 2025-05-28

### Added
- **TypedEmitter**: Type-safe event emitter replacing loose `.on()` pattern in InferenceService
- **Inference retry**: Auto-retry with exponential backoff (up to 3 retries) for recoverable worker errors
- **Inference queue**: Requests made while model is loading are now queued and flushed when ready
- **AppState machine**: `ApplicationState` enum tracks Loading → CameraActive → Processing → Done
- **HTML sanitization**: `escapeHtml()` and `sanitizeText()` prevent XSS in dynamic content
- **Telemetry system**: `recordTelemetry()`, `measureAsync()`, `measureSync()` for structured metrics
- **Web Vitals**: LCP, CLS, TTFB collection via PerformanceObserver → telemetry pipeline
- **Runtime config**: `config` module with feature flags and env-var overrides (`VITE_*`)
- **Barrel exports**: `core/index.ts`, `inference/index.ts`, `services/index.ts`, `ui/index.ts`, `data/index.ts`
- **CI security**: `pnpm audit` and license-check step added to GitHub Actions
- **CONTRIBUTING.md**: Full contribution guide with architecture overview
- **CHANGELOG.md**: This file
- Tests: `emitter.test.ts`, `sanitize.test.ts`, `telemetry.test.ts`, `connectivity.test.ts`, `image-input.test.ts`

### Changed
- **InferenceService** now extends `TypedEmitter<InferenceEvents>` — event handlers are type-safe
- **`on("result")` callback** receives `{ logits, modelKey }` object instead of positional args
- **`InferenceService.terminate()`** now clears inference queue and removes all listeners
- **`ci.sh`** now uses `pnpm` instead of `npm`, adds `typecheck` and `verify:labels` steps
- **History rendering** in `AppController` now sanitizes all dynamic content via `sanitizeText()`
- **CSS**: Added missing custom properties (`--border`, `--surface-1`, `--text-muted`, `--space-*`, `--radius-sm`)

### Fixed
- **Duplicate `<script>` tag** in `index.html` removed
- **Undefined CSS variables** in history panel styles now resolve correctly
- **`LabelMismatchError`** now used instead of generic `AppError` for logit/label mismatches
- **`ci.sh`** was using `npm` — now uses `pnpm` per project rules

## [2.0.0] — 2025-05-20

### Added
- Offline-first PWA for mushroom identification
- Two ONNX models: BVRA Specialist (215 classes) and Dima806 General (100 classes)
- Camera capture and file upload input
- IndexedDB-backed identification history
- Service Worker with versioned caching
- Docker deployment via nginx with security headers
- GitHub Actions CI pipeline
- Vitest test suite with coverage thresholds
