# Changelog

All notable changes to ForagerFlow are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com).

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
