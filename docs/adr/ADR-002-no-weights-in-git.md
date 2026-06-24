# ADR-002: ONNX weights excluded from git, shipped via release assets

**Status:** Accepted  
**Date:** 2026-06

## Context

The ONNX models are ~90 MB and ~330 MB. Committing them to git would make the repo unusably large and slow to clone.

## Decision

Weights are gitignored (`pwa/model/*.onnx`). The `release.yml` workflow runs the export scripts on a tagged release and attaches the compiled `dist/` bundle (including weights) as a GitHub Release asset.

## Rationale

- Git is not designed for large binary blobs; no LFS dependency needed
- Developers run `python export_bvra_onnx.py` and `python export_dima806_onnx.py` locally to populate `pwa/model/` before running `pnpm dev`
- Release assets are versioned and downloadable independently of the source tree
- CI does not require weights — typecheck, lint, test, and build all pass without them; e2e tests use a stub model

## Consequences

- New contributor setup requires a one-time download of ~1 GB of PyTorch checkpoints from HuggingFace to export ONNX locally
- The export scripts must be kept in sync with model versions; documented in README
