# Engineering Guide

This document is for anyone touching the ForagerFlow codebase. It explains the
architecture, the quality gates, and the workflows that keep the project
maintainable as it grows toward the best offline-first Danish mushroom-hunting
PWA/APK.

## Table of contents

1. [Stack and layout](#stack-and-layout)
2. [Architecture overview](#architecture-overview)
3. [Offline-first mechanics](#offline-first-mechanics)
4. [TypeScript and code quality](#typescript-and-code-quality)
5. [Testing](#testing)
6. [Verification pipeline](#verification-pipeline)
7. [Code intelligence with GitNexus](#code-intelligence-with-gitnexus)
8. [Internationalisation](#internationalisation)
9. [Security and dependencies](#security-and-dependencies)
10. [Where to start](#where-to-start)

## Stack and layout

- **Build tool:** Vite 6 with the PWA plugin (`vite-plugin-pwa`).
- **Language:** TypeScript 5.8, ES2022 target, strict mode enabled.
- **Test runner:** Vitest 4 with `jsdom` and the `v8` coverage provider.
- **E2E:** Playwright.
- **Linting:** ESLint 9 flat config plus a custom rule for raw UI strings.
- **Formatting:** Prettier.
- **Web runtime:** ONNX Runtime Web loaded as a classic script in the Worker.
- **Android wrapper:** Trusted Web Activity (TWA) via
  `androidbrowserhelper:2.5.0`.

Top-level directories:

```
src/              Application source
tests/            Vitest unit / integration tests
e2e/              Playwright end-to-end tests
scripts/          Build, verification, and utility scripts
public/           Static assets served as-is
docs/             Product and engineering documentation
pwa/              ONNX model export inputs/outputs (gitignored weights)
twa/              Minimal Android TWA shell
```

## Architecture overview

The app is intentionally thin on state management. The browser is the runtime,
and most heavy lifting is delegated to two ONNX models.

### Entry points

- `src/main.ts` boots the app, initialises the locale, and registers the service
  worker.
- `src/app.ts` (`AppController`) owns the camera, the inference service, the
  results renderer, and the history flow.
- `src/sw.ts` is the service worker. It is excluded from unit-test coverage
  because it runs in a separate browser runtime.
- `src/worker.ts` is the classic Worker entry point. It loads ONNX Runtime and
  runs inference off the main thread.

### Inference path

1. `AppController` delegates to `InferenceService` (`src/inference/service.ts`).
2. `InferenceService` creates a classic Worker and streams model downloads with
   `ReadableStream` + `content-length` progress reporting.
3. The Worker (`src/worker.ts` / `src/inference/worker-logic.ts`) runs the model
   with the `wasm` execution provider and returns logits.
4. `generatePredictionReport` (`src/inference/results.ts`) converts logits into
   calibrated, edibility-aware predictions.

### UI structure

UI controllers live in `src/ui/` and are intentionally decoupled from the
inference details:

- `ResultsRenderer` – draws prediction cards and warnings.
- `SafetyUI` – mandatory safety modal, storage confirmations, clear/model
  guards.
- `SpeciesDetailPanel` / `HistoryDetailPanel` – detail views.
- `PredictionComparisonPanel` – side-by-side comparison.

Shared helpers are in `src/ui/utils.ts`. `requireElement()` is the single typed
DOM query helper used across panels; it throws a descriptive error and guards
that the returned node is an `HTMLElement`. `show()`/`hide()` toggle a
`.hidden` class instead of touching inline styles so the CSP can drop
`'unsafe-inline'` from `style-src`. User-visible text must go through the
` t()` helper (see [Internationalisation](#internationalisation)).

## Offline-first mechanics

The app is designed to work without a network once installed.

- **App shell:** the service worker caches the shell versioned by the build
  and serves a static offline fallback HTML page when navigation fails. Shell
  assets are cached individually so one missing asset does not abort the whole
  install.
- **Model caching:** range-request slicing caches `.onnx` and `.wasm` files
  efficiently, even when the cached response omitted `Content-Length`. Range
  responses are recomputed from the stored body. `navigator.storage.estimate()`
  is checked before large downloads.
- **History:** IndexedDB via `fake-indexeddb` in tests and the native API in the
  browser.
- **Installability:** the PWA manifest, icons, and service-worker scope make the
  app installable from the browser. The TWA wrapper turns the same static bundle
  into an Android APK.

## TypeScript and code quality

`tsconfig.json` enables the strictest practical set of checks, including:

- `noUncheckedIndexedAccess`
- `noUnusedLocals` / `noUnusedParameters`
- `exactOptionalPropertyTypes`
- `noImplicitReturns`
- `noPropertyAccessFromIndexSignature`

### Linting

`pnpm lint` runs ESLint over `src/`, `tests/`, and `scripts/*.cjs`. The flat
config in `eslint.config.js` includes:

- `typescript-eslint` recommended and type-aware rules.
- `eslint-plugin-import` for module ordering.
- A custom rule `local/no-raw-ui-strings` (`eslint-rules/no-raw-ui-strings.cjs`)
  that warns when raw user-visible text is assigned to `textContent`,
  `innerHTML`, `createEl(..., text)`, or visible `setAttribute` calls.

If a raw string is intentional (e.g. a test fixture), disable it inline:

```ts
// eslint-disable-next-line local/no-raw-ui-strings
const el = createEl("div", "cls", "fixture");
```

## Testing

Tests live next to the code in `tests/` and use Vitest with `globals: true`.

- `tests/helpers/` contains shared promise flushes and fixture factories.
- `tests/*.test.ts` cover the corresponding `src/` modules.
- `tests/sw.test.ts` exercises the Service Worker in a Node environment
  (install, activate, navigation fallback, model range requests, and
  stale-while-revalidate static assets). The `src/sw.ts` and `src/worker.ts`
  entry points remain excluded from coverage thresholds because they run in
  separate browser runtimes.

Coverage thresholds are set to **80%** for branches, functions, lines, and
statements in `vitest.config.ts`.

Run the relevant commands:

```bash
pnpm test:ci            # fast CI run
pnpm test:coverage      # with coverage report and threshold enforcement
```

## Verification pipeline

`pnpm verify` is the local pre-push gate. It runs:

1. `pnpm typecheck` – `tsc --noEmit`.
2. `pnpm lint` – ESLint.
3. `pnpm test:ci` – Vitest.
4. `pnpm build` – Vite production build.
5. `pnpm verify:dist` – smoke tests the built `dist/` bundle.
6. `pnpm verify:labels` – checks BVRA/dima806 label alignment.
7. `pnpm verify:bundle` – ensures the main bundle stays under the gzip budget.

CI runs the same steps plus secret scanning, dependency audit, and Playwright
E2E.

## Code intelligence with GitNexus

The repository is indexed by GitNexus as **ForagerFlow**. Use the GitNexus MCP
tools for impact analysis and change detection.

Workflow for edits:

1. Before changing a symbol, run `impact({ target: "symbolName", direction:
   "upstream" })` and report the blast radius.
2. Do not proceed if the risk is HIGH or CRITICAL without a plan.
3. Before committing, run `detect_changes({ scope: "compare", base_ref: "main" })`
   to confirm the affected symbols match expectations.
4. If the index feels stale, refresh it with `node .gitnexus/run.cjs analyze` or,
if the runner is missing, `npx gitnexus analyze`.

## Internationalisation

The app is **Danish-first**.

- `src/i18n/types.ts` declares supported locales (`da`, `en`) and a default of
  `da`.
- `src/i18n/messages/da.ts` and `src/i18n/messages/en.ts` hold the message
  catalogues.
- `t(key)` resolves the current locale, falls back to English, and interpolates
  `{{param}}` placeholders.
- `applyStaticI18n()` translates elements with `data-i18n-key` attributes after
  locale switches.

Any new user-facing string must be added to both catalogues and loaded via `t()`
to satisfy the `local/no-raw-ui-strings` lint rule.

## Security and dependencies

- No user credentials, no cookies, no third-party trackers by default.
- The `index.html` CSP drops `'unsafe-inline'` from `script-src` and `style-src`;
  `'wasm-unsafe-eval'` is kept only for ONNX Runtime.
- Telemetry is opt-in via `navigator.sendBeacon` and only sends the configured
  endpoint. Events are scrubbed before sending: long strings are truncated,
  image/location/user-like keys are redacted, and unknown event keys are dropped.
- ONNX models are downloaded from the same origin or a trusted host; the service
  worker enforces caching and the CSP allows `wasm-unsafe-eval` only for the
  ONNX runtime.
- Dependency updates are audited in CI; known-audit failures are patched with
  `pnpm.auditConfig.ignoreCves` only as a last resort.

## Where to start

- **Fixing a bug:** run `pnpm test:ci` first, add a failing test in `tests/`, fix
  the source, then run `pnpm verify`.
- **Adding a feature:** open `src/app.ts` and the relevant `src/ui/` controller.
  Check impact with GitNexus before changing shared symbols.
- **Raising coverage:** find uncovered lines in the `pnpm test:coverage` report,
  add focused tests, and keep the 80% thresholds green.
- **Danish copy:** edit `src/i18n/messages/da.ts`, mirror the change in
  `src/i18n/messages/en.ts`, and never hard-code the string in source.
