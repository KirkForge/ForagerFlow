# Changelog

Format follows [Keep a Changelog](https://keepachangelog.com).

## [Unreleased]

### Changed
- Verified P0a (Sentry telemetry) and P0b (honest latency gate 2500ms) landed and green.

### Added
- ADR-001 (ONNX Runtime Web in-browser inference) and ADR-002 (ONNX weights excluded from git, shipped via release assets).
- Service Worker unit tests (`tests/sw.test.ts`) covering install, activate, navigation fallback, `.onnx`/`.wasm` range responses, and stale-while-revalidate static assets.
- Shared typed DOM query helper `requireElement()` in `src/ui/utils.ts` with a runtime `instanceof HTMLElement` guard and descriptive error labels.
- `show()`, `hide()`, and `isHidden()` helpers in `src/ui/utils.ts` plus a `.hidden` CSS class to replace inline `style="display: none"` toggles.
- Worker command validation in `src/inference/worker-logic.ts` for `switch` and `infer` messages.
- Telemetry scrubbing in `src/core/telemetry.ts`: caps string/array/object size, redacts image/location/user-like keys, and drops unknown event keys.
- Global `error` and `unhandledrejection` handlers in `src/main.ts` to surface a fatal init status.
- Engineering guide: `docs/engineering.md`.
- Custom ESLint rule `local/no-raw-ui-strings` to keep user-visible text in the i18n catalogue.
- Test coverage for error classes, telemetry edge cases, assetlinks generation, SafetyUI flows, i18n edge cases, and history validation paths.
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
- CSP in `src/index.html`: removed `'unsafe-inline'` from `script-src` and `style-src` while keeping `'wasm-unsafe-eval'` for ONNX Runtime.
- Service Worker install now caches shell assets individually so a single 404 does not abort the whole install.
- `createRangedResponse` in `src/sw-utils.ts` reads the cached body once and can satisfy byte ranges even when the cached response omitted `Content-Length`.
- History import validation in `src/services/history/index.ts` now enforces strict id format, top-1 consistency, and truncates long notes.
- `setMeta()` in `src/services/history/db.ts` now rejects when the IndexedDB transaction aborts.
- Worker inference now rejects when the model output is missing or empty instead of returning an empty logits array.
- CI trigger branches reduced to `[main, dev]` (dropped `master`); PRs target `main`.
- Vitest coverage thresholds raised to **80%** for branches, functions, lines, and statements.
- TypeScript `noImplicitReturns` enabled and all code/tests updated.
- `scripts/generate-assetlinks.cjs` refactored to exported functions for unit-test coverage.
- `src/app.ts` "Error displaying result." status copy moved to the i18n catalogue and loaded via `t("status.displayError")`.
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
- `CLAUDE.md` untracked from the repository (now gitignored; project instructions live in local config).
- Dead `CameraService.focusSupported()` method and its tests.
- Unwired `ResultsRendererOptions.onComparisonChange` option and `emitComparisonChange()`.
- Private `require()` / `req()` wrappers across UI panels and `AppController`; replaced by shared `requireElement()`.
- Legacy `pwa/index.html`, `pwa/sw.js`, `pwa/css/style.css`, and `pwa/js/*`. `pwa/model/` remains the export target.
- Dead `src/data/index.ts` barrel (nothing imported `@/data`).
- Redundant re-export of `META_STORE_NAME` from `src/services/history/db.ts`.
- Unused `ImageBitmap`/`OffscreenCanvas` polyfills in `tests/image-utils.test.ts`.
- Redundant `src/index.html` from `vitest.config.ts` coverage exclusions.

### Fixed
- Toxic-lookalike warning could be suppressed when top-1 was confident and edible; now it fires whenever a poisonous or unknown species appears in the top-3.
- Missing `Content-Length` header in worker download progress no longer produces a silent NaN path; it uses `"0"` and falls back to untracked buffering.
- Unhandled promise rejection inside the worker message handler now posts an error back to the main thread.
- Silent partial-import on IndexedDB put failure: import now rejects if any individual `store.put` fails.
- Empty/corrupt logits from ONNX no longer silently produce a garbage inference result.
- Lint and type errors in newly expanded test files after enabling stricter TypeScript and the raw-UI-string rule.
- Vite "mixed dynamic+static import" warning for `src/services/history.ts`.
- README inconsistency about the `pwa/` directory and test count.
- In-app safety message could be missed by returning users; it is now shown before camera access with a persistent sticky footer.
- Privacy policy no longer claims telemetry is buffered in `localStorage`; it logs or beacons depending on configuration.
- Model card warning description now matches the code (toxic-lookalike warning fires whenever a poisonous or unknown species appears in the top-3).
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
