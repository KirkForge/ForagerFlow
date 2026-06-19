# Changelog

Format follows [Keep a Changelog](https://keepachangelog.com).

## [Unreleased]

### Added
- History thumbnails generated for camera frames and file inputs.
- Expanded test suite: IndexedDB history, camera, image-utils, inference-service, and safety-UI tests.
- Telemetry pipeline: localStorage buffering, optional `sendBeacon` sink, dev console sink; gated by feature flag.
- Playwright e2e smoke tests: first-run safety acknowledgement and reload persistence.
- First-run safety modal using native `<dialog>` with acknowledgement persistence.
- Sticky safety footer.
- Capture button busy state to prevent double submits.
- Camera-permission fallback button that triggers the file input.
- Last-identification callout above the viewfinder.
- Clear-history confirmation modal.
- dima806 model gating: size warning on first use and pre-load storage confirmation when free space is below threshold.
- "Verify this species online" link that opens a Google search in a new tab.
- `verify:dist` and `verify:inference` scripts.

### Changed
- `scripts/test-inference.py` now has explicit `smoke` and `top5` modes; `package.json` calls the smoke mode. Smoke passes for both exported ONNX models.
- `InferenceService` uses explicit callback handlers (`onStatus`, `onResult`, `onError`, `onStorageConfirm`) instead of an event emitter.
- `src/services/history.ts` split into `history/index.ts` + dynamically imported `history/delete-entry.ts`.
- `scripts/verify-labels.cjs` now reads from `src/data/`.
- README corrected: removed false CI/format/audit claims, clarified dima806 gating, and dropped references to unimplemented `VITE_TELEMETRY_BUFFER_SIZE`.
- CONTRIBUTING.md architecture section updated to match the current callback-based service and removed references to `TypedEmitter`/`ApplicationState`.
- AGENTS.md trimmed: removed generic server-security checklist irrelevant to a client-side PWA and reduced the GitNexus section to a pointer to `CLAUDE.md`.
- `.env.example` and `src/core/config.ts` trimmed to the actually implemented `VITE_FEATURE_TELEMETRY`; removed unimplemented feature flags and `VITE_TELEMETRY_BUFFER_SIZE`.
- `InferenceService` label-mismatch error now uses `expectedLabelCount` consistently.
- `PredictionReport.hasPoisonousInTop3` renamed to `hasRiskInTop3` to reflect that "Unknown" edibility is also treated as a risk.
- `getEdibilityClass()` and `createEl()` moved from `app.ts` to new `src/ui/utils.ts` so `app.ts` does not export internal helpers.
- CSS variable `--muted` removed in favor of `--text-muted`; verbose HTML/CSS comments trimmed.

### Removed
- Legacy `pwa/index.html`, `pwa/sw.js`, `pwa/css/style.css`, and `pwa/js/*`. `pwa/model/` remains the export target.
- Dead `src/data/index.ts` barrel (nothing imported `@/data`).
- Redundant re-export of `META_STORE_NAME` from `src/services/history/db.ts`.
- Unused `ImageBitmap`/`OffscreenCanvas` polyfills in `tests/image-utils.test.ts`.
- Redundant `src/index.html` from `vitest.config.ts` coverage exclusions.

### Fixed
- Vite "mixed dynamic+static import" warning for `src/services/history.ts`.
- README inconsistency about the `pwa/` directory and test count.
- In-app safety message could be missed by returning users; it is now shown before camera access with a persistent sticky footer.
- Privacy policy no longer claims telemetry is buffered in `localStorage`; it logs or beacons depending on configuration.
- Model card warning description now matches the code (toxic lookalike warning fires when top-1 confidence is below 85%).
- `scripts/test-dist.py` references to the model-copy script now point to `copy-models-to-dist.cjs`.
- `logger.debug` no longer silently drops output outside dev; it logs whenever the level allows.
- `src/ui/safety.ts` indentation for `bindStorageConfirmFromService`.
- `tests/results.test.ts` unknown-species test now actually exercises an `Unknown` edibility in the top 3.

## [2.1.0] — 2025-05-28

### Added
- TypedEmitter for type-safe InferenceService events.
- Inference retry with exponential backoff (up to 3 retries).
- Inference queue for requests made while the model is loading.
- `ApplicationState` enum.
- HTML sanitization helpers.
- Telemetry system with structured metrics and Web Vitals collection.
- Runtime `config` module with env-var overrides.
- Barrel exports across `core`, `inference`, `services`, `ui`, and `data`.
- CI security audit and license-check steps.
- CONTRIBUTING.md and this CHANGELOG.md.
- Tests: `emitter.test.ts`, `sanitize.test.ts`, `telemetry.test.ts`, `connectivity.test.ts`, `image-input.test.ts`.

### Changed
- InferenceService now extends `TypedEmitter<InferenceEvents>`.
- `on("result")` callback receives `{ logits, modelKey }`.
- `InferenceService.terminate()` clears the inference queue and removes listeners.
- `ci.sh` uses `pnpm` and adds `typecheck` and `verify:labels`.
- History rendering sanitizes all dynamic content.
- CSS custom properties for history panel styles.

### Fixed
- Duplicate `<script>` tag in `index.html`.
- Undefined CSS variables in history panel styles.
- `LabelMismatchError` used for logit/label mismatches.

## [2.0.0] — 2025-05-20

### Added
- Offline-first PWA for mushroom identification.
- Two ONNX models: BVRA Specialist (215 classes) and Dima806 General (100 classes).
- Camera capture and file upload input.
- IndexedDB-backed identification history.
- Service Worker with versioned caching.
- Docker deployment via nginx with security headers.
- GitHub Actions CI pipeline.
- Vitest test suite with coverage thresholds.
