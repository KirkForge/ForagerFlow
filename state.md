# ForagerFlow — State

---

## Code Audit — 2026-06-24 (haiku static analysis)

1. **[CRITICAL] Logic inversion in warning suppression** — `src/inference/results.ts:91`
   - Gate `hasRiskInTop3 && calibratedScore < 0.75` silently drops the toxic-lookalike warning when confidence ≥ 0.75 — exactly backwards. Fix: remove confidence condition from the lookalike branch; warn unconditionally when Poisonous/Unknown in top-k.

2. **[Med] Silent NaN flow from missing content-length header** — `src/inference/worker-logic.ts:106`
   - `Number(resp.headers.get("content-length") ?? NaN)` — missing header → NaN → `Number.isFinite()` gate fails silently, falls through to untracked buffering without progress reporting. Fix: use `?? "0"` and validate.

3. **[Med] Unhandled promise rejection in worker message handler** — `src/inference/worker-logic.ts:233`
   - `void handleWorkerMessage(e)` swallows rejections; if inference throws and the catch block itself fails, worker silently stops responding. Fix: add `.catch()` that always posts an error message back to the main thread.

4. **[Med] IndexedDB transaction missing abort handler** — `src/services/history/db.ts:104`
   - `setMeta()` transaction never wires `tx.onabort`; quota exceeded or lock timeout → promise hangs indefinitely. Fix: add `tx.onabort = () => reject(...)`.

5. **[Med] Silent partial-import on IDB put failure** — `src/services/history/index.ts:398–401`
   - `store.put(entry)` in loop has no error handler; a single failed write continues silently and `oncomplete` fires reporting success. Fix: attach `onerror` per request or set `tx.onerror` to reject.

6. **[Low] Logits undefined silently produces garbage inference** — `src/services/history/index.ts:197`
   - `logitsData?.data ?? new Float32Array()` — empty array produces meaningless top-1 with no error. Fix: throw/post error if logits missing before proceeding.

7. **[Low] Cached response missing content-length produces 0-length range slice** — `src/sw-utils.ts:48`
   - Cached response with missing header → NaN in slice calculation. Fix: validate header exists before slicing; fall back to actual buffer size.

8. **[Low] Async cleanup race in safety modal** — `src/ui/safety.ts:72,81`
   - `removeEventListener` called before `modal.close()` completes; `{ once: true }` listeners may re-fire during async close. Fix: ensure close completes before listener removal.

**Resolution:** findings 1–7 addressed in commits `77d3ce3`, `7580e13`, and
`69f1ea9` (CSP hardening, Service Worker tests, shared `requireElement`, worker
validation, telemetry scrubbing, IDB abort/put error handling, and range-response
robustness). Finding 8 remains open and low-priority.

---

## Documentation sync — 2026-06-26

- Updated `CHANGELOG.md` with the recent CSP, Service Worker test, telemetry
  scrubbing, worker validation, IDB hardening, and `requireElement` refactor
  entries.
- Updated `docs/engineering.md` to describe the hardened CSP, offline fallback,
  per-asset SW install, range-response body caching, Service Worker unit tests,
  and shared UI helpers.
- Refreshed this state file and the verification snapshot below.

---

## Gap Audit — verified 2026-07-05

Source: `forager-gaps.md` (15 gaps dated 2026-06-27). Each re-checked against the live codebase.

### 1. R8 Minification Disabled — FIXED
`twa/app/build.gradle.kts:19` — `isMinifyEnabled = true` (+ `isShrinkResources = true`, proguard files wired).

### 2. Android Backup Enabled — FIXED
`twa/app/src/main/AndroidManifest.xml:8` — `android:allowBackup="false"`.

### 3. Model Card Documents Wrong Safety Behavior — FIXED
`docs/model-card.md:42` — now reads "A poisonous or unknown species in the top-3 always triggers an additional warning, regardless of top-1 confidence." Matches the unconditional-warning logic.

### 4. Test Coverage Below 80% Threshold — FIXED
`pnpm test:coverage` run 2026-07-03: global branch coverage 80.72%. `src/services/history/index.ts` branches 85.92%, `src/ui/safety.ts` branches 92.3%. Both above threshold.

### 5. No APK Signing Automation — FIXED
`.github/workflows/release.yml:120-174` — keystore decode + `apksigner sign/verify` + `google-github-actions/upload-to-play@v1` internal track, all gated on `ANDROID_KEYSTORE_BASE64` / `PLAY_SERVICE_ACCOUNT_JSON` secrets; unsigned-APK fallback preserved.

### 6. No Crash/Error Telemetry for Beta — PARTIAL
Goal met (crash signal flows in beta), but NOT via Sentry as the gap specified. `src/core/telemetry.ts:144` `recordCrash()` is a home-rolled beacon recorder (redacts data: URIs / geo, capped lengths), wired into `src/main.ts:18-36` global `error` / `unhandledrejection` handlers + `AppController.init` catch. Gated on `VITE_FEATURE_TELEMETRY` + `VITE_TELEMETRY_ENDPOINT`. No `@sentry/*` dependency; zero new arch, but not the Sentry DSN the gap asked for.

### 7. Async Cleanup Race in Safety Modal — FIXED
`src/ui/safety.ts` — `showConfirmModal` (lines 204-236) uses `{ once: true }` on accept/cancel/cancel-dialog listeners so re-firing during async `modal.close()` is prevented; `init()` submit handler (lines 92-93) calls `close()` before `removeEventListener`. Race closed.

### 8. History Export Unencrypted — FIXED
`src/services/history/crypto.ts` — Web Crypto AES-GCM + PBKDF2-SHA256 (100k iters), `encryptBackup` / `decryptBackup` / `isEncryptedBackup`; zero deps. Toggle + passphrase modal wired through `safety.ts` confirm flow.

### 9. No WiFi-Only Download Guard — FIXED
`src/services/connectivity.ts:31` `isCellularConnection()` (Network Information API `type === "cellular"`, fail-open when unavailable). Wired in `src/inference/service.ts:225` — fires `onNetworkConfirmHandler` before download; `src/ui/safety.ts:189-202` shows network-confirm modal, cancel reverts selector via `cancelNetworkConfirm()`.

### 10. Model Download No Pause/Resume — PARTIAL
`src/inference/worker-logic.ts:172,219-328` — in-worker `PartialDownload` retained on failure; retry re-requests with `Range: bytes=N-` when prior partial exists; 206 vs full-body guard discards stale partial. Same-worker retry resume works. Ceiling persists: partial bytes live in worker scope only — a page reload or idle worker termination loses them (no IndexedDB/Cache persistence of partials). Gap text already documented this ceiling.

### 11. No SBOM Generation — FIXED
`.github/workflows/release.yml:90-97` — Syft installed, `syft . -o cyclonedx-json` produces `foragerflow-<ref>-sbom.json`, uploaded to the GitHub release (line 107).

### 12. No Accessibility CI Gate — FIXED
`package.json:33` `@axe-core/playwright` dep; `e2e/a11y.spec.ts:9` — AxeBuilder WCAG 2.1 AA assertions in the Playwright suite.

### 13. No Offline E2E Tests — FIXED
`e2e/offline.spec.ts` — `context.setOffline(true)` app-shell-from-cache test + `offline.html` precached-on-install test. Note (lines 29-36): WebKit setOffline emulation unsupported, skipped under WebKit with a documented Playwright-known-limitation skip. CI runs WebKit single-worker to avoid flaky timeouts (`playwright.config.ts` webkit project uses `actionTimeout: 15_000`; `.github/workflows/ci.yml` passes `--workers=1` for the WebKit step).

### 14. No Environment Protection on Release Workflow — PARTIAL
`.github/workflows/release.yml:18` — `environment: production` referenced. But the comment (lines 14-17) is explicit: protection rules (required reviewers / wait timer) are NOT yet configured in repo Settings → Environments; the env reference alone enforces nothing until an admin adds them. Code side done; repo-settings side still open.

### 15. Structured Logging Not Enabled for Production — FIXED
`src/core/logger.ts:40-62` — `emit()` branches on `import.meta.env.PROD`: PROD emits one JSON line per call (`ts`, `level`, `app`, `v`, `msg`, `fields`); dev keeps `[FORAGERFLOW]` prefix. No new dependency.

**Tally**: 12 FIXED, 0 STILL-OPEN, 3 PARTIAL (#6 crash telemetry via custom beacon not Sentry; #10 resume survives same-worker retries only; #14 environment reference present but protection rules unconfigured).

---

## External Reviews — 2026-06-24

### GPT-5 Architectural Review

**TL;DR:** "A safety-critical-ish consumer ML app hiding inside a simple PWA." The moment a user asks "Can I eat this?" you're next to a high-consequence decision. The good news: this repo is more mature about that than most AI apps.

**Strengths:**
- Offline ONNX inference is exactly right for field use (no signal, battery constraints, privacy)
- Safety model is unusually responsible — model card explicitly says "not a safety or edibility certification"
- Fail-closed behavior: missing knowledge for a predicted species is treated as potentially poisonous
- Dual model approach (specialist + general) is clever; question is routing

**Gaps:**

1. **Confidence ≠ reliability** — Model saying 97% means "internally certain," not "97% chance this identification is correct." Need: calibration curves, uncertainty messaging, "similar species" output. Instead of `Amanita X — 91%`, show `Looks similar to Amanita X. Similar-looking species include A/B/C. Confidence: medium.`
2. **The dangerous UX moment is after the result** — User psychology: they took a photo, they want an answer, the model gives one, brain says "the computer said it." Strongest safety feature should be the interface, not the model. Show verification checklist after every result.
3. **Dataset coverage** — 215 specialist / 100 general classes sounds reasonable, but failure case is "confidently labels a dangerous lookalike." Need a lookalike graph: photo → prediction → similar dangerous species → verification checklist.
4. **Model update provenance** — Store source model hash, export script version, ONNX checksum, label mapping version. "Can I prove exactly what model produced this answer?"
5. **Telemetry caution** — Even opt-in anonymous image apps create sensitive metadata (location, timing, species interest, habits). Keep minimal.
6. **Expert feedback loop** — Future: user says "I think this was wrong," submits photo + corrected species, builds regional corrections and hard examples.

**Roadmap:**
- Next: add lookalike warnings, regional species packs, improve calibration, add expert correction flow
- Later: habitat notes, GPS-free journaling, seasonal reminders, personal mushroom log

**Product angle:** Not "AI mushroom identifier" but "Offline field companion for safer mushroom exploration." Moat is offline + privacy + safety UX + field workflow, not model accuracy.

---

### Opus Code-Level Review — SAFETY BUG

**The lookalike warning is suppressed exactly when it matters most.**

In `src/inference/results.ts`, `computeWarning(calibratedScore, edibility, hasRiskInTop3)`:

```
if (calibratedScore < 0.5)                      -> low-confidence warning
if (hasRiskInTop3 && calibratedScore < 0.75)    -> toxic-lookalike warning  ← THE GATE
if (edibility === Poisonous && score >= 0.5)    -> poisonous warning
if (edibility === Unknown   && score >= 0.5)    -> unknown warning
else                                            -> NO WARNING
```

**The dangerous scenario:** top-1 is an edible species at high confidence, poisonous species at rank 2 or 3.
- `hasRiskInTop3` = true (poisonous in top-3)
- lookalike rule requires `calibratedScore < 0.75` — a confident prediction is ≥0.75 → **rule doesn't fire**
- top-1 edibility is Edible → poisonous/unknown rules don't fire
- **→ function returns NO WARNING AT ALL**

The confidence gate in `src/inference/confidence.ts` (`score = raw * (0.5 + 0.5*gap)`) only lowers the score when top-1 and top-2 are close. A dominant top-1 with the poisonous species at rank 3 produces a high score and no margin penalty — so suppression holds. This is the classic lethal failure mode: confidently calling a death-cap-adjacent specimen the edible cousin.

**Fix:** presence of a `Poisonous`/`Unknown` species in top-k should raise a warning **regardless of top-1 confidence**. High confidence in the edible class is not evidence against the lookalike. The confidence gate is fine for "is this identifiable at all" — it should not be able to silence a toxic-lookalike notice.

**Smaller note:** the thresholds (0.5 / 0.75) are undocumented magic numbers and the calibration is a hand-built heuristic, not fit to a reliability curve. Pin these to constants with comments explaining why those values were chosen.

**Credit:** genuinely fail-closed parts are real — `missingKnowledgeFallback` returns `Edibility.Poisonous`, and an `Unknown` top-1 above 0.5 does warn. The design instinct is right; it's this one branch interaction that needs fixing.

---

> Project: `KirkForge_Android-Forager` (repo) / **ForagerFlow** (app)  
> Path: `/home/kirk/Madlab/Github/KirkForge_Android-Forager`  
> Updated: 2026-06-23  
> Stack: TypeScript PWA, Vite, ONNX Runtime Web, Service Worker, IndexedDB.

## Purpose

Offline-first mushroom identification PWA. Uses the device camera or a photo picker, runs ONNX inference in the browser, and surfaces species/edibility info with explicit fail-closed warnings. **Does not certify edibility.**

## Phase status

- **Phase 5 — Engineering excellence** ✅ Completed 2026-06-23.
  - Coverage thresholds raised to 80% branches / functions / lines / statements.
  - TypeScript `noImplicitReturns` enabled and codebase updated.
  - Custom ESLint rule `local/no-raw-ui-strings` added to keep UI copy in i18n.
  - Test suite expanded to 359 tests across 31 files.
  - `docs/engineering.md` written and linked from README.
- Next: **Phase 6 — Offline reliability / field hardening** (see Next steps).

## Verification snapshot (2026-07-05)

- `pnpm test:ci` passes: 412/412 tests across 33 files.
- `pnpm verify` passes: typecheck, lint, test:ci, build, verify:dist,
  verify:labels, verify:bundle.
- `pnpm test:coverage` passes with branch coverage 80.72% (above the 80% threshold).
- `pnpm e2e:ci` passes: 10/10 on chromium + firefox.
- WebKit e2e passes single-worker (`--workers=1 --timeout=60000`): 4/4, with the
  offline reload test correctly skipped due to Playwright WebKit's unsupported
  `setOffline` emulation.
- `pnpm audit --audit-level high`: no known vulnerabilities.
- `gitleaks detect --source .` and `trufflehog filesystem .`: no secrets found.
- Real ONNX smoke check (`scripts/test-inference.py`) passes for both models.
- Local `.venv` now contains torch/timm/transformers/onnx/onnxruntime/pillow/numpy,
  so the release export path and `verify:inference` work without relying on the
  system Python.
- GitNexus index currently unavailable (LadybugDB lock); impact analysis was
  attempted but could not be completed; changes are confined to CI/test config.

## Key files map

| Concern | Files |
|---------|-------|
| App controller | `src/app.ts` |
| Entry point | `src/main.ts` |
| Inference | `src/inference/service.ts`, `src/inference/worker.ts`, `src/inference/worker-logic.ts`, `src/inference/results.ts`, `src/inference/softmax.ts` |
| UI | `src/ui/safety.ts`, `src/ui/results.ts`, `src/ui/comparison.ts`, `src/ui/species-detail.ts`, `src/ui/history-detail.ts`, `src/ui/utils.ts` |
| Services | `src/services/camera.ts`, `src/services/image-input.ts`, `src/services/history/*`, `src/services/connectivity.ts`, `src/services/web-vitals.ts` |
| Core/config | `src/core/config.ts`, `src/core/errors.ts`, `src/core/logger.ts`, `src/core/telemetry.ts`, `src/core/sanitize.ts` |
| i18n | `src/i18n/index.ts`, `src/i18n/messages/da.ts`, `src/i18n/messages/en.ts` |
| Offline shell | `src/sw.ts`, `src/sw-utils.ts`, `public/manifest.webmanifest`, `public/icons/` |
| Build / CI | `package.json`, `vite.config.ts`, `vitest.config.ts`, `playwright.config.ts`, `.github/workflows/*.yml`, `Dockerfile`, `scripts/*` |
| Quality guardrails | `eslint.config.js`, `eslint-rules/no-raw-ui-strings.cjs`, `tsconfig.json` |
| TWA / APK | `twa/`, `scripts/generate-assetlinks.cjs`, `scripts/build-twa.cjs`, `public/.well-known/assetlinks.json` |
| Docs | `README.md`, `CHANGELOG.md`, `CONTRIBUTING.md`, `AGENTS.md`, `CLAUDE.md`, `docs/*.md` |

## Next steps (resume here)

### Phase 6 — Offline reliability / field hardening

1. **Network-aware model loading**
   - Add a connection-type / effective-type check before starting large model downloads.
   - Surface a user-visible warning when on metered or slow connections.
   - Gate downloads behind the existing storage-confirm flow and add a "download only on Wi-Fi" option in settings.

2. **Service Worker resilience** (partially done)
   - ✅ Add an offline fallback HTML page served when navigation fails.
   - ✅ Cache shell assets individually so one 404 does not abort install.
   - ✅ Read cached body once in `createRangedResponse` to satisfy ranges without `Content-Length`.
   - ✅ Add Service Worker unit tests (`tests/sw.test.ts`).
   - Still open: retry/backoff for failed range requests in `src/sw-utils.ts` and raising `src/sw-utils.ts` branch coverage.

3. **Storage quota UX**
   - Show estimated model size and free space in the storage-confirm modal.
   - Allow the user to clear old history / thumbnails before downloading a large model.
   - Handle "storage full" gracefully during history save.

4. **GPS / field tagging**
   - Cache the last-known location so the capture button can tag immediately if permission is already granted.
   - Add a setting to disable location capture entirely (exists as toggle; verify it persists and is honoured everywhere).
   - Add geolocation timeout/accuracy tuning.

5. **History robustness**
   - Handle corrupt IndexedDB records during import/load.
   - Add export encryption / compression (optional).
   - Add "export to file" and "import from file" UI entry points.

6. **Test and docs follow-up**
   - ✅ Updated `CHANGELOG.md` and `docs/engineering.md` for the recent hardening commits.
   - Raise branch coverage on `src/services/history/index.ts` (currently 79.16%) and `src/ui/safety.ts` (75%) to stay comfortably above 80%.
   - Add e2e tests for offline navigation and model download cancellation.

### Quick commands for next session

```bash
# Start here
pnpm verify
pnpm test:coverage

# Before editing
# (graphify/gitnexus banned + uninstalled — do not reinstall; do not use `gitnexus analyze`.)
```

## Notes

- **2026-07-17 banned-tool-cruft cleanup (uncommitted, working tree dirty):** 49 staged-for-deletion paths, ALL banned-tool artifacts — `graphify-out/` (GRAPH_REPORT.md, graph.{html,json}, manifest.json, cache/ast/*.json ~45 files, stat-index.json, .graphify_labels.json, .graphify_root) and root `.gitnexusignore`. No source code deleted; no build/CI references the deleted paths. Recommend: commit the deletions, then add `graphify-out/` and `.gitnexusignore` to `.gitignore` to prevent recurrence (currently NOT blocked). Also remove the stale `.gitnexus/` ignore + `gitnexus analyze` comment in `eslint.config.js:86-94` and the `.gitnexus/run.cjs` line above — banned-tool references still living in source/state.
- **CI node version:** `actions/setup-node@v4` pinned to `node-version: 22` in both `ci.yml:28` and `release.yml:48`. Node 22 is current-LTS, not deprecated — leave as-is (do not downgrade to 24). No node-20 pinning remains.
- **ADRs:** 2 (ADR-001 ONNX-in-browser, ADR-002 no-weights-in-git) — both still match code; ADR-001's "<2s on mid-range mobile" still has no benchmark artifact (unchanged from prior review).
- **Remaining (unchanged P0):** production telemetry (Sentry replacing home-rolled beacon); repo Environments `production` protection rules on `release.yml`; inference latency CI gate to back ADR-001's <2s claim.

- `pnpm verify` must stay passing before any new work is pushed.
- ONNX weights in `pwa/model/` are gitignored; do not commit them.
- `state.md` is gitignored; update it as work progresses.
- Current branch: `main`.
- Recent gotchas:
  - custom ESLint rule needs inline suppressions for test fixtures;
  - `noImplicitReturns` requires explicit return types on async/callback boundaries;
  - `HTMLDialogElement.prototype.showModal` must be stubbed in jsdom tests;
  - WebKit e2e needs single-worker execution and a longer action timeout to stay
    stable in CI / on modest dev machines.

## Cross-Project Recurring Patterns (overall review 2026-06-28; fold-in 2026-07-03)
One root pattern across all ten KirkForge repos: the interesting problem gets finished, the boring plumbing gets deferred.
1. Release automation last/never — code ships to git, not users; .releaserc configured, no release.yml; versions drift.
2. Security features scaffolded, not completed — architecture built, last 10% deferred (Dopaflow ENCRYPTION_ENABLED stub; Plugin/PicoSentry signing without sandboxing; BIL approval 2/N actions; PetSense config.yaml never loaded; Packy rate-limiter missing one await).
3. CI is decorative — checks exist but non-blocking or wired to local scripts CI doesn't call (cargo audit continue-on-error; ci.sh vs GH Actions; `lint || true`).
4. Integration tests cut first — unit tests green; real e2e path untested / #[ignore] / unverified.
5. Ops docs lag code docs — ADRs/ARCHITECTURE.md strong; deployment guide / runbook / CHANGELOG / troubleshooting missing.
Applies to this repo:
- 1 (Release automation): largely CLOSED here — `release.yml` exists with ONNX export, build, dist verification, assetlinks, TWA APK build, SBOM, signing + Play upload. Last mile is config: keystore / Play service-account secrets + repo Settings → Environments `production` protection rules (gap #14) not yet set.
- 2 (Security features scaffolded): CLOSED — history export encryption (gap #8), WiFi-only guard (gap #9), R8 minification (gap #1), allowBackup=false (gap #2) all landed in code. One deviation: crash telemetry (gap #6) shipped as a home-rolled beacon, not Sentry — functionally equivalent goal, different stack.
- 3 (CI decorative): NOT a clear fit — this repo's CI gates (80% branch coverage, `pnpm verify`, secret scanning) are blocking and real; a11y axe + offline e2e added to the Playwright suite (gaps #12/#13). No `lint || true` or continue-on-error patterns found.
- 4 (Integration tests cut first): CLOSED — `e2e/offline.spec.ts`, `e2e/a11y.spec.ts`, `e2e/smoke.spec.ts` exist; offline test documents the WebKit setOffline limitation rather than silently skipping.
- 5 (Ops docs lag): PARTIAL — `docs/model-card.md`, `docs/engineering.md`, `CHANGELOG.md` strong; no deployment guide / runbook / troubleshooting doc (release.yml is the de-facto runbook).
