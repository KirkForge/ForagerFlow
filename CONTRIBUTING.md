# Contributing to ForagerFlow

## Development Setup

1. **Prerequisites**: Node.js 22+, pnpm 10+
2. **Install**: `pnpm install --frozen-lockfile`
3. **Dev server**: `pnpm dev`
4. **Run checks before committing**:
   ```bash
   pnpm typecheck   # TypeScript type checking
   pnpm lint         # ESLint
   pnpm test         # Vitest unit tests
   pnpm build        # Production build
   ```

## Project Structure

```
src/
  core/         — Shared types, errors, logger, config, telemetry
  data/         — Model registry, labels, knowledge JSON
  inference/    — Worker, service, softmax, results
  services/     — Camera, connectivity, history, image-input, web-vitals
                  (history/ is a sub-folder: index.ts is the static
                   barrel, delete-entry.ts is the dynamic-import sub-module)
  ui/           — Results renderer, SafetyUI (first-run modal, sticky
                  footer, capture-busy state, model-picker gate, storage
                  confirm, clear-history confirm)
  css/          — Stylesheet
  app.ts        — App controller
  main.ts       — Entry point
  sw.ts         — Service worker
  index.html     — SPA shell
tests/          — Unit tests (Vitest + jsdom)
scripts/        — CI helpers, label verification, built-dist smoke test,
                  real-ONNX inference smoke test
pwa/            — Export target and ONNX drop directory. Contains only
                  pwa/model/ (the BVRA canonical class list and the
                  exported *.onnx / *.onnx.data files).
public/         — Static assets copied verbatim into dist/ by Vite.
                  Contains the vendored ort.min.js + ort-wasm-* files
                  and manifest.webmanifest.
dist/           — Build output. The deployable.
```

## Code Style

- **TypeScript strict mode** is enabled. All code must pass `pnpm typecheck`.
- **ESLint** with `strictTypeChecked` + `stylisticTypeChecked` configs.
- **Prettier** formatting. Run `pnpm lint:fix` before pushing.
- **Commit format**: `type(scope): message` — feat, fix, docs, refactor, test, chore, wip.
- **Package manager**: Always use `pnpm`. Never use `npm install`.

## Architecture

### Inference Pipeline
1. `AppController` → `InferenceService` (callback handlers) → Web Worker
2. Worker loads the ONNX model, preprocesses pixels, runs inference
3. Results flow back: Worker → `InferenceService` → `AppController` → `ResultsRenderer`
4. `InferenceService` retries recoverable worker errors up to 3 times with exponential backoff
5. Requests made while the model is loading are queued and flushed when ready
6. `inferenceService.switchModel()` checks `navigator.storage.estimate()` before large model loads and invokes the registered storage-confirm handler so the UI can gate the download

### State Management
- `config` module for feature flags and env-var overrides
- `SafetyUI` owns all dialogs and the sticky footer; `AppController` blocks on it before opening the camera

### Error Handling
- Custom errors extend `AppError` with `code` and `recoverable` flags
- `LabelMismatchError` for model/logit count mismatches
- Worker errors trigger automatic retry with backoff
- `sanitizeText()` for user-visible strings

### Persistence
- Identification history stored in IndexedDB via `services/history/index.ts`
- Per-row deletion lives in `services/history/delete-entry.ts` and is dynamically imported by the click handler
- Service Worker caches the app shell (versioned) and models (lazy)

## Testing

- Run: `pnpm test`
- Coverage: `pnpm test:coverage` runs but currently exits non-zero because global thresholds (70%) are not met. Use it to inspect uncovered code; rely on `pnpm test` for the green gate.
- Test files live in `tests/` and use `@/` path aliases matching `src/`
- Mock browser APIs (IndexedDB, camera, canvas) in unit tests
- Never skip tests. If a test is flaky, mark it with `.skip()` and file an issue.

## Pull Request Checklist

- [ ] `pnpm typecheck` passes
- [ ] `pnpm lint` passes
- [ ] `pnpm test` passes
- [ ] `pnpm build` succeeds
- [ ] `pnpm verify:labels` passes (label/logit alignment)
- [ ] `pnpm verify:dist` passes (built-asset smoke test)
- [ ] Secret scan passes (`trufflehog filesystem . --only-verified --no-update --exclude-paths=.trufflehog-exclude.txt --fail`)
- [ ] No secrets or large files committed
- [ ] Commit messages follow `type(scope): message` format

## Release Process

1. Update `version` in `package.json`
2. Update `CHANGELOG.md` with changes
3. Commit: `chore(release): v2.x.y`
4. Push to `main`; CI builds and validates
5. Tag: `git tag v2.x.y && git push --tags`
6. Docker image built via `Dockerfile` for production deployment
