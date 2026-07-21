# ADR-001: ONNX Runtime Web for in-browser inference

**Status:** Accepted  
**Date:** 2026-06

## Context

Mushroom identification requires running a CNN model. Options: server-side inference (cloud API or self-hosted), WebAssembly in browser, native app with on-device model.

## Decision

ONNX Runtime Web (`onnxruntime-web`) running inside the PWA — fully in-browser, no server.

## Rationale

- Zero network dependency after first load: works offline in the field where connectivity is unreliable
- No server costs or infrastructure to operate
- Model exports from PyTorch via `torch.onnx.export`; ONNX Runtime Web runs the same graph in the browser via WASM or WebGL backend
- Privacy: photos are never sent off-device

## Consequences

- ONNX weights are large (~90–330 MB); managed via the release workflow (`release.yml`) rather than committed to git
- First-load download is significant; mitigated by service worker caching after initial fetch
- Inference is slower than native; acceptable for identification latency (< 2.5s p95 on the CI runner CPU, gated in `release.yml`)
- WebGL backend falls back to WASM if unavailable — WASM is the safe baseline
