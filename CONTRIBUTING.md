# Contributing to ForagerFlow

Thank you for your interest in contributing! This guide covers the essentials.

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
  core/         — Shared types, errors, logger, config, telemetry, emitter
  data/         — Model registry, labels, knowledge JSON
  inference/    — Worker, service, softmax, results
  services/     — Camera, connectivity, history, image-input, web-vitals
  ui/           — Results renderer
  css/          — Stylesheet
  main.ts       — App controller (entry point)
  sw.ts         — Service worker
  index.html     — SPA shell
tests/          — Unit tests (Vitest + jsdom)
scripts/        — CI helpers, label verification, model download
pwa/            — Legacy standalone PWA (not built from src/)
```

## Code Style

- **TypeScript strict mode** is enabled. All code must pass `pnpm typecheck`.
- **ESLint** with `strictTypeChecked` + `stylisticTypeChecked` configs.
- **Prettier** formatting. Run `pnpm lint:fix` before pushing.
- **Commit format**: `type(scope): message` — feat, fix, docs, refactor, test, chore, wip.
- **Package manager**: Always use `pnpm`. Never use `npm install`.

## Architecture

### Inference Pipeline
1. `AppController` → `InferenceService` (TypedEmitter) → Web Worker
2. Worker loads ONNX model, preprocesses pixels, runs inference
3. Results flow back: Worker → InferenceService → AppController → ResultsRenderer
4. Auto-retry on recoverable errors (max 3 retries with exponential backoff)
5. Inference requests are queued when model is still loading

### State Management
- `ApplicationState` enum tracks app lifecycle: Loading → CameraActive → Processing → Done
- `TypedEmitter` provides type-safe event binding
- `config` module provides runtime feature flags and settings

### Error Handling
- All custom errors extend `AppError` with `code` and `recoverable` flags
- `LabelMismatchError` for model/logit count mismatches
- Worker errors trigger automatic retry with backoff
- `sanitizeText()` is used for all user-visible strings in innerHTML

### Persistence
- Identification history stored in IndexedDB via `services/history.ts`
- Service Worker caches app shell (versioned) and models (lazy)

## Testing

- Run: `pnpm test`
- Coverage: `pnpm test:coverage` (threshold: 70% branches/functions/lines/statements)
- Test files live in `tests/` and use `@/` path aliases matching `src/`
- Mock browser APIs (IndexedDB, camera, canvas) in unit tests
- Never skip tests. If a test is flaky, mark it with `.skip()` and file an issue.

## Pull Request Checklist

- [ ] `pnpm typecheck` passes
- [ ] `pnpm lint` passes
- [ ] `pnpm test` passes
- [ ] `pnpm build` succeeds
- [ ] No secrets or large files committed
- [ ] Commit messages follow `type(scope): message` format

## Release Process

1. Update `version` in `package.json`
2. Update `CHANGELOG.md` with changes
3. Commit: `chore(release): v2.x.y`
4. Push to `main`; CI builds and validates
5. Tag: `git tag v2.x.y && git push --tags`
6. Docker image built via `Dockerfile` for production deployment
